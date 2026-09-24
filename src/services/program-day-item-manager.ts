/**
 * Program Day Item (Exercise Instance) Manager Service
 *
 * Manages manual (user-initiated) edits/removals of a single exercise
 * instance — a `program_day_items` row. Mirrors the error-handling and
 * ownership-scoping conventions in `src/services/program-manager.ts`.
 *
 * Key rule (Requirement 4.3): editing or removing an instance never mutates
 * the shared catalog exercise row. `program_day_items` has no direct
 * `user_id` column, so ownership is verified by joining up through
 * `program_days` → `programs.user_id` (mirrors the RLS policy shape).
 *
 * Requirements: 4.3, 4.4, 4.6, 4.7, 4.8, 4.12
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export class ProgramDayItemManagerError extends Error {
  constructor(
    message: string,
    public code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'DB_ERROR'
  ) {
    super(message);
    this.name = 'ProgramDayItemManagerError';
  }
}

export interface ProgramDayItemUpdateInput {
  target_sets?: number;
  target_reps?: string;
  target_weight?: number | null;
  target_rpe?: number | null;
  timer_config?: Record<string, unknown> | null;
  notes?: string | null;
}

const ALLOWED_UPDATE_FIELDS: (keyof ProgramDayItemUpdateInput)[] = [
  'target_sets',
  'target_reps',
  'target_weight',
  'target_rpe',
  'timer_config',
  'notes',
];

/**
 * Verifies the given `program_day_items` row belongs (transitively, via
 * program_days → programs) to `userId`. Throws if not found or not owned.
 */
async function verifyOwnership(
  client: SupabaseClient,
  userId: string,
  itemId: string
): Promise<void> {
  const { data, error } = await client
    .from('program_day_items')
    .select('id, program_days!inner(program_id, programs!inner(user_id))')
    .eq('id', itemId)
    .eq('program_days.programs.user_id', userId)
    .single();

  if (error || !data) {
    throw new ProgramDayItemManagerError(
      'Exercise instance not found or not owned by user',
      'NOT_FOUND'
    );
  }
}

/**
 * Update an exercise instance's target sets/reps/weight/RPE/timer/notes.
 * Never touches the shared catalog exercise row (Requirement 4.3).
 *
 * @param client - Supabase client (authenticated as the user)
 * @param userId - The current user's ID
 * @param itemId - The program_day_items row to update
 * @param updates - Partial instance fields to update
 * @throws ProgramDayItemManagerError if not found, not owned, or validation fails
 */
export async function updateProgramDayItem(
  client: SupabaseClient,
  userId: string,
  itemId: string,
  updates: ProgramDayItemUpdateInput
): Promise<void> {
  if (!itemId || itemId.trim() === '') {
    throw new ProgramDayItemManagerError('Item ID is required', 'VALIDATION_ERROR');
  }

  const cleanUpdates: Record<string, unknown> = {};
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (updates[field] !== undefined) {
      cleanUpdates[field] = updates[field];
    }
  }

  if (Object.keys(cleanUpdates).length === 0) {
    throw new ProgramDayItemManagerError(
      'At least one of target_sets, target_reps, target_weight, target_rpe, timer_config, or notes is required',
      'VALIDATION_ERROR'
    );
  }

  await verifyOwnership(client, userId, itemId);

  const { error } = await client
    .from('program_day_items')
    .update(cleanUpdates)
    .eq('id', itemId);

  if (error) {
    throw new ProgramDayItemManagerError(
      `Failed to update exercise instance: ${error.message}`,
      'DB_ERROR'
    );
  }
}

/**
 * Remove a single exercise instance from a program day. `logged_sets`
 * reference the exercise + session, not the item, so history is inherently
 * preserved (Requirement 4.12).
 *
 * @param client - Supabase client (authenticated as the user)
 * @param userId - The current user's ID
 * @param itemId - The program_day_items row to remove
 * @throws ProgramDayItemManagerError if not found or not owned
 */
export async function removeProgramDayItem(
  client: SupabaseClient,
  userId: string,
  itemId: string
): Promise<void> {
  if (!itemId || itemId.trim() === '') {
    throw new ProgramDayItemManagerError('Item ID is required', 'VALIDATION_ERROR');
  }

  await verifyOwnership(client, userId, itemId);

  const { error } = await client
    .from('program_day_items')
    .delete()
    .eq('id', itemId);

  if (error) {
    throw new ProgramDayItemManagerError(
      `Failed to remove exercise instance: ${error.message}`,
      'DB_ERROR'
    );
  }
}
