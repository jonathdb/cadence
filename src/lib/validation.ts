/**
 * Input Validation Module for Cadence fitness app.
 *
 * Provides validation functions for logged sets, program names, exercise configs,
 * and custom exercises. All range constants are exported for reuse in UI components.
 *
 * @module validation
 */

// ─── Range Constants ────────────────────────────────────────────────────────────

/** Reps: integer values 1–999 */
export const REPS_RANGE = { min: 1, max: 999, step: 1 } as const;

/** Weight: 0–999 in 0.5 increments */
export const WEIGHT_RANGE = { min: 0, max: 999, step: 0.5 } as const;

/** RPE: 1–10 in 0.5 increments */
export const RPE_RANGE = { min: 1, max: 10, step: 0.5 } as const;

/** Rest timer: 0–600 seconds in 5-second increments */
export const REST_TIMER_RANGE = { min: 0, max: 600, step: 5 } as const;

/** Program name length: 1–100 characters, non-empty */
export const PROGRAM_NAME_LENGTH = { min: 1, max: 100 } as const;

/** Exercise name length: 1–100 characters, non-empty */
export const EXERCISE_NAME_LENGTH = { min: 1, max: 100 } as const;

/** Exercise instructions: up to 2000 characters */
export const INSTRUCTIONS_LENGTH = { max: 2000 } as const;

/** Exercise/set notes: up to 500 characters */
export const NOTES_LENGTH = { max: 500 } as const;

/** Target sets per exercise: 1–99 */
export const TARGET_SETS_RANGE = { min: 1, max: 99, step: 1 } as const;

/** Target reps text field: up to 20 characters */
export const TARGET_REPS_LENGTH = { max: 20 } as const;

/** Maximum days per program */
export const MAX_DAYS_PER_PROGRAM = 14;

/** Maximum exercises per day */
export const MAX_EXERCISES_PER_DAY = 20;

/** Maximum exercises per session */
export const MAX_EXERCISES_PER_SESSION = 50;

/** Maximum secondary muscle groups for a custom exercise */
export const MAX_SECONDARY_MUSCLE_GROUPS = 3;

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export interface LoggedSetInput {
  reps?: number | null;
  weight?: number | null;
  rpe?: number | null;
}

export interface ExerciseConfigInput {
  target_sets?: number | null;
  target_reps?: string | null;
  target_weight?: number | null;
  target_rpe?: number | null;
  rest_timer?: number | null;
  notes?: string | null;
}

export interface CreateExerciseInput {
  name?: string | null;
  primary_muscle_group?: string | null;
  secondary_muscle_groups?: string[] | null;
  instructions?: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

function isMultipleOf(value: number, step: number): boolean {
  // Use rounding to avoid floating point issues (e.g. 2.5 % 0.5)
  const remainder = Math.abs(Math.round((value % step) * 1000) / 1000);
  return remainder === 0 || Math.abs(remainder - step) < 0.001;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// ─── Validation Functions ───────────────────────────────────────────────────────

/**
 * Validate a logged set's numeric fields (reps, weight, RPE).
 *
 * - Reps: integer in [1, 999]
 * - Weight: in [0, 999], must be a multiple of 0.5
 * - RPE: in [1, 10], must be a multiple of 0.5
 *
 * Fields that are null/undefined are skipped (treated as not provided).
 */
export function validateLoggedSet(input: LoggedSetInput): ValidationResult {
  const errors: Record<string, string> = {};

  // Validate reps
  if (input.reps != null) {
    if (!isInteger(input.reps)) {
      errors.reps = 'Reps must be a whole number';
    } else if (input.reps < REPS_RANGE.min || input.reps > REPS_RANGE.max) {
      errors.reps = `Reps must be between ${REPS_RANGE.min} and ${REPS_RANGE.max}`;
    }
  }

  // Validate weight
  if (input.weight != null) {
    if (input.weight < WEIGHT_RANGE.min || input.weight > WEIGHT_RANGE.max) {
      errors.weight = `Weight must be between ${WEIGHT_RANGE.min} and ${WEIGHT_RANGE.max}`;
    } else if (!isMultipleOf(input.weight, WEIGHT_RANGE.step)) {
      errors.weight = `Weight must be in ${WEIGHT_RANGE.step} increments`;
    }
  }

  // Validate RPE
  if (input.rpe != null) {
    if (input.rpe < RPE_RANGE.min || input.rpe > RPE_RANGE.max) {
      errors.rpe = `RPE must be between ${RPE_RANGE.min} and ${RPE_RANGE.max}`;
    } else if (!isMultipleOf(input.rpe, RPE_RANGE.step)) {
      errors.rpe = `RPE must be in ${RPE_RANGE.step} increments`;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate a program name.
 *
 * - Must be a non-empty string (after trimming)
 * - Must be 1–100 characters long
 */
export function validateProgramName(name: string): ValidationResult {
  const errors: Record<string, string> = {};

  if (!isNonEmptyString(name)) {
    errors.name = 'Program name is required';
  } else if (name.trim().length < PROGRAM_NAME_LENGTH.min) {
    errors.name = `Program name must be at least ${PROGRAM_NAME_LENGTH.min} character`;
  } else if (name.trim().length > PROGRAM_NAME_LENGTH.max) {
    errors.name = `Program name must be at most ${PROGRAM_NAME_LENGTH.max} characters`;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate a custom exercise creation/edit input.
 *
 * - Name: 1–100 characters, non-empty after trimming
 * - Primary muscle group: required, non-empty
 * - Secondary muscle groups: optional, at most 3
 * - Instructions: optional, at most 2000 characters
 */
export function validateExercise(input: CreateExerciseInput): ValidationResult {
  const errors: Record<string, string> = {};

  // Validate name
  if (!isNonEmptyString(input.name)) {
    errors.name = 'Exercise name is required';
  } else if (input.name!.trim().length < EXERCISE_NAME_LENGTH.min) {
    errors.name = `Exercise name must be at least ${EXERCISE_NAME_LENGTH.min} character`;
  } else if (input.name!.trim().length > EXERCISE_NAME_LENGTH.max) {
    errors.name = `Exercise name must be at most ${EXERCISE_NAME_LENGTH.max} characters`;
  }

  // Validate primary muscle group
  if (!isNonEmptyString(input.primary_muscle_group)) {
    errors.primary_muscle_group = 'Primary muscle group is required';
  }

  // Validate secondary muscle groups
  if (input.secondary_muscle_groups != null) {
    if (input.secondary_muscle_groups.length > MAX_SECONDARY_MUSCLE_GROUPS) {
      errors.secondary_muscle_groups = `At most ${MAX_SECONDARY_MUSCLE_GROUPS} secondary muscle groups allowed`;
    }
  }

  // Validate instructions
  if (input.instructions != null && input.instructions.length > INSTRUCTIONS_LENGTH.max) {
    errors.instructions = `Instructions must be at most ${INSTRUCTIONS_LENGTH.max} characters`;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate exercise configuration fields when adding an exercise to a program day.
 *
 * - Target sets: integer in [1, 99]
 * - Target reps: text up to 20 characters (accepts ranges like "8-12")
 * - Target weight: 0–999 in 0.5 increments
 * - Target RPE: 1–10 in 0.5 increments
 * - Rest timer: 0–600 in 5-second increments
 * - Notes: up to 500 characters
 */
export function validateExerciseConfig(input: ExerciseConfigInput): ValidationResult {
  const errors: Record<string, string> = {};

  // Validate target sets
  if (input.target_sets != null) {
    if (!isInteger(input.target_sets)) {
      errors.target_sets = 'Target sets must be a whole number';
    } else if (input.target_sets < TARGET_SETS_RANGE.min || input.target_sets > TARGET_SETS_RANGE.max) {
      errors.target_sets = `Target sets must be between ${TARGET_SETS_RANGE.min} and ${TARGET_SETS_RANGE.max}`;
    }
  }

  // Validate target reps (text field)
  if (input.target_reps != null && input.target_reps.length > TARGET_REPS_LENGTH.max) {
    errors.target_reps = `Target reps must be at most ${TARGET_REPS_LENGTH.max} characters`;
  }

  // Validate target weight
  if (input.target_weight != null) {
    if (input.target_weight < WEIGHT_RANGE.min || input.target_weight > WEIGHT_RANGE.max) {
      errors.target_weight = `Target weight must be between ${WEIGHT_RANGE.min} and ${WEIGHT_RANGE.max}`;
    } else if (!isMultipleOf(input.target_weight, WEIGHT_RANGE.step)) {
      errors.target_weight = `Target weight must be in ${WEIGHT_RANGE.step} increments`;
    }
  }

  // Validate target RPE
  if (input.target_rpe != null) {
    if (input.target_rpe < RPE_RANGE.min || input.target_rpe > RPE_RANGE.max) {
      errors.target_rpe = `Target RPE must be between ${RPE_RANGE.min} and ${RPE_RANGE.max}`;
    } else if (!isMultipleOf(input.target_rpe, RPE_RANGE.step)) {
      errors.target_rpe = `Target RPE must be in ${RPE_RANGE.step} increments`;
    }
  }

  // Validate rest timer
  if (input.rest_timer != null) {
    if (input.rest_timer < REST_TIMER_RANGE.min || input.rest_timer > REST_TIMER_RANGE.max) {
      errors.rest_timer = `Rest timer must be between ${REST_TIMER_RANGE.min} and ${REST_TIMER_RANGE.max} seconds`;
    } else if (!isMultipleOf(input.rest_timer, REST_TIMER_RANGE.step)) {
      errors.rest_timer = `Rest timer must be in ${REST_TIMER_RANGE.step}-second increments`;
    }
  }

  // Validate notes
  if (input.notes != null && input.notes.length > NOTES_LENGTH.max) {
    errors.notes = `Notes must be at most ${NOTES_LENGTH.max} characters`;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
