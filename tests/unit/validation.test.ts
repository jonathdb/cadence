/**
 * Unit tests for the input validation module.
 * Validates logged sets, program names, exercises, and exercise configs.
 */
import {
    validateExercise,
    validateExerciseConfig,
    validateLoggedSet,
    validateProgramName
} from '@/lib/validation';
import { describe, expect, it } from 'vitest';

// ─── validateLoggedSet ──────────────────────────────────────────────────────────

describe('validateLoggedSet', () => {
  it('should accept valid reps, weight, and RPE', () => {
    const result = validateLoggedSet({ reps: 10, weight: 80, rpe: 7.5 });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('should accept null/undefined fields (not provided)', () => {
    const result = validateLoggedSet({});
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('should accept boundary values', () => {
    expect(validateLoggedSet({ reps: 1 }).valid).toBe(true);
    expect(validateLoggedSet({ reps: 999 }).valid).toBe(true);
    expect(validateLoggedSet({ weight: 0 }).valid).toBe(true);
    expect(validateLoggedSet({ weight: 999 }).valid).toBe(true);
    expect(validateLoggedSet({ rpe: 1 }).valid).toBe(true);
    expect(validateLoggedSet({ rpe: 10 }).valid).toBe(true);
  });

  it('should reject non-integer reps', () => {
    const result = validateLoggedSet({ reps: 5.5 });
    expect(result.valid).toBe(false);
    expect(result.errors.reps).toBeDefined();
  });

  it('should reject reps below minimum', () => {
    const result = validateLoggedSet({ reps: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.reps).toBeDefined();
  });

  it('should reject reps above maximum', () => {
    const result = validateLoggedSet({ reps: 1000 });
    expect(result.valid).toBe(false);
    expect(result.errors.reps).toBeDefined();
  });

  it('should accept weight in 0.5 increments', () => {
    expect(validateLoggedSet({ weight: 0.5 }).valid).toBe(true);
    expect(validateLoggedSet({ weight: 2.5 }).valid).toBe(true);
    expect(validateLoggedSet({ weight: 100.0 }).valid).toBe(true);
  });

  it('should reject weight not in 0.5 increments', () => {
    const result = validateLoggedSet({ weight: 50.3 });
    expect(result.valid).toBe(false);
    expect(result.errors.weight).toBeDefined();
  });

  it('should reject weight above maximum', () => {
    const result = validateLoggedSet({ weight: 1000 });
    expect(result.valid).toBe(false);
    expect(result.errors.weight).toBeDefined();
  });

  it('should reject weight below minimum', () => {
    const result = validateLoggedSet({ weight: -1 });
    expect(result.valid).toBe(false);
    expect(result.errors.weight).toBeDefined();
  });

  it('should accept RPE in 0.5 increments', () => {
    expect(validateLoggedSet({ rpe: 6.5 }).valid).toBe(true);
    expect(validateLoggedSet({ rpe: 8 }).valid).toBe(true);
  });

  it('should reject RPE not in 0.5 increments', () => {
    const result = validateLoggedSet({ rpe: 7.3 });
    expect(result.valid).toBe(false);
    expect(result.errors.rpe).toBeDefined();
  });

  it('should reject RPE outside range', () => {
    expect(validateLoggedSet({ rpe: 0.5 }).valid).toBe(false);
    expect(validateLoggedSet({ rpe: 10.5 }).valid).toBe(false);
  });

  it('should return multiple errors for multiple invalid fields', () => {
    const result = validateLoggedSet({ reps: 0, weight: -1, rpe: 11 });
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors).length).toBe(3);
  });
});

// ─── validateProgramName ────────────────────────────────────────────────────────

describe('validateProgramName', () => {
  it('should accept valid program names', () => {
    expect(validateProgramName('Push Pull Legs').valid).toBe(true);
    expect(validateProgramName('A').valid).toBe(true);
  });

  it('should reject empty string', () => {
    const result = validateProgramName('');
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  it('should reject whitespace-only string', () => {
    const result = validateProgramName('   ');
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  it('should reject names longer than 100 characters', () => {
    const result = validateProgramName('a'.repeat(101));
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  it('should accept name with exactly 100 characters', () => {
    const result = validateProgramName('a'.repeat(100));
    expect(result.valid).toBe(true);
  });
});

// ─── validateExercise ───────────────────────────────────────────────────────────

describe('validateExercise', () => {
  it('should accept valid exercise input', () => {
    const result = validateExercise({
      name: 'Romanian Deadlift',
      primary_muscle_group: 'hamstrings',
      secondary_muscle_groups: ['glutes', 'lower back'],
      instructions: 'Hinge at hips...',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('should require exercise name', () => {
    const result = validateExercise({
      name: null,
      primary_muscle_group: 'chest',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  it('should reject whitespace-only exercise name', () => {
    const result = validateExercise({
      name: '   ',
      primary_muscle_group: 'chest',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  it('should reject exercise name longer than 100 characters', () => {
    const result = validateExercise({
      name: 'a'.repeat(101),
      primary_muscle_group: 'chest',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  it('should require primary muscle group', () => {
    const result = validateExercise({
      name: 'Bench Press',
      primary_muscle_group: null,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.primary_muscle_group).toBeDefined();
  });

  it('should reject more than 3 secondary muscle groups', () => {
    const result = validateExercise({
      name: 'Bench Press',
      primary_muscle_group: 'chest',
      secondary_muscle_groups: ['triceps', 'shoulders', 'core', 'biceps'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.secondary_muscle_groups).toBeDefined();
  });

  it('should accept up to 3 secondary muscle groups', () => {
    const result = validateExercise({
      name: 'Bench Press',
      primary_muscle_group: 'chest',
      secondary_muscle_groups: ['triceps', 'shoulders', 'core'],
    });
    expect(result.valid).toBe(true);
  });

  it('should reject instructions longer than 2000 characters', () => {
    const result = validateExercise({
      name: 'Bench Press',
      primary_muscle_group: 'chest',
      instructions: 'a'.repeat(2001),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.instructions).toBeDefined();
  });

  it('should accept instructions of exactly 2000 characters', () => {
    const result = validateExercise({
      name: 'Bench Press',
      primary_muscle_group: 'chest',
      instructions: 'a'.repeat(2000),
    });
    expect(result.valid).toBe(true);
  });
});

// ─── validateExerciseConfig ─────────────────────────────────────────────────────

describe('validateExerciseConfig', () => {
  it('should accept valid exercise config', () => {
    const result = validateExerciseConfig({
      target_sets: 4,
      target_reps: '8-12',
      target_weight: 80,
      target_rpe: 8,
      rest_timer: 120,
      notes: 'Focus on form',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('should accept empty config (all null)', () => {
    const result = validateExerciseConfig({});
    expect(result.valid).toBe(true);
  });

  it('should reject non-integer target sets', () => {
    const result = validateExerciseConfig({ target_sets: 3.5 });
    expect(result.valid).toBe(false);
    expect(result.errors.target_sets).toBeDefined();
  });

  it('should reject target sets outside range', () => {
    expect(validateExerciseConfig({ target_sets: 0 }).valid).toBe(false);
    expect(validateExerciseConfig({ target_sets: 100 }).valid).toBe(false);
  });

  it('should accept target sets at boundaries', () => {
    expect(validateExerciseConfig({ target_sets: 1 }).valid).toBe(true);
    expect(validateExerciseConfig({ target_sets: 99 }).valid).toBe(true);
  });

  it('should reject target reps longer than 20 characters', () => {
    const result = validateExerciseConfig({ target_reps: 'a'.repeat(21) });
    expect(result.valid).toBe(false);
    expect(result.errors.target_reps).toBeDefined();
  });

  it('should accept target reps like "8-12"', () => {
    expect(validateExerciseConfig({ target_reps: '8-12' }).valid).toBe(true);
  });

  it('should reject rest timer not in 5-second increments', () => {
    const result = validateExerciseConfig({ rest_timer: 63 });
    expect(result.valid).toBe(false);
    expect(result.errors.rest_timer).toBeDefined();
  });

  it('should accept rest timer in 5-second increments', () => {
    expect(validateExerciseConfig({ rest_timer: 0 }).valid).toBe(true);
    expect(validateExerciseConfig({ rest_timer: 60 }).valid).toBe(true);
    expect(validateExerciseConfig({ rest_timer: 600 }).valid).toBe(true);
  });

  it('should reject rest timer outside range', () => {
    expect(validateExerciseConfig({ rest_timer: -5 }).valid).toBe(false);
    expect(validateExerciseConfig({ rest_timer: 605 }).valid).toBe(false);
  });

  it('should reject notes longer than 500 characters', () => {
    const result = validateExerciseConfig({ notes: 'a'.repeat(501) });
    expect(result.valid).toBe(false);
    expect(result.errors.notes).toBeDefined();
  });
});
