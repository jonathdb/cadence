/**
 * Exercise Display Service (pure)
 *
 * Pure, deterministic, side-effect-free helpers for presenting exercises in the
 * detail view. Two responsibilities:
 *
 *  1. `normalizeExerciseForDisplay` — turns a raw `exercises` row (any combination
 *     of the new enrichment fields present or null) plus its `exercise_media` rows
 *     into a complete, non-optional view model, substituting placeholders for every
 *     missing field. It NEVER throws, so legacy records (all new fields null) still
 *     produce a valid view model.
 *     _Design: Components §2d; Error Handling (legacy/partial records). Requirement 2.6._
 *     _Property 2: Legacy exercise records render without error._
 *
 *  2. `computeAttribution` — maps a `source` + `source_license` to attribution text
 *     that is NON-EMPTY iff the license mandates attribution (e.g. CC-BY / CC-BY-SA
 *     and variants) and EMPTY for public-domain licenses (Unlicense, CC0, public
 *     domain, etc.).
 *     _Design: Components §2d; Requirement 2.8._
 *     _Property 3: Attribution is shown exactly when the source license requires it._
 *
 * This module is UI-free (no React). It only computes plain data.
 */

import type { Database } from '@/types/database.generated';

/** Raw `exercises` row as generated from the database schema. */
export type ExerciseRow = Database['public']['Tables']['exercises']['Row'];

/** Raw `exercise_media` row as generated from the database schema. */
export type ExerciseMediaRow = Database['public']['Tables']['exercise_media']['Row'];

// --- Placeholders -----------------------------------------------------------

/** Placeholder strings used when a field is missing/null on a record. */
export const DISPLAY_PLACEHOLDERS = {
  name: 'Unnamed exercise',
  description: 'No description available yet.',
  explanation: 'No step-by-step explanation available yet.',
} as const;

// --- View-model types -------------------------------------------------------

/** A single labeled chip (metadata pill) rendered in the detail view. */
export interface ExerciseChip {
  /** Stable category key, useful for keys/styling (e.g. 'level', 'muscle'). */
  kind:
    | 'level'
    | 'mechanic'
    | 'force'
    | 'category'
    | 'equipment'
    | 'primaryMuscle'
    | 'secondaryMuscle';
  /** Human-readable label already suitable for display. */
  label: string;
}

/** A normalized media item for the ordered media list. */
export interface ExerciseMediaViewModel {
  id: string;
  /** One of 'image' | 'gif' | 'video' (kept as string; source is unconstrained). */
  kind: string;
  /** Resolved public URL if available, else null (component shows a placeholder). */
  url: string | null;
  storagePath: string;
  orderIndex: number;
}

/** Attribution info derived from source + license. */
export interface ExerciseAttribution {
  /**
   * Attribution text to display. Non-empty ONLY when the license mandates
   * attribution; empty string ('') when no attribution is required.
   */
  text: string;
  /** True iff `text` is non-empty (the license mandates attribution). */
  required: boolean;
}

/** Complete, non-optional view model for the exercise detail view. */
export interface ExerciseDisplayViewModel {
  id: string;
  /** Always present (placeholder substituted for empty/missing). */
  name: string;
  /** Always present (placeholder substituted for null/empty). */
  description: string;
  /** Always present (placeholder substituted for null/empty). */
  explanation: string;
  /** True when a real description existed (not a placeholder). */
  hasDescription: boolean;
  /** True when a real explanation existed (not a placeholder). */
  hasExplanation: boolean;
  /** Ordered metadata chips (may be empty). */
  chips: ExerciseChip[];
  /** Ordered media list (may be empty). */
  media: ExerciseMediaViewModel[];
  /** Attribution (empty text + required:false when none is mandated). */
  attribution: ExerciseAttribution;
}

// --- Helpers ----------------------------------------------------------------

/** True for null/undefined/blank-or-whitespace strings. */
function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim() === '';
}

/** Trim a string, returning null when it is blank. */
function cleaned(value: string | null | undefined): string | null {
  if (isBlank(value)) return null;
  return (value as string).trim();
}

/** Normalize a license identifier for matching: lowercased, collapsed spaces,
 *  and separators (`-`, `_`, `.`) reduced to single spaces. Deterministic. */
function normalizeLicense(license: string): string {
  return license
    .toLowerCase()
    .replace(/[\s_.-]+/g, ' ')
    .trim();
}

// --- Attribution logic ------------------------------------------------------

/**
 * Public-domain / no-attribution license markers. If a normalized license
 * matches any of these, attribution is NOT required (empty text).
 */
const PUBLIC_DOMAIN_LICENSES: readonly string[] = [
  'unlicense',
  'cc0',
  'cc0 1 0',
  'cc0 1 0 universal',
  'public domain',
  'pd',
  'wtfpl',
];

/**
 * Determine whether a source license mandates attribution.
 *
 * Rules (pure, deterministic):
 * - Missing/blank license → no attribution required.
 * - Public-domain markers (Unlicense, CC0, public domain, ...) → not required.
 * - Any Creative Commons Attribution variant (CC-BY, CC-BY-SA, CC-BY-NC, ...) →
 *   required. Detected by the presence of a `by` token in a `cc ...` license.
 * - Other explicit "attribution required" families (e.g. MIT/BSD/Apache carry an
 *   attribution obligation for the notice) → required.
 *
 * Kept intentionally small and side-effect-free so it is easy to unit/property test.
 */
export function licenseRequiresAttribution(
  license: string | null | undefined
): boolean {
  if (isBlank(license)) return false;

  const norm = normalizeLicense(license as string);

  // Explicit public-domain / no-attribution set.
  if (PUBLIC_DOMAIN_LICENSES.includes(norm)) return false;

  const tokens = norm.split(' ').filter(Boolean);

  // Creative Commons: attribution required iff it includes the "by" element.
  // (CC0 is already excluded above and has no "by" token.)
  if (tokens.includes('cc') || tokens.includes('creative') || tokens.includes('by')) {
    if (tokens.includes('by')) return true;
    // A bare "cc"/"creative commons" without "by" (rare) → treat as no attribution.
    return false;
  }

  // Other permissive licenses that carry an attribution/notice obligation.
  const attributionFamilies = ['mit', 'bsd', 'apache', 'isc', 'zlib'];
  if (tokens.some((t) => attributionFamilies.includes(t))) return true;

  // Unknown license → err toward requiring attribution to stay compliant.
  return true;
}

/**
 * Compute attribution info from a source + license.
 *
 * Returns non-empty `text` iff `licenseRequiresAttribution(license)` is true,
 * empty `text` otherwise. The text names the source (when known) and the license.
 */
export function computeAttribution(
  source: string | null | undefined,
  sourceLicense: string | null | undefined
): ExerciseAttribution {
  const required = licenseRequiresAttribution(sourceLicense);
  if (!required) {
    return { text: '', required: false };
  }

  const src = cleaned(source);
  const lic = cleaned(sourceLicense);

  let text: string;
  if (src && lic) {
    text = `Source: ${src} (${lic})`;
  } else if (src) {
    text = `Source: ${src}`;
  } else if (lic) {
    text = `Licensed under ${lic}`;
  } else {
    // required === true implies license was non-blank, so this is unreachable,
    // but keep a safe non-empty fallback.
    text = 'Attribution required';
  }

  return { text, required: true };
}

// --- Chips ------------------------------------------------------------------

function buildChips(exercise: ExerciseRow): ExerciseChip[] {
  const chips: ExerciseChip[] = [];

  const level = cleaned(exercise.level);
  if (level) chips.push({ kind: 'level', label: level });

  const mechanic = cleaned(exercise.mechanic);
  if (mechanic) chips.push({ kind: 'mechanic', label: mechanic });

  const force = cleaned(exercise.force);
  if (force) chips.push({ kind: 'force', label: force });

  const category = cleaned(exercise.category);
  if (category) chips.push({ kind: 'category', label: category });

  const equipment = cleaned(exercise.equipment);
  if (equipment) chips.push({ kind: 'equipment', label: equipment });

  const primary = cleaned(exercise.primary_muscle_group);
  if (primary) chips.push({ kind: 'primaryMuscle', label: primary });

  for (const secondary of exercise.secondary_muscle_groups ?? []) {
    const label = cleaned(secondary);
    if (label) chips.push({ kind: 'secondaryMuscle', label });
  }

  return chips;
}

// --- Media ------------------------------------------------------------------

function buildMedia(media: readonly ExerciseMediaRow[] | null | undefined): ExerciseMediaViewModel[] {
  if (!media || media.length === 0) return [];

  return [...media]
    .sort((a, b) => {
      const ai = a.order_index ?? 0;
      const bi = b.order_index ?? 0;
      if (ai !== bi) return ai - bi;
      // Stable tiebreak on id for determinism.
      return String(a.id).localeCompare(String(b.id));
    })
    .map((m) => ({
      id: String(m.id),
      kind: cleaned(m.kind) ?? 'image',
      url: cleaned(m.public_url),
      storagePath: m.storage_path,
      orderIndex: m.order_index ?? 0,
    }));
}

// --- Normalizer -------------------------------------------------------------

/**
 * Normalize a raw exercise row (+ its media rows) into a complete view model.
 *
 * Never throws. Every missing/null field is replaced by a placeholder or an empty
 * collection, so both fully-enriched and legacy (all-new-fields-null) records
 * produce a valid, renderable view model.
 *
 * @param exercise - Raw `exercises` row (new enrichment fields may be null).
 * @param media - The exercise's `exercise_media` rows (any order; may be empty/undefined).
 */
export function normalizeExerciseForDisplay(
  exercise: ExerciseRow,
  media?: readonly ExerciseMediaRow[] | null
): ExerciseDisplayViewModel {
  const name = cleaned(exercise.name) ?? DISPLAY_PLACEHOLDERS.name;

  const realDescription = cleaned(exercise.description);
  const realExplanation = cleaned(exercise.explanation);

  return {
    id: String(exercise.id),
    name,
    description: realDescription ?? DISPLAY_PLACEHOLDERS.description,
    explanation: realExplanation ?? DISPLAY_PLACEHOLDERS.explanation,
    hasDescription: realDescription != null,
    hasExplanation: realExplanation != null,
    chips: buildChips(exercise),
    media: buildMedia(media),
    attribution: computeAttribution(exercise.source, exercise.source_license),
  };
}
