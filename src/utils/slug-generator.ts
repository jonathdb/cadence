/**
 * Slug Generator Utility
 *
 * Generates URL-safe slugs from title strings for shareable template links.
 * Handles collisions by appending random suffixes.
 * Max slug length: 64 characters.
 *
 * Validates: Requirements 1.2, 1.3
 */

const MAX_SLUG_LENGTH = 64;
const SUFFIX_LENGTH = 4;
const SUFFIX_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const MAX_COLLISION_ATTEMPTS = 10;

/**
 * Convert a title string to a URL-safe slug.
 *
 * Transformations:
 * - Lowercase
 * - Strip diacritics (NFD normalization)
 * - Remove non-alphanumeric characters (except hyphens)
 * - Replace spaces/underscores with hyphens
 * - Collapse consecutive hyphens
 * - Trim leading/trailing hyphens
 * - Truncate to 64 characters
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')   // remove non-alphanumeric
    .replace(/[\s_]+/g, '-')         // spaces/underscores to hyphens
    .replace(/-+/g, '-')             // collapse consecutive hyphens
    .replace(/^-|-$/g, '')           // trim leading/trailing hyphens
    .slice(0, MAX_SLUG_LENGTH);
}

/**
 * Generate a random 4-character alphanumeric suffix.
 */
export function generateRandomSuffix(): string {
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += SUFFIX_CHARS[Math.floor(Math.random() * SUFFIX_CHARS.length)];
  }
  return suffix;
}

/**
 * Append a suffix to a base slug, ensuring the total stays within MAX_SLUG_LENGTH.
 */
export function appendSuffix(baseSlug: string, suffix: string): string {
  const maxBase = MAX_SLUG_LENGTH - SUFFIX_LENGTH - 1; // -1 for the separator hyphen
  const trimmedBase = baseSlug.slice(0, maxBase);
  return `${trimmedBase}-${suffix}`;
}

/**
 * Generate a unique slug from a title, using an exists-check callback
 * to detect collisions. On collision, appends a random suffix and retries.
 *
 * @param title - The human-readable title to slugify
 * @param existsCheck - Async function that returns true if a slug already exists in the DB
 * @returns A unique slug string (max 64 characters)
 */
export async function generateUniqueSlug(
  title: string,
  existsCheck: (slug: string) => Promise<boolean>
): Promise<string> {
  const base = slugify(title);

  // If base slug is empty (all-special-characters title), use a fallback
  const effectiveBase = base || 'template';

  // Try the base slug first
  if (!(await existsCheck(effectiveBase))) {
    return effectiveBase;
  }

  // Collision — append random suffix with retry
  let attempts = 0;
  let slug: string;
  do {
    slug = appendSuffix(effectiveBase, generateRandomSuffix());
    attempts++;
    if (attempts > MAX_COLLISION_ATTEMPTS) {
      // Extremely unlikely — use timestamp fallback
      slug = appendSuffix(effectiveBase, Date.now().toString(36).slice(-SUFFIX_LENGTH));
      break;
    }
  } while (await existsCheck(slug));

  return slug;
}
