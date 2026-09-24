/**
 * Session Manager Service
 *
 * Manages manual (user-initiated) session edits and deletes. Mirrors the
 * error-handling and ownership-scoping conventions in
 * `src/services/program-manager.ts`.
 *
 * Key rule (Requirement 4.12 — history preservation): session "delete" is a
 * soft-delete. It sets `deleted_at` and hides the session from lists/queries
 * while leaving `logged_sets` intact as an independent record of past
 * activity. Hard removal is never offered for sessions.
 *
 * Requirements: 4.1, 4.2, 4.6, 4.7, 4.8, 4.12
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Session, SessionUpdateInput } from '@/types/session';

export class SessionManagerError extends Error {
  constructor(
    message: string,
    public code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'DB_ERROR'
  ) {
    super(message);
    this.name = 'SessionManagerError';
  }
}

const ALLOWED_UPDATE_FIELDS: (keyof SessionUpdateInput)[] = [
  'started_at',
  'completed_at',
  'status',
  'notes',
];

/**
 * Update a session's date/time, status, or notes.
 *
 * @param client - Supabase client (authenticated as the user)
 * @param userId - The current user's ID
 * @param sessionId - The session to update
 * @param updates - Partial fields to update (started_at, completed_at, status, notes)
 * @returns The updated session
 * @throws SessionManagerError if the session is not found, not owned by the user, or already deleted
 */
export async function updateSession(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
  updates: SessionUpdateInput
): Promise<Session> {
  if (!sessionId || sessionId.trim() === '') {
    throw new SessionManagerError('Session ID is required', 'VALIDATION_ERROR');
  }

  const cleanUpdates: Record<string, unknown> = {};
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (updates[field] !== undefined) {
      cleanUpdates[field] = updates[field];
    }
  }

  if (Object.keys(cleanUpdates).length === 0) {
    throw new SessionManagerError(
      'At least one of started_at, completed_at, status, or notes is required',
      'VALIDATION_ERROR'
    );
  }

  const { data, error } = await client
    .from('sessions')
    .update(cleanUpdates)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new SessionManagerError('Session not found or not owned by user', 'NOT_FOUND');
    }
    throw new SessionManagerError(`Failed to update session: ${error.message}`, 'DB_ERROR');
  }

  if (!data) {
    throw new SessionManagerError('Session not found or not owned by user', 'NOT_FOUND');
  }

  return data as Session;
}

/**
 * Soft-delete a session: sets `deleted_at`, hiding it from lists/queries.
 * `logged_sets` are left untouched (Requirement 4.12 — history preservation).
 *
 * @param client - Supabase client (authenticated as the user)
 * @param userId - The current user's ID
 * @param sessionId - The session to delete
 * @throws SessionManagerError if the session is not found, not owned by the user, or already deleted
 */
export async function deleteSession(
  client: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<void> {
  if (!sessionId || sessionId.trim() === '') {
    throw new SessionManagerError('Session ID is required', 'VALIDATION_ERROR');
  }

  const { data, error } = await client
    .from('sessions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('id')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new SessionManagerError('Session not found or not owned by user', 'NOT_FOUND');
    }
    throw new SessionManagerError(`Failed to delete session: ${error.message}`, 'DB_ERROR');
  }

  if (!data) {
    throw new SessionManagerError('Session not found or not owned by user', 'NOT_FOUND');
  }
}
