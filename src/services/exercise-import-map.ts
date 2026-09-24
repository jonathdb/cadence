/**
 * free-exercise-db field mapper (pure)
 *
 * Pure, deterministic, side-effect-free mapping from a single
 * [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) source
 * record onto an `exercises` insert row for the Cadence catalog.
 *
 * This module is intentionally kept SEPARATE from `exercise-display.ts` (which
 * handles read-side presentation) so the write-side import logic can evolve
 * without churning the display code. The one-time import script (task 3.3) uses
 * `mapFreeExerciseDbRecord` to build insert rows and `mapFreeExerciseDbRecordWithMedia`
 * to also learn which source images to upload.
 *
 * Guarantees (Property 4 — "Exercise import mapping is total and field-preserving"):
 *  - The mapper is TOTAL: it NEVER throws for ANY input matching the loose
 *    `FreeExerciseDbRecord` shape (including missing/empty/whitespace fields).
 *  - Missing/blank optional source fields map to `null`.
 *  - Every mapped row is a valid `exercises` insert (required `name` and
 *    `primary_muscle_group` are always present, defaulting to safe fallbacks).
 *
 * _Design: Components §2c; Data Models (free-exercise-db field mapping). Requirements 2.1, 2.2._
 */

import type { Database } from '@/types/database.generated';

/** The `exercises` insert row type generated from the database schema. */
export type ExerciseInsert = Database['public']['Tables']['exercises']['Insert'];

/** Constant provenance values for this source. */
export const FREE_EXERCISE_DB_SOURCE = 'free-exercise-db' as const;
export const FREE_EXERCISE_DB_LICENSE = 'Unlicense' as const;

/**
 * Fallback for `primary_muscle_group` when the source record has no
 * `primaryMuscles`. The column is NOT NULL in the schema, so we must provide a
 * value; an empty string keeps the row insertable while signalling "unknown".
 */
export const UNKNOWN_PRIMARY_MUSCLE = '' as const;

/**
 * Loose shape of one free-exercise-db source record.
 *
 * Every field is typed permissively (optional / nullable / `unknown`-ish) on
 * purpose: the mapper must be total over any partially-populated record, so we
 * defensively read rather than trust the shape. The canonical documented shape is:
 *
 * {
 *   id: string (slug), name: string, force: string|null,
 *   level: 'beginner'|'intermediate'|'advanced'|null, mechanic: string|null,
 *   equipment: string|null, primaryMuscles: string[], secondaryMuscles: string[],
 *   instructions: string[], category: string, images: string[]
 * }
 */
export interface FreeExerciseDbRecord {
  id?: string | null;
  name?: string | null;
  force?: string | null;
  level?: string | null;
  mechanic?: string | null;
  equipment?: string | null;
  primaryMuscles?: readonly string[] | null;
  secondaryMuscles?: readonly string[] | null;
  instructions?: readonly string[] | null;
  category?: string | null;
  images?: readonly string[] | null;
}

// --- Small pure helpers -----------------------------------------------------

/** Trim a value to a non-empty string, or return null when blank/non-string. */
function cleaned(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Coerce anything into an array of trimmed non-empty strings (never throws). */
function cleanedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const s = cleaned(item);
    if (s !== null) out.push(s);
  }
  return out;
}

/**
 * Normalize the source `equipment` value.
 *
 * The only normalization mandated by the design is `'body only' → 'bodyweight'`
 * (matched case-insensitively, whitespace-collapsed). Any other non-blank value
 * is passed through trimmed; blank/missing stays `null`.
 */
export function normalizeEquipment(equipment: unknown): string | null {
  const value = cleaned(equipment);
  if (value === null) return null;
  const canonical = value.toLowerCase().replace(/\s+/g, ' ');
  if (canonical === 'body only') return 'bodyweight';
  return value;
}

/**
 * Join step instructions into a single numbered, newline-separated string.
 *
 * Used for BOTH the `instructions` column and (pragmatically) the `explanation`
 * column — see the mapper doc for the rationale. Returns `null` when there are
 * no usable steps so the columns stay nullable for sparse records.
 *
 * Example: ["Set up.", "Press."] → "1. Set up.\n2. Press."
 */
export function joinInstructions(instructions: unknown): string | null {
  const steps = cleanedStringArray(instructions);
  if (steps.length === 0) return null;
  return steps.map((step, i) => `${i + 1}. ${step}`).join('\n');
}

/**
 * Derive a short "what it is" description line from record metadata.
 *
 * PRAGMATIC derivation (documented, not over-engineered): a single sentence built
 * from whatever metadata is present, of the shape
 *   "{name} is a {level} {mechanic} {category} exercise targeting {primaryMuscle}."
 * Missing pieces are simply omitted so the sentence still reads naturally. Returns
 * `null` only when there is not even a name to describe.
 *
 * Examples:
 *  - full:  "Barbell Squat is a beginner compound legs exercise targeting quadriceps."
 *  - sparse (name only): "Barbell Squat is an exercise."
 */
export function deriveDescription(record: FreeExerciseDbRecord): string | null {
  const name = cleaned(record.name);
  if (name === null) return null;

  const level = cleaned(record.level);
  const mechanic = cleaned(record.mechanic);
  const category = cleaned(record.category);
  const primaryMuscle = cleanedStringArray(record.primaryMuscles)[0] ?? null;

  // Middle qualifiers between "a/an" and "exercise" (level, mechanic, category).
  const qualifiers = [level, mechanic, category].filter(
    (q): q is string => q !== null
  );

  const article = startsWithVowelSound(qualifiers[0] ?? 'exercise') ? 'an' : 'a';
  const middle = qualifiers.length > 0 ? `${qualifiers.join(' ')} ` : '';
  const target = primaryMuscle ? ` targeting ${primaryMuscle}` : '';

  return `${name} is ${article} ${middle}exercise${target}.`;
}

/** Rough article selector: does a word start with a vowel sound? (a/e/i/o/u). */
function startsWithVowelSound(word: string): boolean {
  return /^[aeiou]/i.test(word.trim());
}

// --- Core mapper ------------------------------------------------------------

/**
 * Map a single free-exercise-db source record to an `exercises` insert row.
 *
 * PURE and TOTAL — never throws (Property 4). Field mapping (per design Data Models):
 *  - `external_ref`            ← `id` (source slug)
 *  - `source`                  ← 'free-exercise-db'
 *  - `source_license`          ← 'Unlicense'
 *  - `name`                    ← trimmed `name` (falls back to '' if missing)
 *  - `primary_muscle_group`    ← `primaryMuscles[0]` (falls back to '' — column is NOT NULL)
 *  - `secondary_muscle_groups` ← `secondaryMuscles[]` (empty array when absent)
 *  - `instructions`            ← numbered/newline-joined `instructions[]`
 *  - `explanation`             ← SAME joined instructions text (pragmatic beginner
 *                                how-to; a richer generated explanation is deferred —
 *                                see design §2c "optional" / task 17.1)
 *  - `description`             ← derived one-line "what it is" (see `deriveDescription`)
 *  - `equipment`               ← normalized ('body only' → 'bodyweight'); null stays null
 *  - `level`/`mechanic`/`force`/`category` ← copied as-is (trimmed, nullable)
 *  - `is_global`               ← true
 *  - `user_id`                 ← null
 *
 * `id`, `created_at`, `updated_at` are left unset so the database assigns defaults.
 */
/**
 * The `exercises.level` column has a CHECK constraint allowing only
 * `beginner` | `intermediate` | `advanced` (migration 20250101000019). The
 * free-exercise-db source additionally uses `expert` for its hardest tier —
 * normalize that down to `advanced` (the DB's top tier) rather than letting
 * the insert fail the constraint. Any other/unrecognized value is dropped to
 * `null` rather than risk a constraint violation on values not seen yet.
 */
function normalizeLevel(level: unknown): 'beginner' | 'intermediate' | 'advanced' | null {
  const value = cleaned(level);
  if (value === null) return null;
  const lower = value.toLowerCase();
  if (lower === 'beginner' || lower === 'intermediate' || lower === 'advanced') {
    return lower;
  }
  if (lower === 'expert') return 'advanced';
  return null;
}

export function mapFreeExerciseDbRecord(record: FreeExerciseDbRecord): ExerciseInsert {
  const instructions = joinInstructions(record.instructions);

  return {
    external_ref: cleaned(record.id),
    source: FREE_EXERCISE_DB_SOURCE,
    source_license: FREE_EXERCISE_DB_LICENSE,
    name: cleaned(record.name) ?? '',
    primary_muscle_group:
      cleanedStringArray(record.primaryMuscles)[0] ?? UNKNOWN_PRIMARY_MUSCLE,
    secondary_muscle_groups: cleanedStringArray(record.secondaryMuscles),
    instructions,
    // Pragmatic choice: reuse the numbered instruction steps as the beginner
    // explanation. free-exercise-db has no separate simple explanation, and a
    // generated one is explicitly deferred (design §2c optional, task 17.1).
    explanation: instructions,
    description: deriveDescription(record),
    equipment: normalizeEquipment(record.equipment),
    level: normalizeLevel(record.level),
    mechanic: cleaned(record.mechanic),
    force: cleaned(record.force),
    category: cleaned(record.category),
    is_global: true,
    user_id: null,
  };
}

/**
 * Result of {@link mapFreeExerciseDbRecordWithMedia}: the insert row plus the
 * ordered list of source image paths the import script (task 3.3) must upload.
 */
export interface MappedExerciseWithMedia {
  /** The `exercises` insert row. */
  row: ExerciseInsert;
  /** Source `images[]` (trimmed, blanks removed, original order preserved). */
  images: string[];
}

/**
 * Convenience companion that maps the record AND returns its source `images[]`
 * alongside, so the import script knows which media to upload for each row.
 *
 * The core field mapper (`mapFreeExerciseDbRecord`) stays pure and media-free;
 * this wrapper simply pairs it with the cleaned image list. Also pure/total.
 */
export function mapFreeExerciseDbRecordWithMedia(
  record: FreeExerciseDbRecord
): MappedExerciseWithMedia {
  return {
    row: mapFreeExerciseDbRecord(record),
    images: cleanedStringArray(record.images),
  };
}
