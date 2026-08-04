/**
 * Volume Calculator Service
 *
 * Calculates training volume metrics for sessions and muscle groups.
 * Volume = sum of (reps × weight) across sets.
 */

import type { Exercise } from '@/types/exercise';
import type { LoggedSet } from '@/types/session';

export interface SessionVolume {
  total_volume: number; // sum of reps * weight for all sets
  total_sets: number;
  total_reps: number;
}

export interface MuscleGroupVolume {
  muscle_group: string;
  volume: number; // sum of reps * weight for sets targeting this muscle
  sets: number;
}

export interface VolumeByMuscleGroup {
  muscle_groups: MuscleGroupVolume[];
  total_volume: number;
  time_window: { start: string; end: string };
}

/**
 * Calculate the total volume for a session.
 * Volume is the sum of (reps × weight) for all logged sets.
 */
export function calculateSessionVolume(sets: LoggedSet[]): SessionVolume {
  let total_volume = 0;
  let total_reps = 0;

  for (const set of sets) {
    total_volume += set.reps * set.weight;
    total_reps += set.reps;
  }

  return {
    total_volume,
    total_sets: sets.length,
    total_reps,
  };
}

/**
 * Calculate volume grouped by primary muscle group over a time window.
 * Each set's volume is attributed to its exercise's primary_muscle_group.
 * Sets whose exercise_id is not found in the exercises array are excluded.
 */
export function calculateVolumeByMuscleGroup(
  sets: LoggedSet[],
  exercises: Exercise[],
  timeWindow: { start: string; end: string }
): VolumeByMuscleGroup {
  // Build a lookup map for exercises by ID
  const exerciseMap = new Map<string, Exercise>();
  for (const exercise of exercises) {
    exerciseMap.set(exercise.id, exercise);
  }

  // Filter sets within the time window
  const startTime = new Date(timeWindow.start).getTime();
  const endTime = new Date(timeWindow.end).getTime();

  const filteredSets = sets.filter((set) => {
    const loggedAt = new Date(set.logged_at).getTime();
    return loggedAt >= startTime && loggedAt <= endTime;
  });

  // Group volume by muscle group
  const muscleGroupMap = new Map<string, { volume: number; sets: number }>();

  let total_volume = 0;

  for (const set of filteredSets) {
    const exercise = exerciseMap.get(set.exercise_id);
    if (!exercise) continue;

    const muscleGroup = exercise.primary_muscle_group;
    const setVolume = set.reps * set.weight;
    total_volume += setVolume;

    const existing = muscleGroupMap.get(muscleGroup);
    if (existing) {
      existing.volume += setVolume;
      existing.sets += 1;
    } else {
      muscleGroupMap.set(muscleGroup, { volume: setVolume, sets: 1 });
    }
  }

  // Convert map to sorted array
  const muscle_groups: MuscleGroupVolume[] = Array.from(muscleGroupMap.entries())
    .map(([muscle_group, data]) => ({
      muscle_group,
      volume: data.volume,
      sets: data.sets,
    }))
    .sort((a, b) => b.volume - a.volume); // Sort by volume descending

  return {
    muscle_groups,
    total_volume,
    time_window: timeWindow,
  };
}
