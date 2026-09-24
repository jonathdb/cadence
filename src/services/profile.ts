/**
 * Profile Service
 *
 * Manages the user's rich training profile (goal, experience, bodyweight,
 * injuries, equipment, preferred days/frequency, notes) used by the AI coach.
 *
 * Mirrors the ensure/get/update pattern in src/services/permissions.ts.
 */

import type {
    OnboardingStatus,
    OnboardingValues,
    UserProfile,
    UserProfileInput
} from '@/types/profile';
import { supabase } from '@/utils/supabase';

/**
 * Ensures a user_profiles row exists for the given user, creating an empty
 * profile if not present. Safe to call repeatedly (handles the insert race).
 */
export async function ensureUserProfile(userId: string): Promise<void> {
  const { data, error: selectError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to check user profile: ${selectError.message}`);
  }

  if (data) {
    return;
  }

  const { error: insertError } = await supabase
    .from('user_profiles')
    .insert({ user_id: userId });

  if (insertError) {
    // Unique violation → created concurrently, which is fine.
    if (insertError.code === '23505') {
      return;
    }
    throw new Error(`Failed to create user profile: ${insertError.message}`);
  }
}

/**
 * Retrieves the user's profile, creating a default row first if needed.
 */
export async function getUserProfile(userId: string): Promise<UserProfile> {
  await ensureUserProfile(userId);

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch user profile: ${error.message}`);
  }

  return data as UserProfile;
}

/**
 * Updates the user's profile with the provided fields. Ensures the row exists
 * first, then applies a partial update. Returns the updated profile.
 */
export async function updateUserProfile(
  userId: string,
  input: UserProfileInput
): Promise<UserProfile> {
  await ensureUserProfile(userId);

  const { data, error } = await supabase
    .from('user_profiles')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to update user profile: ${error.message}`);
  }

  return data as UserProfile;
}

/**
 * Builds a `UserProfileInput` patch from the onboarding flow's collected
 * values. Onboarding fields are a subset of `UserProfileInput`, so this is
 * a pass-through — kept as its own function so the onboarding screen never
 * has to reach into `UserProfileInput` directly and so untouched fields
 * (omitted from `values`) are never included in the patch.
 */
export function buildOnboardingPatch(values: OnboardingValues): UserProfileInput {
  return { ...values };
}

/**
 * Records the resolved onboarding state (`completed` or `skipped`), or
 * resets it to `pending` when a user opts to re-run onboarding from
 * Settings. Persisted server-side so the state survives reinstall and
 * cross-device login (Requirement 5.5).
 */
export async function setOnboardingStatus(
  userId: string,
  status: OnboardingStatus
): Promise<void> {
  await ensureUserProfile(userId);

  const { error } = await supabase
    .from('user_profiles')
    .update({ onboarding_status: status, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to update onboarding status: ${error.message}`);
  }
}

/**
 * Whether the first-run onboarding flow should be shown for this user.
 * True only when the persisted status is still `pending` (Requirement 5.1);
 * once `completed` or `skipped`, it never reshows automatically.
 */
export async function shouldShowOnboarding(userId: string): Promise<boolean> {
  await ensureUserProfile(userId);

  const { data, error } = await supabase
    .from('user_profiles')
    .select('onboarding_status')
    .eq('user_id', userId)
    .single();

  if (error) {
    throw new Error(`Failed to check onboarding status: ${error.message}`);
  }

  return (data?.onboarding_status as OnboardingStatus | null) === 'pending';
}
