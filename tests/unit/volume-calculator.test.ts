/**
 * Unit tests for the volume calculator service.
 * Validates session volume and muscle-group volume calculations.
 */
import {
    calculateSessionVolume,
    calculateVolumeByMuscleGroup,
} from '@/services/volume-calculator';
import type { Exercise } from '@/types/exercise';
import type { LoggedSet } from '@/types/session';
import { describe, expect, it } from 'vitest';

// --- Test helpers ---

function makeSet(overrides: Partial<LoggedSet> = {}): LoggedSet {
  return {
    id: 'set-1',
    session_id: 'session-1',
    exercise_id: 'exercise-1',
    set_number: 1,
    reps: 10,
    weight: 100,
    is_pr: false,
    logged_at: '2024-06-01T10:00:00Z',
    ...overrides,
  };
}

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'exercise-1',
    user_id: null,
    name: 'Bench Press',
    primary_muscle_group: 'chest',
    secondary_muscle_groups: ['triceps', 'shoulders'],
    instructions: 'Press the bar',
    is_global: true,
    ...overrides,
  };
}

// --- calculateSessionVolume ---

describe('calculateSessionVolume', () => {
  it('should return zero volume for an empty set array', () => {
    const result = calculateSessionVolume([]);
    expect(result.total_volume).toBe(0);
    expect(result.total_sets).toBe(0);
    expect(result.total_reps).toBe(0);
  });

  it('should calculate volume for a single set', () => {
    const sets = [makeSet({ reps: 10, weight: 100 })];
    const result = calculateSessionVolume(sets);
    expect(result.total_volume).toBe(1000);
    expect(result.total_sets).toBe(1);
    expect(result.total_reps).toBe(10);
  });

  it('should sum volume across multiple sets', () => {
    const sets = [
      makeSet({ reps: 10, weight: 100, set_number: 1 }),
      makeSet({ reps: 8, weight: 110, set_number: 2, id: 'set-2' }),
      makeSet({ reps: 6, weight: 120, set_number: 3, id: 'set-3' }),
    ];
    const result = calculateSessionVolume(sets);
    // 10*100 + 8*110 + 6*120 = 1000 + 880 + 720 = 2600
    expect(result.total_volume).toBe(2600);
    expect(result.total_sets).toBe(3);
    expect(result.total_reps).toBe(24);
  });

  it('should handle sets with zero weight (bodyweight exercises)', () => {
    const sets = [makeSet({ reps: 15, weight: 0 })];
    const result = calculateSessionVolume(sets);
    expect(result.total_volume).toBe(0);
    expect(result.total_sets).toBe(1);
    expect(result.total_reps).toBe(15);
  });

  it('should handle sets with zero reps', () => {
    const sets = [makeSet({ reps: 0, weight: 100 })];
    const result = calculateSessionVolume(sets);
    expect(result.total_volume).toBe(0);
    expect(result.total_sets).toBe(1);
    expect(result.total_reps).toBe(0);
  });
});

// --- calculateVolumeByMuscleGroup ---

describe('calculateVolumeByMuscleGroup', () => {
  const timeWindow = {
    start: '2024-06-01T00:00:00Z',
    end: '2024-06-07T23:59:59Z',
  };

  it('should return empty muscle_groups for no sets', () => {
    const result = calculateVolumeByMuscleGroup([], [], timeWindow);
    expect(result.muscle_groups).toEqual([]);
    expect(result.total_volume).toBe(0);
    expect(result.time_window).toEqual(timeWindow);
  });

  it('should group volume by primary muscle group', () => {
    const exercises = [
      makeExercise({ id: 'ex-1', primary_muscle_group: 'chest' }),
      makeExercise({ id: 'ex-2', name: 'Squat', primary_muscle_group: 'quads' }),
    ];
    const sets = [
      makeSet({ exercise_id: 'ex-1', reps: 10, weight: 100, logged_at: '2024-06-02T10:00:00Z' }),
      makeSet({ exercise_id: 'ex-1', reps: 8, weight: 100, id: 'set-2', logged_at: '2024-06-02T10:05:00Z' }),
      makeSet({ exercise_id: 'ex-2', reps: 5, weight: 150, id: 'set-3', logged_at: '2024-06-03T10:00:00Z' }),
    ];

    const result = calculateVolumeByMuscleGroup(sets, exercises, timeWindow);

    expect(result.total_volume).toBe(10 * 100 + 8 * 100 + 5 * 150); // 1000 + 800 + 750 = 2550
    expect(result.muscle_groups).toHaveLength(2);

    const chest = result.muscle_groups.find((mg) => mg.muscle_group === 'chest');
    const quads = result.muscle_groups.find((mg) => mg.muscle_group === 'quads');

    expect(chest?.volume).toBe(1800);
    expect(chest?.sets).toBe(2);
    expect(quads?.volume).toBe(750);
    expect(quads?.sets).toBe(1);
  });

  it('should exclude sets outside the time window', () => {
    const exercises = [makeExercise({ id: 'ex-1', primary_muscle_group: 'chest' })];
    const sets = [
      makeSet({ exercise_id: 'ex-1', reps: 10, weight: 100, logged_at: '2024-05-31T23:59:59Z' }), // before window
      makeSet({ exercise_id: 'ex-1', reps: 10, weight: 100, id: 'set-2', logged_at: '2024-06-03T10:00:00Z' }), // inside window
      makeSet({ exercise_id: 'ex-1', reps: 10, weight: 100, id: 'set-3', logged_at: '2024-06-08T00:00:01Z' }), // after window
    ];

    const result = calculateVolumeByMuscleGroup(sets, exercises, timeWindow);

    expect(result.total_volume).toBe(1000); // Only the set inside the window
    expect(result.muscle_groups).toHaveLength(1);
    expect(result.muscle_groups[0].sets).toBe(1);
  });

  it('should exclude sets whose exercise_id is not in the exercise list', () => {
    const exercises = [makeExercise({ id: 'ex-1', primary_muscle_group: 'chest' })];
    const sets = [
      makeSet({ exercise_id: 'ex-1', reps: 10, weight: 100, logged_at: '2024-06-02T10:00:00Z' }),
      makeSet({ exercise_id: 'ex-unknown', reps: 10, weight: 200, id: 'set-2', logged_at: '2024-06-02T10:00:00Z' }),
    ];

    const result = calculateVolumeByMuscleGroup(sets, exercises, timeWindow);

    expect(result.total_volume).toBe(1000); // Only the matched exercise set
    expect(result.muscle_groups).toHaveLength(1);
  });

  it('should sort muscle groups by volume descending', () => {
    const exercises = [
      makeExercise({ id: 'ex-1', primary_muscle_group: 'chest' }),
      makeExercise({ id: 'ex-2', name: 'Deadlift', primary_muscle_group: 'back' }),
      makeExercise({ id: 'ex-3', name: 'Curl', primary_muscle_group: 'biceps' }),
    ];
    const sets = [
      makeSet({ exercise_id: 'ex-3', reps: 10, weight: 20, logged_at: '2024-06-02T10:00:00Z' }), // biceps: 200
      makeSet({ exercise_id: 'ex-2', reps: 5, weight: 200, id: 'set-2', logged_at: '2024-06-02T10:00:00Z' }), // back: 1000
      makeSet({ exercise_id: 'ex-1', reps: 8, weight: 100, id: 'set-3', logged_at: '2024-06-02T10:00:00Z' }), // chest: 800
    ];

    const result = calculateVolumeByMuscleGroup(sets, exercises, timeWindow);

    expect(result.muscle_groups[0].muscle_group).toBe('back');
    expect(result.muscle_groups[1].muscle_group).toBe('chest');
    expect(result.muscle_groups[2].muscle_group).toBe('biceps');
  });
});
