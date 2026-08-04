/**
 * Cardio Auto-Fill Service
 *
 * Searches imported workouts (from HealthKit/Health Connect) for a matching
 * session and provides cardio field values (distance, duration, pace, speed,
 * elevation) that the UI can offer to pre-fill.
 *
 * Each returned value carries a `source` label so the UI can indicate whether
 * it came from the Health_Provider or was user-entered.
 *
 * Requirements: 15.1, 15.3
 */

import type { HealthProvider, ImportedWorkout } from '@/types/health';
import { supabase } from '@/utils/supabase';

// --- Types ---

export type CardioFieldSource = 'health_provider' | 'user';

export interface CardioAutofillField<T> {
  value: T;
  source: CardioFieldSource;
}

export interface CardioAutofillValues {
  distance_meters: CardioAutofillField<number> | null;
  duration_seconds: CardioAutofillField<number> | null;
  average_pace_seconds_per_km: CardioAutofillField<number> | null;
  average_speed_kmh: CardioAutofillField<number> | null;
  elevation_gain_meters: CardioAutofillField<number> | null;
}

export interface CardioAutofillResult {
  /** Whether a matching imported workout was found */
  found: boolean;
  /** The autofill values, null if no match found */
  values: CardioAutofillValues | null;
  /** The health provider name (e.g. 'apple_healthkit', 'health_connect') for UI labeling */
  providerName: HealthProvider | null;
  /** The matched imported workout, if any */
  matchedWorkout: ImportedWorkout | null;
}

// --- Configuration ---

/** Default time window (in hours) to search for matching imported workouts */
const DEFAULT_TIME_WINDOW_HOURS = 24;

/**
 * Mapping of common exercise names/types to imported workout types.
 * Used to match a session's exercise type to an imported workout's workout_type.
 */
const EXERCISE_TO_WORKOUT_TYPE_MAP: Record<string, string[]> = {
  // Running variants
  running: ['running', 'HKWorkoutActivityTypeRunning', 'jogging', 'trail_running'],
  run: ['running', 'HKWorkoutActivityTypeRunning', 'jogging', 'trail_running'],
  jogging: ['running', 'HKWorkoutActivityTypeRunning', 'jogging'],
  trail_running: ['running', 'trail_running', 'HKWorkoutActivityTypeRunning'],
  // Cycling variants
  cycling: ['cycling', 'HKWorkoutActivityTypeCycling', 'biking', 'indoor_cycling'],
  biking: ['cycling', 'HKWorkoutActivityTypeCycling', 'biking'],
  bike: ['cycling', 'HKWorkoutActivityTypeCycling', 'biking'],
  indoor_cycling: ['cycling', 'indoor_cycling', 'HKWorkoutActivityTypeCycling'],
  // Walking variants
  walking: ['walking', 'HKWorkoutActivityTypeWalking', 'hiking'],
  walk: ['walking', 'HKWorkoutActivityTypeWalking'],
  hiking: ['hiking', 'walking', 'HKWorkoutActivityTypeHiking'],
  // Swimming variants
  swimming: ['swimming', 'HKWorkoutActivityTypeSwimming', 'pool_swimming', 'open_water_swimming'],
  swim: ['swimming', 'HKWorkoutActivityTypeSwimming'],
  // Rowing
  rowing: ['rowing', 'HKWorkoutActivityTypeRowing', 'indoor_rowing'],
  // Elliptical
  elliptical: ['elliptical', 'HKWorkoutActivityTypeElliptical'],
};

// --- Core Functions ---

/**
 * Find a matching imported workout for a given session.
 *
 * Searches the `imported_workouts` table for workouts that:
 * - Belong to the specified user
 * - Occurred on the target date (within a configurable time window)
 * - Optionally match the session's exercise/activity type
 *
 * @param userId - The authenticated user's ID
 * @param programDayId - The program day being logged (used for context; not directly queried)
 * @param date - The target date to search around (typically today)
 * @param exerciseType - Optional exercise name/type to match against workout_type
 * @param timeWindowHours - Hours before/after `date` to search (default: 24)
 * @returns The best matching imported workout, or null if none found
 */
export async function findMatchingImportedWorkout(
  userId: string,
  programDayId: string,
  date: Date,
  exerciseType?: string,
  timeWindowHours: number = DEFAULT_TIME_WINDOW_HOURS
): Promise<ImportedWorkout | null> {
  // Calculate the search window
  const windowStart = new Date(date.getTime() - timeWindowHours * 60 * 60 * 1000);
  const windowEnd = new Date(date.getTime() + timeWindowHours * 60 * 60 * 1000);

  // Query imported_workouts within the time window
  const { data: workouts, error } = await supabase
    .from('imported_workouts')
    .select('*')
    .eq('user_id', userId)
    .gte('start_time', windowStart.toISOString())
    .lte('start_time', windowEnd.toISOString())
    .order('start_time', { ascending: false });

  if (error || !workouts || workouts.length === 0) {
    return null;
  }

  const importedWorkouts = workouts as unknown as ImportedWorkout[];

  // If an exercise type is provided, try to find a type-matched workout first
  if (exerciseType) {
    const matchedWorkout = findBestTypeMatch(importedWorkouts, exerciseType);
    if (matchedWorkout) {
      return matchedWorkout;
    }
  }

  // If no type match, return the most recent workout in the window
  // (useful when the user has a single cardio session that day)
  return importedWorkouts[0];
}

/**
 * Extract autofill-ready cardio values from an imported workout.
 *
 * Each field is wrapped with a source indicator so the UI can label
 * which values came from the health provider.
 *
 * @param importedWorkout - The matched imported workout
 * @returns CardioAutofillValues with source annotations
 */
export function getCardioAutofillValues(
  importedWorkout: ImportedWorkout
): CardioAutofillValues {
  return {
    distance_meters: importedWorkout.distance_meters != null
      ? { value: importedWorkout.distance_meters, source: 'health_provider' }
      : null,
    duration_seconds: importedWorkout.duration_seconds != null
      ? { value: importedWorkout.duration_seconds, source: 'health_provider' }
      : null,
    average_pace_seconds_per_km: importedWorkout.average_pace_seconds_per_km != null
      ? { value: importedWorkout.average_pace_seconds_per_km, source: 'health_provider' }
      : null,
    average_speed_kmh: importedWorkout.average_speed_kmh != null
      ? { value: importedWorkout.average_speed_kmh, source: 'health_provider' }
      : null,
    elevation_gain_meters: importedWorkout.elevation_gain_meters != null
      ? { value: importedWorkout.elevation_gain_meters, source: 'health_provider' }
      : null,
  };
}

/**
 * High-level convenience function that combines finding a matching workout
 * and extracting autofill values into a single call.
 *
 * Returns a CardioAutofillResult with:
 * - `found`: whether a match exists
 * - `values`: the autofill values (null if no match)
 * - `providerName`: the health provider for UI labeling
 * - `matchedWorkout`: the full matched workout object
 *
 * Returns gracefully with `found: false` if no matching workout exists.
 *
 * @param userId - The authenticated user's ID
 * @param programDayId - The program day being logged
 * @param date - The target date (typically today)
 * @param exerciseType - Optional exercise name to improve matching
 * @param timeWindowHours - Hours to search before/after date
 */
export async function getCardioAutofill(
  userId: string,
  programDayId: string,
  date: Date,
  exerciseType?: string,
  timeWindowHours: number = DEFAULT_TIME_WINDOW_HOURS
): Promise<CardioAutofillResult> {
  const matchedWorkout = await findMatchingImportedWorkout(
    userId,
    programDayId,
    date,
    exerciseType,
    timeWindowHours
  );

  if (!matchedWorkout) {
    return {
      found: false,
      values: null,
      providerName: null,
      matchedWorkout: null,
    };
  }

  const values = getCardioAutofillValues(matchedWorkout);

  return {
    found: true,
    values,
    providerName: matchedWorkout.provider,
    matchedWorkout,
  };
}

// --- Internal Helpers ---

/**
 * Find the best workout type match from a list of imported workouts.
 * Uses fuzzy matching against known exercise-to-workout type mappings.
 */
function findBestTypeMatch(
  workouts: ImportedWorkout[],
  exerciseType: string
): ImportedWorkout | null {
  const normalizedExerciseType = exerciseType.toLowerCase().replace(/[\s-_]+/g, '_');

  // Get the list of acceptable workout types for this exercise
  const acceptableTypes = EXERCISE_TO_WORKOUT_TYPE_MAP[normalizedExerciseType];

  if (acceptableTypes) {
    // Direct mapping found — search for a workout matching any acceptable type
    for (const workout of workouts) {
      const workoutTypeLower = workout.workout_type.toLowerCase();
      if (acceptableTypes.some((t) => workoutTypeLower.includes(t.toLowerCase()))) {
        return workout;
      }
    }
  }

  // Fallback: try substring matching on the exercise type directly
  for (const workout of workouts) {
    const workoutTypeLower = workout.workout_type.toLowerCase();
    if (
      workoutTypeLower.includes(normalizedExerciseType) ||
      normalizedExerciseType.includes(workoutTypeLower)
    ) {
      return workout;
    }
  }

  return null;
}
