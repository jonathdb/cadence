/**
 * Builds a compact, token-bounded profile summary string for injection into the
 * Cadence agent system prompt. PURE — no DB access. The agent-chat handler
 * fetches the row and passes it here.
 */

export interface ProfileRow {
  goal: string | null;
  experience_level: string | null;
  bodyweight: number | null;
  bodyweight_unit: string | null;
  injuries: string | null;
  equipment: string[] | null;
  preferred_training_days: string[] | null;
  weekly_frequency: number | null;
  training_notes: string | null;
}

/** Max characters for free-text fields so the prompt stays bounded. */
const MAX_INJURIES = 400;
const MAX_NOTES = 600;
const MAX_EQUIPMENT_ITEMS = 15;

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + '…';
}

/** True when the profile carries no usable information. */
export function isProfileEmpty(profile: ProfileRow | null | undefined): boolean {
  if (!profile) return true;
  return (
    !profile.goal &&
    !profile.experience_level &&
    profile.bodyweight == null &&
    !profile.injuries &&
    (!profile.equipment || profile.equipment.length === 0) &&
    (!profile.preferred_training_days || profile.preferred_training_days.length === 0) &&
    profile.weekly_frequency == null &&
    !profile.training_notes
  );
}

/**
 * Produce a bullet summary of the profile, or an empty string when there is no
 * usable profile. The returned block (when non-empty) is prefixed with a header
 * and is safe to append to the base system prompt.
 */
export function buildProfileSummary(profile: ProfileRow | null | undefined): string {
  if (isProfileEmpty(profile)) return '';
  const p = profile as ProfileRow;

  const lines: string[] = [];

  if (p.goal) lines.push(`- Primary goal: ${p.goal.replace(/_/g, ' ')}`);
  if (p.experience_level) lines.push(`- Experience level: ${p.experience_level}`);
  if (p.bodyweight != null) {
    lines.push(`- Bodyweight: ${p.bodyweight} ${p.bodyweight_unit ?? 'kg'}`);
  }
  if (p.weekly_frequency != null) {
    lines.push(`- Target training frequency: ${p.weekly_frequency} sessions/week`);
  }
  if (p.preferred_training_days && p.preferred_training_days.length > 0) {
    lines.push(`- Preferred training days: ${p.preferred_training_days.join(', ')}`);
  }
  if (p.equipment && p.equipment.length > 0) {
    const items = p.equipment.slice(0, MAX_EQUIPMENT_ITEMS).map((e) => e.replace(/_/g, ' '));
    lines.push(`- Available equipment: ${items.join(', ')}`);
  }
  if (p.injuries) {
    lines.push(`- Injuries/limitations (ALWAYS respect): ${truncate(p.injuries, MAX_INJURIES)}`);
  }
  if (p.training_notes) {
    lines.push(`- Notes: ${truncate(p.training_notes, MAX_NOTES)}`);
  }

  return [
    '',
    'USER TRAINING PROFILE:',
    ...lines,
    '',
    'Profile guidance:',
    '- Align every suggestion and generated plan with the stated goal.',
    '- Never program movements that conflict with a stated injury/limitation; offer safe alternatives.',
    '- Only prescribe exercises the user can perform with their available equipment (bodyweight is always allowed).',
    '- Scale progression aggressiveness to experience level and honor the target training frequency.',
  ].join('\n');
}

/**
 * Compose the final system prompt: base prompt plus the profile summary when
 * non-empty. Kept pure so the assembly rule is testable without the Deno runtime.
 */
export function composeSystemPrompt(basePrompt: string, profileSummary: string): string {
  return profileSummary ? `${basePrompt}\n${profileSummary}` : basePrompt;
}
