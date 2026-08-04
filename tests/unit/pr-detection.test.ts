/**
 * Unit tests for PR Detection Service.
 * Validates Brzycki formula, PR detection logic, and priority ordering.
 */
import { describe, expect, it } from 'vitest';

import {
    calculateEstimated1RM,
    detectPR,
    type ExerciseHistory,
} from '@/services/pr-detection';

describe('PR Detection Service', () => {
  describe('calculateEstimated1RM (Brzycki formula)', () => {
    it('should return the weight itself for 1 rep', () => {
      // Brzycki: weight * (36 / (37 - 1)) = weight * (36/36) = weight
      expect(calculateEstimated1RM(100, 1)).toBe(100);
    });

    it('should calculate correctly for typical rep ranges', () => {
      // 100kg × 10 reps: 100 * (36 / (37 - 10)) = 100 * (36/27) ≈ 133.33
      const result = calculateEstimated1RM(100, 10);
      expect(result).toBeCloseTo(133.33, 1);
    });

    it('should calculate correctly for 5 reps', () => {
      // 100kg × 5 reps: 100 * (36 / (37 - 5)) = 100 * (36/32) = 112.5
      expect(calculateEstimated1RM(100, 5)).toBe(112.5);
    });

    it('should handle the upper boundary of 36 reps', () => {
      // 50kg × 36 reps: 50 * (36 / (37 - 36)) = 50 * 36 = 1800
      expect(calculateEstimated1RM(50, 36)).toBe(1800);
    });

    it('should return 0 for invalid reps (0 or less)', () => {
      expect(calculateEstimated1RM(100, 0)).toBe(0);
      expect(calculateEstimated1RM(100, -1)).toBe(0);
    });

    it('should return 0 for reps exceeding 36', () => {
      expect(calculateEstimated1RM(100, 37)).toBe(0);
      expect(calculateEstimated1RM(100, 50)).toBe(0);
    });

    it('should return 0 for zero or negative weight', () => {
      expect(calculateEstimated1RM(0, 5)).toBe(0);
      expect(calculateEstimated1RM(-10, 5)).toBe(0);
    });
  });

  describe('detectPR', () => {
    const emptyHistory: ExerciseHistory = {
      exercise_id: 'exercise-1',
      sets: [],
    };

    describe('with empty history', () => {
      it('should detect a weight PR on the first set ever logged', () => {
        const result = detectPR({ reps: 10, weight: 100 }, emptyHistory);
        expect(result.is_pr).toBe(true);
        expect(result.pr_type).toBe('weight');
        expect(result.previous_best).toBeNull();
        expect(result.new_best).toBe(100);
      });
    });

    describe('weight PR detection', () => {
      it('should detect a weight PR when new weight exceeds all history', () => {
        const history: ExerciseHistory = {
          exercise_id: 'exercise-1',
          sets: [
            { reps: 5, weight: 80 },
            { reps: 8, weight: 70 },
            { reps: 3, weight: 90 },
          ],
        };

        const result = detectPR({ reps: 5, weight: 100 }, history);
        expect(result.is_pr).toBe(true);
        expect(result.pr_type).toBe('weight');
        expect(result.previous_best).toBe(90);
        expect(result.new_best).toBe(100);
      });

      it('should not detect a weight PR when weight equals the best', () => {
        const history: ExerciseHistory = {
          exercise_id: 'exercise-1',
          sets: [{ reps: 5, weight: 100 }],
        };

        const result = detectPR({ reps: 5, weight: 100 }, history);
        // Weight is not exceeded; check if reps_at_weight or estimated_1rm PR
        expect(result.pr_type).not.toBe('weight');
      });
    });

    describe('reps at weight PR detection', () => {
      it('should detect a reps_at_weight PR when more reps at the same weight', () => {
        const history: ExerciseHistory = {
          exercise_id: 'exercise-1',
          sets: [
            { reps: 5, weight: 100 },
            { reps: 8, weight: 80 },
          ],
        };

        // Same weight (100), but more reps (8 > 5)
        const result = detectPR({ reps: 8, weight: 100 }, history);
        expect(result.is_pr).toBe(true);
        // This is also an estimated 1RM PR since more reps at same weight
        // Priority: weight > estimated_1rm > reps_at_weight
        // estimated_1rm: 100*(36/29) ≈ 124.14 vs previous best 100*(36/32)=112.5
        // So estimated_1rm PR should take priority
        expect(result.pr_type).toBe('estimated_1rm');
      });

      it('should detect reps_at_weight when estimated_1rm is not a PR', () => {
        const history: ExerciseHistory = {
          exercise_id: 'exercise-1',
          sets: [
            { reps: 5, weight: 100 }, // 1RM = 112.5
            { reps: 10, weight: 80 }, // 1RM ≈ 106.67
            { reps: 3, weight: 120 }, // 1RM ≈ 127.06
          ],
        };

        // 7 reps at 100: 1RM = 100*(36/30) = 120 (less than 127.06 from history)
        // But more reps at 100 than previous best of 5
        const result = detectPR({ reps: 7, weight: 100 }, history);
        expect(result.is_pr).toBe(true);
        expect(result.pr_type).toBe('reps_at_weight');
        expect(result.previous_best).toBe(5);
        expect(result.new_best).toBe(7);
      });
    });

    describe('estimated 1RM PR detection', () => {
      it('should detect an estimated_1rm PR with higher calculated 1RM', () => {
        const history: ExerciseHistory = {
          exercise_id: 'exercise-1',
          sets: [
            { reps: 5, weight: 100 }, // 1RM = 112.5
          ],
        };

        // 10 reps at 95: 1RM = 95*(36/27) ≈ 126.67 > 112.5
        const result = detectPR({ reps: 10, weight: 95 }, history);
        expect(result.is_pr).toBe(true);
        expect(result.pr_type).toBe('estimated_1rm');
        expect(result.previous_best).toBeCloseTo(112.5);
        expect(result.new_best).toBeCloseTo(126.67, 1);
      });
    });

    describe('priority ordering', () => {
      it('should prioritize weight PR over estimated_1rm and reps_at_weight', () => {
        const history: ExerciseHistory = {
          exercise_id: 'exercise-1',
          sets: [{ reps: 10, weight: 80 }],
        };

        // New set: 10 reps at 100
        // Weight PR: 100 > 80 ✓
        // Reps at weight: no history at 100, so N/A
        // Estimated 1RM PR: also likely ✓
        // Weight should win
        const result = detectPR({ reps: 10, weight: 100 }, history);
        expect(result.is_pr).toBe(true);
        expect(result.pr_type).toBe('weight');
        expect(result.previous_best).toBe(80);
        expect(result.new_best).toBe(100);
      });

      it('should prioritize estimated_1rm PR over reps_at_weight', () => {
        const history: ExerciseHistory = {
          exercise_id: 'exercise-1',
          sets: [
            { reps: 5, weight: 100 }, // 1RM = 112.5
            { reps: 3, weight: 100 }, // 1RM ≈ 105.88
          ],
        };

        // 8 reps at 100: 1RM = 100*(36/29) ≈ 124.14 > 112.5 ✓
        // Also reps_at_weight PR: 8 > 5 ✓
        // estimated_1rm should win
        const result = detectPR({ reps: 8, weight: 100 }, history);
        expect(result.is_pr).toBe(true);
        expect(result.pr_type).toBe('estimated_1rm');
      });
    });

    describe('no PR cases', () => {
      it('should return no PR when set does not beat any records', () => {
        const history: ExerciseHistory = {
          exercise_id: 'exercise-1',
          sets: [
            { reps: 10, weight: 100 }, // 1RM ≈ 133.33
            { reps: 5, weight: 120 }, // 1RM = 135
          ],
        };

        // 3 reps at 90: weight not a PR, reps at 90 not in history, 1RM = 90*(36/34) ≈ 95.29
        const result = detectPR({ reps: 3, weight: 90 }, history);
        expect(result.is_pr).toBe(false);
        expect(result.pr_type).toBeNull();
        expect(result.previous_best).toBeNull();
        expect(result.new_best).toBeNull();
      });

      it('should return no PR for invalid input (0 reps)', () => {
        const history: ExerciseHistory = {
          exercise_id: 'exercise-1',
          sets: [{ reps: 5, weight: 50 }],
        };

        const result = detectPR({ reps: 0, weight: 100 }, history);
        expect(result.is_pr).toBe(false);
      });

      it('should return no PR for invalid input (0 weight)', () => {
        const history: ExerciseHistory = {
          exercise_id: 'exercise-1',
          sets: [{ reps: 5, weight: 50 }],
        };

        const result = detectPR({ reps: 5, weight: 0 }, history);
        expect(result.is_pr).toBe(false);
      });
    });
  });
});
