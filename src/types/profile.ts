/**
 * User training profile types.
 *
 * The profile is a rich, per-user description of training goals and constraints
 * that the AI coach injects into its system prompt and progression engine.
 */

export type TrainingGoal =
  | 'strength'
  | 'hypertrophy'
  | 'endurance'
  | 'general_fitness'
  | 'weight_loss'
  | 'athletic_performance';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export type BodyweightUnit = 'kg' | 'lbs';

export interface UserProfile {
  id: string;
  user_id: string;
  goal: TrainingGoal | null;
  experience_level: ExperienceLevel | null;
  bodyweight: number | null;
  bodyweight_unit: BodyweightUnit;
  injuries: string | null;
  equipment: string[];
  preferred_training_days: string[];
  weekly_frequency: number | null;
  training_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Fields a user can edit. `user_id` is derived from the session, not the form. */
export type UserProfileInput = Partial<
  Pick<
    UserProfile,
    | 'goal'
    | 'experience_level'
    | 'bodyweight'
    | 'bodyweight_unit'
    | 'injuries'
    | 'equipment'
    | 'preferred_training_days'
    | 'weekly_frequency'
    | 'training_notes'
  >
>;

/**
 * First-run onboarding status, persisted server-side on `user_profiles`
 * (Requirement 5.5) so the flow survives reinstall / cross-device login and
 * never reshows once resolved.
 */
export type OnboardingStatus = 'pending' | 'completed' | 'skipped';

/** The subset of profile fields the onboarding flow collects. */
export type OnboardingField =
  | 'goal'
  | 'experience_level'
  | 'bodyweight'
  | 'bodyweight_unit'
  | 'weekly_frequency'
  | 'preferred_training_days'
  | 'equipment'
  | 'injuries'
  | 'training_notes';

export const ONBOARDING_FIELDS: OnboardingField[] = [
  'goal',
  'experience_level',
  'bodyweight',
  'bodyweight_unit',
  'weekly_frequency',
  'preferred_training_days',
  'equipment',
  'injuries',
  'training_notes',
];

/**
 * Values entered during onboarding. Every field is optional (Requirement
 * 5.2) — only keys the user actually touched should be included, so a
 * partial submission never clears untouched profile fields.
 */
export type OnboardingValues = Partial<Pick<UserProfile, OnboardingField>>;

export const TRAINING_GOALS: TrainingGoal[] = [
  'strength',
  'hypertrophy',
  'endurance',
  'general_fitness',
  'weight_loss',
  'athletic_performance',
];

export const EXPERIENCE_LEVELS: ExperienceLevel[] = [
  'beginner',
  'intermediate',
  'advanced',
];

/**
 * Validate + parse the free-text numeric fields from the profile form.
 * Returns either a normalized value set or a human-readable error.
 * Kept pure so the UI and tests share the exact same rules.
 */
export function parseProfileNumerics(input: {
  bodyweight: string;
  weeklyFrequency: string;
}): { ok: true; bodyweight: number | null; weeklyFrequency: number | null } | { ok: false; error: string } {
  const bwRaw = input.bodyweight.trim();
  const freqRaw = input.weeklyFrequency.trim();

  const bodyweight = bwRaw === '' ? null : Number(bwRaw);
  const weeklyFrequency = freqRaw === '' ? null : Number(freqRaw);

  if (bodyweight != null && (isNaN(bodyweight) || bodyweight <= 0 || bodyweight >= 1000)) {
    return { ok: false, error: 'Bodyweight must be a positive number below 1000.' };
  }
  if (weeklyFrequency != null && (isNaN(weeklyFrequency) || weeklyFrequency < 1 || weeklyFrequency > 14)) {
    return { ok: false, error: 'Weekly frequency must be between 1 and 14.' };
  }

  return { ok: true, bodyweight, weeklyFrequency };
}
