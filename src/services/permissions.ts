/**
 * Permission Service
 *
 * Manages user permission categories for Agent tool calls.
 * Each category controls whether the Agent needs explicit approval or can auto-apply actions.
 *
 * Categories:
 * - program_edits: modifications to the active program
 * - journal_edits: drafting/editing journal entries
 * - spotify_actions: playlist search, creation, modification
 * - health_access: reading/writing health data
 *
 * All categories default to 'approval_required' on new account creation.
 */

import type { PermissionCategory, PermissionMode } from '@/types/permissions';
import { supabase } from '@/utils/supabase';

/**
 * Mapping from PermissionCategory to the corresponding database column name.
 */
const CATEGORY_TO_COLUMN: Record<PermissionCategory, string> = {
  program_edits: 'permission_program_edits',
  journal_edits: 'permission_journal_edits',
  spotify_actions: 'permission_spotify_actions',
  health_access: 'permission_health_access',
};

/**
 * All permission categories.
 */
export const ALL_PERMISSION_CATEGORIES: PermissionCategory[] = [
  'program_edits',
  'journal_edits',
  'spotify_actions',
  'health_access',
];

/**
 * The default permission mode for all categories on new accounts.
 */
export const DEFAULT_PERMISSION_MODE: PermissionMode = 'approval_required';

/**
 * Ensures a user_settings row exists for the given user.
 * Creates default settings (all categories = 'approval_required') if not present.
 *
 * This should be called during account creation or on first access.
 */
export async function ensureUserSettings(userId: string): Promise<void> {
  const { data, error: selectError } = await supabase
    .from('user_settings')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to check user settings: ${selectError.message}`);
  }

  if (data) {
    // Settings already exist
    return;
  }

  // Create default settings
  const { error: insertError } = await supabase
    .from('user_settings')
    .insert({
      user_id: userId,
      permission_program_edits: DEFAULT_PERMISSION_MODE,
      permission_journal_edits: DEFAULT_PERMISSION_MODE,
      permission_spotify_actions: DEFAULT_PERMISSION_MODE,
      permission_health_access: DEFAULT_PERMISSION_MODE,
    });

  if (insertError) {
    // Handle race condition: another request may have created the row
    if (insertError.code === '23505') {
      // Unique violation — row was created concurrently, which is fine
      return;
    }
    throw new Error(`Failed to create user settings: ${insertError.message}`);
  }
}

/**
 * Retrieves all permission settings for a user.
 * Returns a record mapping each PermissionCategory to its current PermissionMode.
 *
 * If settings don't exist yet, creates them with defaults first.
 */
export async function getUserPermissions(
  userId: string
): Promise<Record<PermissionCategory, PermissionMode>> {
  await ensureUserSettings(userId);

  const { data, error } = await supabase
    .from('user_settings')
    .select(
      'permission_program_edits, permission_journal_edits, permission_spotify_actions, permission_health_access'
    )
    .eq('user_id', userId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch user permissions: ${error.message}`);
  }

  return {
    program_edits: data.permission_program_edits as PermissionMode,
    journal_edits: data.permission_journal_edits as PermissionMode,
    spotify_actions: data.permission_spotify_actions as PermissionMode,
    health_access: data.permission_health_access as PermissionMode,
  };
}

/**
 * Updates a single permission category for a user.
 *
 * @param userId - The user's ID
 * @param category - The permission category to update
 * @param mode - The new permission mode ('approval_required' or 'auto_apply')
 */
export async function updatePermission(
  userId: string,
  category: PermissionCategory,
  mode: PermissionMode
): Promise<void> {
  await ensureUserSettings(userId);

  const column = CATEGORY_TO_COLUMN[category];

  const { error } = await supabase
    .from('user_settings')
    .update({ [column]: mode, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to update permission: ${error.message}`);
  }
}

/**
 * Gets the current permission mode for a specific category.
 * Convenience helper used by the tool call execution layer to decide
 * whether approval is required.
 *
 * @param userId - The user's ID
 * @param category - The permission category to check
 * @returns The current PermissionMode for the category
 */
export async function getPermissionMode(
  userId: string,
  category: PermissionCategory
): Promise<PermissionMode> {
  const permissions = await getUserPermissions(userId);
  return permissions[category];
}

/**
 * Checks whether a tool call in a given permission category requires user approval.
 *
 * Returns `true` if the category is set to 'approval_required' (the tool call must
 * not proceed without explicit user confirmation). Returns `false` if set to 'auto_apply'
 * (the tool call can be executed immediately).
 *
 * @param userId - The user's ID
 * @param category - The permission category the tool call belongs to
 * @returns `true` if approval is required, `false` if auto-apply is enabled
 */
export async function requiresApproval(
  userId: string,
  category: PermissionCategory
): Promise<boolean> {
  const mode = await getPermissionMode(userId, category);
  return mode === 'approval_required';
}
