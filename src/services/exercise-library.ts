/**
 * Exercise Library Service
 *
 * Provides search, create, update, and delete operations for exercises.
 * Handles both global (shared) and user-created (private) exercises.
 *
 * Key rules:
 * - Search returns global + user's private exercises (RLS handles isolation)
 * - Create sets is_global=false and user_id, rejects missing name/primary_muscle_group
 * - Update/Delete reject global exercises
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Exercise } from '@/types/exercise';

export interface ExerciseSearchParams {
  query?: string; // search by name (ilike)
  muscleGroup?: string; // filter by primary_muscle_group
  limit?: number; // default 50
}

export interface CreateExerciseInput {
  name: string;
  primary_muscle_group: string;
  secondary_muscle_groups?: string[];
  instructions?: string;
  notes?: string;
}

export class ExerciseLibraryError extends Error {
  constructor(
    message: string,
    public code: 'VALIDATION_ERROR' | 'GLOBAL_EXERCISE' | 'NOT_FOUND' | 'DB_ERROR'
  ) {
    super(message);
    this.name = 'ExerciseLibraryError';
  }
}

/**
 * Search exercises visible to the given user.
 * Returns global exercises + user's own private exercises.
 * RLS policies ensure other users' private exercises are excluded.
 *
 * @param client - Supabase client (authenticated as the user)
 * @param userId - The current user's ID
 * @param params - Search filters (query, muscleGroup, limit)
 * @returns Matching exercises
 */
export async function searchExercises(
  client: SupabaseClient,
  userId: string,
  params: ExerciseSearchParams = {}
): Promise<Exercise[]> {
  const limit = params.limit ?? 50;

  let query = client
    .from('exercises')
    .select('*')
    .or(`is_global.eq.true,user_id.eq.${userId}`)
    .limit(limit);

  if (params.query) {
    query = query.ilike('name', `%${params.query}%`);
  }

  if (params.muscleGroup) {
    query = query.eq('primary_muscle_group', params.muscleGroup);
  }

  const { data, error } = await query;

  if (error) {
    throw new ExerciseLibraryError(
      `Failed to search exercises: ${error.message}`,
      'DB_ERROR'
    );
  }

  return (data ?? []) as Exercise[];
}

/**
 * Create a new custom exercise for the user.
 * Requires name and primary_muscle_group. Sets is_global=false and user_id.
 *
 * @param client - Supabase client (authenticated as the user)
 * @param userId - The current user's ID
 * @param input - Exercise data (name, primary_muscle_group required)
 * @returns The created exercise
 * @throws ExerciseLibraryError if validation fails
 */
export async function createExercise(
  client: SupabaseClient,
  userId: string,
  input: CreateExerciseInput
): Promise<Exercise> {
  // Validate required fields
  if (!input.name || input.name.trim() === '') {
    throw new ExerciseLibraryError(
      'Exercise name is required',
      'VALIDATION_ERROR'
    );
  }

  if (!input.primary_muscle_group || input.primary_muscle_group.trim() === '') {
    throw new ExerciseLibraryError(
      'Primary muscle group is required',
      'VALIDATION_ERROR'
    );
  }

  const { data, error } = await client
    .from('exercises')
    .insert({
      user_id: userId,
      name: input.name.trim(),
      primary_muscle_group: input.primary_muscle_group.trim(),
      secondary_muscle_groups: input.secondary_muscle_groups ?? [],
      instructions: input.instructions ?? '',
      notes: input.notes ?? '',
      is_global: false,
    })
    .select()
    .single();

  if (error) {
    throw new ExerciseLibraryError(
      `Failed to create exercise: ${error.message}`,
      'DB_ERROR'
    );
  }

  return data as Exercise;
}

/**
 * Update an existing exercise. Rejects updates to global exercises.
 *
 * @param client - Supabase client (authenticated as the user)
 * @param userId - The current user's ID
 * @param exerciseId - The exercise to update
 * @param updates - Partial exercise data to update
 * @returns The updated exercise
 * @throws ExerciseLibraryError if the exercise is global or not found
 */
export async function updateExercise(
  client: SupabaseClient,
  userId: string,
  exerciseId: string,
  updates: Partial<Pick<Exercise, 'name' | 'primary_muscle_group' | 'secondary_muscle_groups' | 'instructions' | 'notes'>>
): Promise<Exercise> {
  // First check if the exercise exists and is not global
  const { data: existing, error: fetchError } = await client
    .from('exercises')
    .select('*')
    .eq('id', exerciseId)
    .single();

  if (fetchError || !existing) {
    throw new ExerciseLibraryError(
      'Exercise not found',
      'NOT_FOUND'
    );
  }

  if (existing.is_global) {
    throw new ExerciseLibraryError(
      'Cannot modify a global exercise',
      'GLOBAL_EXERCISE'
    );
  }

  // Validate name if being updated
  if (updates.name !== undefined && (!updates.name || updates.name.trim() === '')) {
    throw new ExerciseLibraryError(
      'Exercise name cannot be empty',
      'VALIDATION_ERROR'
    );
  }

  // Validate primary_muscle_group if being updated
  if (updates.primary_muscle_group !== undefined && (!updates.primary_muscle_group || updates.primary_muscle_group.trim() === '')) {
    throw new ExerciseLibraryError(
      'Primary muscle group cannot be empty',
      'VALIDATION_ERROR'
    );
  }

  const cleanUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) cleanUpdates.name = updates.name.trim();
  if (updates.primary_muscle_group !== undefined) cleanUpdates.primary_muscle_group = updates.primary_muscle_group.trim();
  if (updates.secondary_muscle_groups !== undefined) cleanUpdates.secondary_muscle_groups = updates.secondary_muscle_groups;
  if (updates.instructions !== undefined) cleanUpdates.instructions = updates.instructions;
  if (updates.notes !== undefined) cleanUpdates.notes = updates.notes;

  const { data, error } = await client
    .from('exercises')
    .update(cleanUpdates)
    .eq('id', exerciseId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new ExerciseLibraryError(
      `Failed to update exercise: ${error.message}`,
      'DB_ERROR'
    );
  }

  return data as Exercise;
}

/**
 * Get a single exercise by ID with visibility check.
 * Returns the exercise only if it's global or belongs to the requesting user.
 *
 * @param client - Supabase client (authenticated as the user)
 * @param userId - The current user's ID
 * @param exerciseId - The exercise to retrieve
 * @returns The exercise if visible to the user
 * @throws ExerciseLibraryError if not found or not visible
 */
export async function getExerciseById(
  client: SupabaseClient,
  userId: string,
  exerciseId: string
): Promise<Exercise> {
  const { data, error } = await client
    .from('exercises')
    .select('*')
    .eq('id', exerciseId)
    .or(`is_global.eq.true,user_id.eq.${userId}`)
    .single();

  if (error || !data) {
    throw new ExerciseLibraryError(
      'Exercise not found',
      'NOT_FOUND'
    );
  }

  return data as Exercise;
}

/**
 * Delete an exercise. Rejects deletion of global exercises.
 *
 * @param client - Supabase client (authenticated as the user)
 * @param userId - The current user's ID
 * @param exerciseId - The exercise to delete
 * @throws ExerciseLibraryError if the exercise is global or not found
 */
export async function deleteExercise(
  client: SupabaseClient,
  userId: string,
  exerciseId: string
): Promise<void> {
  // First check if the exercise exists and is not global
  const { data: existing, error: fetchError } = await client
    .from('exercises')
    .select('*')
    .eq('id', exerciseId)
    .single();

  if (fetchError || !existing) {
    throw new ExerciseLibraryError(
      'Exercise not found',
      'NOT_FOUND'
    );
  }

  if (existing.is_global) {
    throw new ExerciseLibraryError(
      'Cannot delete a global exercise',
      'GLOBAL_EXERCISE'
    );
  }

  const { error } = await client
    .from('exercises')
    .delete()
    .eq('id', exerciseId)
    .eq('user_id', userId);

  if (error) {
    throw new ExerciseLibraryError(
      `Failed to delete exercise: ${error.message}`,
      'DB_ERROR'
    );
  }
}
