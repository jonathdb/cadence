/**
 * Program Manager Service
 *
 * Manages program lifecycle: activation, retrieval, listing, and archival.
 * Enforces the single active program constraint via the DB-level
 * activate_program RPC which atomically archives the current active program
 * and activates the new one.
 *
 * Key rules:
 * - At most one program with status='active' per user at any time
 * - Activation is atomic via activate_program RPC (archives current, activates new)
 * - Programs can be listed/filtered by status (draft, active, archived)
 *
 * Requirements: 4.1, 4.2, 4.3
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Program, ProgramStatus } from '@/types/program';

export interface ProgramListFilter {
  status?: ProgramStatus;
  limit?: number; // default 50
  offset?: number; // default 0
  /**
   * When false (default), programs with `hidden = true` are excluded from
   * the result. Set true to include them (e.g. a "Show hidden" toggle).
   */
  includeHidden?: boolean;
}

export class ProgramManagerError extends Error {
  constructor(
    message: string,
    public code:
      | 'NOT_FOUND'
      | 'CONSTRAINT_VIOLATION'
      | 'VALIDATION_ERROR'
      | 'DB_ERROR'
  ) {
    super(message);
    this.name = 'ProgramManagerError';
  }
}

/**
 * Activate a program for the user.
 * Calls the activate_program RPC which atomically archives the currently active
 * program (if any) and sets the specified program as active.
 *
 * The DB enforces at most one active program per user via a partial unique index.
 *
 * @param client - Supabase client (authenticated as the user)
 * @param userId - The current user's ID
 * @param programId - The program to activate
 * @returns The activated program with its days and items
 * @throws ProgramManagerError if the program is not found or a constraint violation occurs
 */
export async function activateProgram(
  client: SupabaseClient,
  userId: string,
  programId: string
): Promise<Program> {
  if (!programId || programId.trim() === '') {
    throw new ProgramManagerError(
      'Program ID is required',
      'VALIDATION_ERROR'
    );
  }

  // Call the atomic RPC that archives current active and activates the new one
  const { error: rpcError } = await client.rpc('activate_program', {
    p_user_id: userId,
    p_program_id: programId,
  });

  if (rpcError) {
    // Handle specific constraint violation (shouldn't happen with the RPC, but be safe)
    if (
      rpcError.message.includes('idx_one_active_program_per_user') ||
      rpcError.message.includes('unique constraint')
    ) {
      throw new ProgramManagerError(
        'Cannot have more than one active program. This is unexpected — please retry.',
        'CONSTRAINT_VIOLATION'
      );
    }

    if (
      rpcError.message.includes('not found') ||
      rpcError.message.includes('not owned')
    ) {
      throw new ProgramManagerError(
        'Program not found or not owned by user',
        'NOT_FOUND'
      );
    }

    throw new ProgramManagerError(
      `Failed to activate program: ${rpcError.message}`,
      'DB_ERROR'
    );
  }

  // Fetch and return the now-active program with its full structure
  const program = await getActiveProgram(client, userId);

  if (!program) {
    throw new ProgramManagerError(
      'Program was activated but could not be retrieved',
      'DB_ERROR'
    );
  }

  return program;
}

/**
 * Get the user's single active program with all days and items.
 * Returns null if no active program exists.
 *
 * @param client - Supabase client (authenticated as the user)
 * @param userId - The current user's ID
 * @returns The active program with nested days/items, or null if none
 */
export async function getActiveProgram(
  client: SupabaseClient,
  userId: string
): Promise<Program | null> {
  const { data, error } = await client
    .from('programs')
    .select(
      `
      *,
      program_days (
        *,
        program_day_items (*)
      )
    `
    )
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (error) {
    // PGRST116 = no rows found — that's fine, means no active program
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new ProgramManagerError(
      `Failed to fetch active program: ${error.message}`,
      'DB_ERROR'
    );
  }

  if (!data) {
    return null;
  }

  return mapProgramRow(data);
}

/**
 * List all programs for the user, optionally filtered by status.
 * Programs are returned in descending order of updated_at (most recent first).
 *
 * @param client - Supabase client (authenticated as the user)
 * @param userId - The current user's ID
 * @param filter - Optional filter by status, limit, offset
 * @returns Array of programs (without nested days for performance)
 */
export async function listPrograms(
  client: SupabaseClient,
  userId: string,
  filter: ProgramListFilter = {}
): Promise<Program[]> {
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;

  let query = client
    .from('programs')
    .select(
      `
      *,
      program_days (
        *,
        program_day_items (*)
      )
    `
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filter.status) {
    query = query.eq('status', filter.status);
  }

  if (!filter.includeHidden) {
    query = query.eq('hidden', false);
  }

  const { data, error } = await query;

  if (error) {
    throw new ProgramManagerError(
      `Failed to list programs: ${error.message}`,
      'DB_ERROR'
    );
  }

  return (data ?? []).map(mapProgramRow);
}

/**
 * Sets a program's `hidden` flag. Used to declutter the archived list
 * without destroying the program or its history.
 *
 * @param client - Supabase client (authenticated as the user)
 * @param userId - The current user's ID
 * @param programId - The program to hide/unhide
 * @param hidden - The new hidden value
 * @returns The updated program
 * @throws ProgramManagerError if the program is not found
 */
export async function setProgramHidden(
  client: SupabaseClient,
  userId: string,
  programId: string,
  hidden: boolean
): Promise<Program> {
  if (!programId || programId.trim() === '') {
    throw new ProgramManagerError(
      'Program ID is required',
      'VALIDATION_ERROR'
    );
  }

  const { data, error } = await client
    .from('programs')
    .update({ hidden, updated_at: new Date().toISOString() })
    .eq('id', programId)
    .eq('user_id', userId)
    .select(
      `
      *,
      program_days (
        *,
        program_day_items (*)
      )
    `
    )
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new ProgramManagerError(
        'Program not found or not owned by user',
        'NOT_FOUND'
      );
    }
    throw new ProgramManagerError(
      `Failed to update program: ${error.message}`,
      'DB_ERROR'
    );
  }

  if (!data) {
    throw new ProgramManagerError(
      'Program not found or not owned by user',
      'NOT_FOUND'
    );
  }

  return mapProgramRow(data);
}

/**
 * Permanently deletes a program and its structure (days, items).
 *
 * Logged workout history that references this program (via
 * `sessions.program_day_id`) is preserved: the FK is `ON DELETE SET NULL`,
 * so past sessions simply lose their program-day link rather than being
 * deleted (Requirement 3.3 — history survives a purge).
 *
 * @param client - Supabase client (authenticated as the user)
 * @param userId - The current user's ID
 * @param programId - The program to permanently delete
 * @throws ProgramManagerError if the program is not found
 */
export async function purgeProgram(
  client: SupabaseClient,
  userId: string,
  programId: string
): Promise<void> {
  if (!programId || programId.trim() === '') {
    throw new ProgramManagerError(
      'Program ID is required',
      'VALIDATION_ERROR'
    );
  }

  const { error, count } = await client
    .from('programs')
    .delete({ count: 'exact' })
    .eq('id', programId)
    .eq('user_id', userId);

  if (error) {
    throw new ProgramManagerError(
      `Failed to delete program: ${error.message}`,
      'DB_ERROR'
    );
  }

  if (!count) {
    throw new ProgramManagerError(
      'Program not found or not owned by user',
      'NOT_FOUND'
    );
  }
}

/**
 * Archive a program. Manually sets a program's status to 'archived'.
 * This is separate from the automatic archival during activate_program.
 *
 * @param client - Supabase client (authenticated as the user)
 * @param userId - The current user's ID
 * @param programId - The program to archive
 * @returns The archived program
 * @throws ProgramManagerError if the program is not found
 */
export async function archiveProgram(
  client: SupabaseClient,
  userId: string,
  programId: string
): Promise<Program> {
  if (!programId || programId.trim() === '') {
    throw new ProgramManagerError(
      'Program ID is required',
      'VALIDATION_ERROR'
    );
  }

  const { data, error } = await client
    .from('programs')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', programId)
    .eq('user_id', userId)
    .select(
      `
      *,
      program_days (
        *,
        program_day_items (*)
      )
    `
    )
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new ProgramManagerError(
        'Program not found or not owned by user',
        'NOT_FOUND'
      );
    }
    throw new ProgramManagerError(
      `Failed to archive program: ${error.message}`,
      'DB_ERROR'
    );
  }

  if (!data) {
    throw new ProgramManagerError(
      'Program not found or not owned by user',
      'NOT_FOUND'
    );
  }

  return mapProgramRow(data);
}

/**
 * Get a single program by ID with full structure (days + items).
 *
 * @param client - Supabase client (authenticated as the user)
 * @param userId - The current user's ID
 * @param programId - The program to retrieve
 * @returns The program with nested days/items
 * @throws ProgramManagerError if not found
 */
export async function getProgramById(
  client: SupabaseClient,
  userId: string,
  programId: string
): Promise<Program> {
  const { data, error } = await client
    .from('programs')
    .select(
      `
      *,
      program_days (
        *,
        program_day_items (*)
      )
    `
    )
    .eq('id', programId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    throw new ProgramManagerError(
      'Program not found or not owned by user',
      'NOT_FOUND'
    );
  }

  return mapProgramRow(data);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Maps a raw Supabase program row (with nested joins) to the typed Program interface.
 */
function mapProgramRow(row: Record<string, unknown>): Program {
  const programDays = Array.isArray(row.program_days) ? row.program_days : [];

  return {
    id: row.id as string,
    user_id: row.user_id as string,
    name: row.name as string,
    status: row.status as Program['status'],
    hidden: row.hidden as boolean,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    modification_history: [], // fetched separately when needed
    program_days: programDays
      .sort(
        (a: Record<string, unknown>, b: Record<string, unknown>) =>
          (a.day_number as number) - (b.day_number as number)
      )
      .map((day: Record<string, unknown>) => {
        const items = Array.isArray(day.program_day_items)
          ? day.program_day_items
          : [];

        return {
          id: day.id as string,
          program_id: day.program_id as string,
          day_number: day.day_number as number,
          name: day.name as string,
          items: items
            .sort(
              (a: Record<string, unknown>, b: Record<string, unknown>) =>
                (a.order_index as number) - (b.order_index as number)
            )
            .map((item: Record<string, unknown>) => ({
              id: item.id as string,
              type: item.type as 'exercise' | 'block',
              order: item.order_index as number,
              exercise_id: item.exercise_id as string | undefined,
              target_sets: item.target_sets as number,
              target_reps: item.target_reps as string,
              target_weight: item.target_weight as number | undefined,
              target_rpe: item.target_rpe as number | undefined,
              timer_config: item.timer_config as Program['program_days'][0]['items'][0]['timer_config'],
              notes: item.notes as string | undefined,
            })),
        };
      }),
  };
}
