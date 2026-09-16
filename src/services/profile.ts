/**
 * Profile Service
 *
 * Manages the user's rich training profile (goal, experience, bodyweight,
 * injuries, equipment, preferred days/frequency, notes) used by the AI coach.
 *
 * Mirrors the ensure/get/update pattern in src/services/permissions.ts.
 */

import type { UserProfile, UserProfileInput } from '@/types/profile';
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
