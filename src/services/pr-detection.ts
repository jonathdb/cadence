/**
 * PR (Personal Record) Detection Service
 *
 * Detects personal records for exercises based on:
 * - Best weight lifted
 * - Best reps at a given weight
 * - Best estimated 1RM (Brzycki formula)
 *
 * Runs client-side against cached history for immediate feedback.
 * Confirmed server-side on session completion.
 */

import type { PRType } from '@/types/session';

export interface PRResult {
  is_pr: boolean;
  pr_type: PRType | null;
  previous_best: number | null;
  new_best: number | null;
}

export interface ExerciseHistory {
  exercise_id: string;
  sets: Array<{ reps: number; weight: number }>;
}

/**
 * Calculate estimated 1RM using the Brzycki formula.
 *
 * Formula: weight × (36 / (37 - reps))
 *
 * Valid for reps 1–36. At 37 reps, the formula produces division by zero.
 * For 1 rep, the result equals the weight itself (36/36 = 1).
 *
 * @param weight - The weight lifted
 * @param reps - The number of repetitions performed (must be 1–36)
 * @returns The estimated one-rep max, or 0 if inputs are invalid
 */
export function calculateEstimated1RM(weight: number, reps: number): number {
  if (reps < 1 || reps > 36 || weight <= 0) {
    return 0;
  }
  return weight * (36 / (37 - reps));
}

/**
 * Detect whether a logged set constitutes a personal record.
 *
 * Checks against the full exercise history for:
 * 1. Best weight PR — new set's weight exceeds max weight ever logged
 * 2. Best reps at weight PR — more reps than any previous set at the same weight
 * 3. Best estimated 1RM PR — higher Brzycki estimated 1RM than any previous set
 *
 * Priority when multiple PR types are achieved: weight > estimated_1rm > reps_at_weight
 *
 * @param set - The newly logged set (reps and weight)
 * @param history - The full exercise history for the same exercise
 * @returns PRResult indicating if a PR was achieved and its details
 */
export function detectPR(
  set: { reps: number; weight: number },
  history: ExerciseHistory
): PRResult {
  const noPR: PRResult = {
    is_pr: false,
    pr_type: null,
    previous_best: null,
    new_best: null,
  };

  // Validate inputs
  if (set.reps < 1 || set.weight <= 0) {
    return noPR;
  }

  // If no history, this set is automatically a weight PR
  if (history.sets.length === 0) {
    return {
      is_pr: true,
      pr_type: 'weight',
      previous_best: null,
      new_best: set.weight,
    };
  }

  // Check weight PR: new set weight exceeds max ever logged
  const previousBestWeight = Math.max(...history.sets.map((s) => s.weight));
  const isWeightPR = set.weight > previousBestWeight;

  // Check reps at weight PR: more reps than any previous set at the same weight
  const setsAtSameWeight = history.sets.filter((s) => s.weight === set.weight);
  const previousBestRepsAtWeight =
    setsAtSameWeight.length > 0
      ? Math.max(...setsAtSameWeight.map((s) => s.reps))
      : 0;
  const isRepsAtWeightPR =
    setsAtSameWeight.length > 0 && set.reps > previousBestRepsAtWeight;

  // Check estimated 1RM PR (only valid for reps 1–36)
  const newEstimated1RM = calculateEstimated1RM(set.weight, set.reps);
  const previousBest1RM = Math.max(
    ...history.sets
      .filter((s) => s.reps >= 1 && s.reps <= 36 && s.weight > 0)
      .map((s) => calculateEstimated1RM(s.weight, s.reps)),
    0
  );
  const isEstimated1RMPR = newEstimated1RM > 0 && newEstimated1RM > previousBest1RM;

  // Apply priority: weight > estimated_1rm > reps_at_weight
  if (isWeightPR) {
    return {
      is_pr: true,
      pr_type: 'weight',
      previous_best: previousBestWeight,
      new_best: set.weight,
    };
  }

  if (isEstimated1RMPR) {
    return {
      is_pr: true,
      pr_type: 'estimated_1rm',
      previous_best: previousBest1RM,
      new_best: newEstimated1RM,
    };
  }

  if (isRepsAtWeightPR) {
    return {
      is_pr: true,
      pr_type: 'reps_at_weight',
      previous_best: previousBestRepsAtWeight,
      new_best: set.reps,
    };
  }

  return noPR;
}
