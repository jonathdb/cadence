/**
 * One-time import script: yuhonas/free-exercise-db → Cadence exercise catalog.
 *
 * Source: https://github.com/yuhonas/free-exercise-db (public domain / Unlicense),
 * ~800+ global exercises with still images. Fetches the aggregated dataset JSON,
 * maps each record via `mapFreeExerciseDbRecordWithMedia` (pure, in
 * src/services/exercise-import-map.ts), de-dupes against existing global
 * exercises by normalized name, upserts the `exercises` row, and uploads each
 * source image to the `exercise-media` Storage bucket, recording an
 * `exercise_media` row per uploaded image.
 *
 * Idempotent: safe to re-run. Exercise rows upsert on `(source, external_ref)`
 * (the unique partial index added in migration 20250101000019). Media rows are
 * cleared and re-inserted per exercise on each run so re-running never
 * duplicates media.
 *
 * Usage:
 *   npx tsx scripts/import-free-exercise-db.ts
 *   npx tsx scripts/import-free-exercise-db.ts --limit 20   (smoke test a subset)
 *   npx tsx scripts/import-free-exercise-db.ts --skip-images (rows only, no Storage uploads)
 *
 * Requires SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) and
 * SUPABASE_SERVICE_ROLE_KEY in the environment.
 *
 * _Design: Components §2c. Requirements: 2.1, 2.2, 2.4, 2.8._
 */
import { createClient } from '@supabase/supabase-js';

import {
    FREE_EXERCISE_DB_SOURCE,
    mapFreeExerciseDbRecordWithMedia,
    type FreeExerciseDbRecord,
} from '../src/services/exercise-import-map';

const DATASET_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const IMAGE_BASE_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const STORAGE_BUCKET = 'exercise-media';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// --- CLI flags ---------------------------------------------------------------

function parseArgs(argv: string[]): { limit: number | null; skipImages: boolean } {
  const limitIdx = argv.indexOf('--limit');
  const limit =
    limitIdx !== -1 && argv[limitIdx + 1] ? parseInt(argv[limitIdx + 1], 10) : null;
  const skipImages = argv.includes('--skip-images');
  return { limit: Number.isFinite(limit) ? limit : null, skipImages };
}

/** Normalize a name for de-dupe matching: lowercased, trimmed, whitespace collapsed. */
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

// --- Steps --------------------------------------------------------------------

async function fetchDataset(): Promise<FreeExerciseDbRecord[]> {
  console.log(`Fetching dataset from ${DATASET_URL} ...`);
  const response = await fetch(DATASET_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch dataset: HTTP ${response.status}`);
  }
  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error('Dataset response was not a JSON array');
  }
  console.log(`Fetched ${data.length} source records.`);
  return data as FreeExerciseDbRecord[];
}

/** Existing global exercises, keyed by normalized name, for de-dupe matching. */
async function fetchExistingGlobalExercisesByName(): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  const PAGE_SIZE = 1000;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name')
      .eq('is_global', true)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch existing exercises: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      byName.set(normalizeName(row.name), row.id);
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return byName;
}

/**
 * Upload one source image to the exercise-media bucket and return its
 * storage path + resolved public URL. Never throws — logs and returns null
 * on failure so one bad image doesn't abort the whole import.
 */
async function uploadImage(
  externalRef: string,
  index: number,
  sourceImagePath: string
): Promise<{ storagePath: string; publicUrl: string } | null> {
  try {
    const sourceUrl = `${IMAGE_BASE_URL}${sourceImagePath}`;
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      console.warn(`  ! Skipping image (HTTP ${response.status}): ${sourceUrl}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const storagePath = `${externalRef}/${index}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.warn(`  ! Failed to upload ${storagePath}: ${uploadError.message}`);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    return { storagePath, publicUrl: publicUrlData.publicUrl };
  } catch (err) {
    console.warn(
      `  ! Error uploading image ${sourceImagePath}: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

async function importRecord(
  record: FreeExerciseDbRecord,
  existingByName: Map<string, string>,
  skipImages: boolean
): Promise<'inserted' | 'updated' | 'skipped'> {
  const { row, images } = mapFreeExerciseDbRecordWithMedia(record);

  if (!row.name || row.name.trim() === '') {
    console.warn(`  ! Skipping record with no usable name (id: ${record.id ?? 'unknown'})`);
    return 'skipped';
  }

  const normalizedName = normalizeName(row.name);
  const existingId = existingByName.get(normalizedName);

  let exerciseId: string;
  let outcome: 'inserted' | 'updated';

  if (existingId) {
    // Update in place — preserves the existing id (and any FK references to it).
    const { error } = await supabase.from('exercises').update(row).eq('id', existingId);
    if (error) {
      throw new Error(`Failed to update exercise "${row.name}": ${error.message}`);
    }
    exerciseId = existingId;
    outcome = 'updated';
  } else {
    // Idempotent import on (source, external_ref) — the unique partial index
    // added in migration 20250101000019 (`WHERE source IS NOT NULL AND
    // external_ref IS NOT NULL`). PostgREST's upsert() only targets
    // non-partial unique constraints via `onConflict`, so a partial index
    // can't be used with ON CONFLICT here — check-then-insert/update instead.
    // Covers the case where this exact source record was imported before
    // under a name that has since changed.
    const { data: bySourceRef } = await supabase
      .from('exercises')
      .select('id')
      .eq('source', row.source)
      .eq('external_ref', row.external_ref)
      .maybeSingle();

    if (bySourceRef) {
      const { error } = await supabase.from('exercises').update(row).eq('id', bySourceRef.id);
      if (error) {
        throw new Error(`Failed to update exercise "${row.name}": ${error.message}`);
      }
      exerciseId = bySourceRef.id;
      outcome = 'updated';
    } else {
      const { data, error } = await supabase.from('exercises').insert(row).select('id').single();
      if (error || !data) {
        throw new Error(`Failed to insert exercise "${row.name}": ${error?.message ?? 'no row returned'}`);
      }
      exerciseId = data.id;
      outcome = 'inserted';
    }
    existingByName.set(normalizedName, exerciseId);
  }

  // Re-sync media: clear existing rows for this exercise, then re-upload and
  // re-insert. Keeps re-runs idempotent without needing per-image dedupe logic.
  const { error: deleteMediaError } = await supabase
    .from('exercise_media')
    .delete()
    .eq('exercise_id', exerciseId);

  if (deleteMediaError) {
    console.warn(`  ! Failed to clear existing media for "${row.name}": ${deleteMediaError.message}`);
  }

  if (!skipImages && images.length > 0) {
    const mediaRows: {
      exercise_id: string;
      kind: 'image';
      storage_path: string;
      public_url: string;
      order_index: number;
    }[] = [];

    for (let i = 0; i < images.length; i++) {
      const uploaded = await uploadImage(row.external_ref ?? exerciseId, i, images[i]);
      if (uploaded) {
        mediaRows.push({
          exercise_id: exerciseId,
          kind: 'image',
          storage_path: uploaded.storagePath,
          public_url: uploaded.publicUrl,
          order_index: i,
        });
      }
    }

    if (mediaRows.length > 0) {
      const { error: insertMediaError } = await supabase.from('exercise_media').insert(mediaRows);
      if (insertMediaError) {
        console.warn(`  ! Failed to insert media rows for "${row.name}": ${insertMediaError.message}`);
      }
    }
  }

  return outcome;
}

async function main() {
  const { limit, skipImages } = parseArgs(process.argv.slice(2));

  const records = await fetchDataset();
  const scoped = limit ? records.slice(0, limit) : records;

  console.log(`Importing ${scoped.length} exercise(s)${skipImages ? ' (images skipped)' : ''}...`);

  const existingByName = await fetchExistingGlobalExercisesByName();
  console.log(`Found ${existingByName.size} existing global exercise(s) for de-dupe matching.`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < scoped.length; i++) {
    const record = scoped[i];
    const label = record.name ?? record.id ?? `record ${i}`;
    try {
      const outcome = await importRecord(record, existingByName, skipImages);
      if (outcome === 'inserted') inserted++;
      else if (outcome === 'updated') updated++;
      else skipped++;

      if ((i + 1) % 25 === 0 || i === scoped.length - 1) {
        console.log(`  Progress: ${i + 1}/${scoped.length} (${label})`);
      }
    } catch (err) {
      failed++;
      console.error(`  ! Failed to import "${label}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('');
  console.log('Import complete:');
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Source:   ${FREE_EXERCISE_DB_SOURCE}`);
}

main().catch((err) => {
  console.error('Import failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
