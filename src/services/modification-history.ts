/**
 * Modification History Service
 *
 * Tracks all modifications made to programs (by user or Agent).
 * Each modification captures the before/after state, the change type,
 * and whether it was initiated by the user or the Agent.
 *
 * Usage pattern:
 * 1. Call captureState(programId) to snapshot the current program state ("before")
 * 2. Apply the modification
 * 3. Call captureState(programId) again for the "after" snapshot
 * 4. Call recordModification() with both snapshots
 *
 * Requirements: 5.3, 6.2
 */

import type { ModificationEntry } from '@/types/program';
import { supabase } from '@/utils/supabase';

/**
 * Parameters for recording a modification entry.
 */
export interface RecordModificationParams {
  programId: string;
  userId: string;
  changeType: string;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  source: 'user' | 'agent';
}

/**
 * Records a modification to a program in the modification_history table.
 *
 * @param params - The modification details including before/after state
 * @returns The created modification entry
 * @throws Error if the insert fails
 */
export async function recordModification(
  params: RecordModificationParams
): Promise<ModificationEntry> {
  const { programId, userId, changeType, beforeState, afterState, source } = params;

  const { data, error } = await supabase
    .from('modification_history')
    .insert({
      program_id: programId,
      user_id: userId,
      change_type: changeType,
      before_state: beforeState,
      after_state: afterState,
      source,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to record modification: ${error.message}`);
  }

  return data as ModificationEntry;
}

/**
 * Retrieves all modification history entries for a given program,
 * sorted by creation date (most recent first).
 *
 * @param programId - The program ID to fetch history for
 * @returns Array of modification entries sorted by created_at descending
 * @throws Error if the query fails
 */
export async function getModificationHistory(
  programId: string
): Promise<ModificationEntry[]> {
  const { data, error } = await supabase
    .from('modification_history')
    .select('*')
    .eq('program_id', programId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch modification history: ${error.message}`);
  }

  return (data ?? []) as ModificationEntry[];
}

/**
 * Captures the current full state of a program for use as a before/after snapshot.
 *
 * Fetches the program record along with its program_days and their items,
 * returning a structured JSON-serializable object suitable for storing
 * in the modification_history before_state or after_state columns.
 *
 * @param programId - The program ID to capture state for
 * @returns The full program state as a JSON-serializable object
 * @throws Error if the program is not found or the query fails
 */
export async function captureState(
  programId: string
): Promise<Record<string, unknown>> {
  // Fetch the program metadata
  const { data: program, error: programError } = await supabase
    .from('programs')
    .select('*')
    .eq('id', programId)
    .single();

  if (programError) {
    throw new Error(`Failed to capture program state: ${programError.message}`);
  }

  // Fetch program days
  const { data: days, error: daysError } = await supabase
    .from('program_days')
    .select('*')
    .eq('program_id', programId)
    .order('day_number', { ascending: true });

  if (daysError) {
    throw new Error(`Failed to capture program days: ${daysError.message}`);
  }

  // Fetch all items for the program's days
  const dayIds = (days ?? []).map((d) => d.id);
  let items: Record<string, unknown>[] = [];

  if (dayIds.length > 0) {
    const { data: dayItems, error: itemsError } = await supabase
      .from('program_day_items')
      .select('*')
      .in('program_day_id', dayIds)
      .order('order_index', { ascending: true });

    if (itemsError) {
      throw new Error(`Failed to capture program day items: ${itemsError.message}`);
    }

    items = (dayItems ?? []) as Record<string, unknown>[];
  }

  // Group items by program_day_id for structured output
  const itemsByDay: Record<string, Record<string, unknown>[]> = {};
  for (const item of items) {
    const dayId = item.program_day_id as string;
    if (!itemsByDay[dayId]) {
      itemsByDay[dayId] = [];
    }
    itemsByDay[dayId].push(item);
  }

  // Assemble the full state snapshot
  const programDays = (days ?? []).map((day) => ({
    ...day,
    items: itemsByDay[day.id] ?? [],
  }));

  return {
    ...program,
    program_days: programDays,
  };
}
