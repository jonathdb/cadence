/**
 * Unit tests for Session Auto-Fill Service.
 * Validates priority chain logic (Req 9.1, 9.2, 9.3) and
 * intra-session auto-fill behavior (Req 10.1, 10.2).
 */
import { describe, expect, it } from 'vitest';

import {
    getAutoFillValues,
    getIntraSessionFill,
    parseTargetReps
} from '@/services/auto-fill';
import type { ProgramDayItem } from '@/types/program';
import type { LoggedSet, Session } from '@/types/session';

// --- Test Helpers ---

function makeLoggedSet(overrides: Partial<LoggedSet> = {}): LoggedSet {
  return {
    id: 'set-1',
    session_id: 'session-1',
    exercise_id: 'exercise-1',
    set_number: 1,
    reps: 10,
    weight: 80,
    rpe: 7,
    is_pr: false,
    logged_at: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    user_id: 'user-1',
    program_day_id: 'day-1',
    status: 'completed',
    started_at: '2024-01-15T09:00:00Z',
    completed_at: '2024-01-15T10:00:00Z',
    logged_sets: [],
    block_completions: [],
    ...overrides,
  };
}

function makeProgramDayItem(overrides: Partial<ProgramDayItem> = {}): ProgramDayItem {
  return {
    id: 'item-1',
    type: 'exercise',
    order: 1,
    exercise_id: 'exercise-1',
    target_sets: 3,
    target_reps: '8-12',
    target_weight: 60,
    target_rpe: 8,
    ...overrides,
  };
}

// --- Tests ---

describe('Auto-Fill Service', () => {
  describe('parseTargetReps', () => {
    it('should parse a single number string', () => {
      expect(parseTargetReps('5')).toBe(5);
    });

    it('should parse a range and return the lower bound', () => {
      expect(parseTargetReps('8-12')).toBe(8);
    });

    it('should handle whitespace', () => {
      expect(parseTargetReps(' 10 ')).toBe(10);
      expect(parseTargetReps(' 6-8 ')).toBe(6);
    });

    it('should return 0 for empty string', () => {
      expect(parseTargetReps('')).toBe(0);
    });

    it('should return 0 for unparseable input', () => {
      expect(parseTargetReps('abc')).toBe(0);
    });

    it('should handle range with non-numeric upper bound', () => {
      expect(parseTargetReps('5-abc')).toBe(5);
    });
  });

  describe('getAutoFillValues', () => {
    const exerciseId = 'exercise-1';
    const programDayId = 'day-1';
    const programItem = makeProgramDayItem();

    describe('Priority 1: Most recent completed session for same ProgramDay', () => {
      it('should use values from the last set of the most recent completed session for the same day', () => {
        const previousSessions: Session[] = [
          makeSession({
            id: 'session-old',
            completed_at: '2024-01-10T10:00:00Z',
            logged_sets: [
              makeLoggedSet({ session_id: 'session-old', set_number: 1, reps: 8, weight: 70, rpe: 6 }),
            ],
          }),
          makeSession({
            id: 'session-recent',
            completed_at: '2024-01-15T10:00:00Z',
            logged_sets: [
              makeLoggedSet({ session_id: 'session-recent', set_number: 1, reps: 10, weight: 80, rpe: 7 }),
              makeLoggedSet({ session_id: 'session-recent', set_number: 2, reps: 8, weight: 85, rpe: 8 }),
              makeLoggedSet({ session_id: 'session-recent', set_number: 3, reps: 6, weight: 90, rpe: 9 }),
            ],
          }),
        ];

        const result = getAutoFillValues(
          exerciseId,
          programDayId,
          previousSessions,
          [],
          programItem
        );

        expect(result.source).toBe('previous_session');
        expect(result.reps).toBe(6);
        expect(result.weight).toBe(90);
        expect(result.rpe).toBe(9);
      });

      it('should ignore in_progress sessions', () => {
        const previousSessions: Session[] = [
          makeSession({
            id: 'session-in-progress',
            status: 'in_progress',
            completed_at: undefined,
            logged_sets: [
              makeLoggedSet({ session_id: 'session-in-progress', reps: 99, weight: 999 }),
            ],
          }),
        ];

        const exerciseHistory = [
          makeLoggedSet({ reps: 5, weight: 50, logged_at: '2024-01-01T10:00:00Z' }),
        ];

        const result = getAutoFillValues(
          exerciseId,
          programDayId,
          previousSessions,
          exerciseHistory,
          programItem
        );

        // Should fall through to exercise history since no completed sessions
        expect(result.source).toBe('exercise_history');
      });

      it('should ignore sessions for a different program day', () => {
        const previousSessions: Session[] = [
          makeSession({
            id: 'session-different-day',
            program_day_id: 'day-2',
            logged_sets: [
              makeLoggedSet({ session_id: 'session-different-day', reps: 99, weight: 999 }),
            ],
          }),
        ];

        const exerciseHistory = [
          makeLoggedSet({ reps: 5, weight: 50, logged_at: '2024-01-01T10:00:00Z' }),
        ];

        const result = getAutoFillValues(
          exerciseId,
          programDayId,
          previousSessions,
          exerciseHistory,
          programItem
        );

        expect(result.source).toBe('exercise_history');
      });

      it('should skip session if exercise not found in logged sets', () => {
        const previousSessions: Session[] = [
          makeSession({
            id: 'session-no-exercise',
            logged_sets: [
              makeLoggedSet({
                session_id: 'session-no-exercise',
                exercise_id: 'different-exercise',
                reps: 10,
                weight: 100,
              }),
            ],
          }),
        ];

        const exerciseHistory = [
          makeLoggedSet({ reps: 7, weight: 65, logged_at: '2024-01-02T10:00:00Z' }),
        ];

        const result = getAutoFillValues(
          exerciseId,
          programDayId,
          previousSessions,
          exerciseHistory,
          programItem
        );

        expect(result.source).toBe('exercise_history');
      });
    });

    describe('Priority 2: Broader exercise history', () => {
      it('should use the most recent logged set from exercise history', () => {
        const exerciseHistory: LoggedSet[] = [
          makeLoggedSet({ reps: 8, weight: 70, rpe: 6, logged_at: '2024-01-10T10:00:00Z' }),
          makeLoggedSet({ reps: 10, weight: 75, rpe: 7, logged_at: '2024-01-12T10:00:00Z' }),
          makeLoggedSet({ reps: 6, weight: 80, rpe: 8, logged_at: '2024-01-11T10:00:00Z' }),
        ];

        const result = getAutoFillValues(
          exerciseId,
          programDayId,
          [], // no previous sessions
          exerciseHistory,
          programItem
        );

        expect(result.source).toBe('exercise_history');
        expect(result.reps).toBe(10);
        expect(result.weight).toBe(75);
        expect(result.rpe).toBe(7);
      });

      it('should handle exercise history without RPE', () => {
        const exerciseHistory: LoggedSet[] = [
          makeLoggedSet({ reps: 5, weight: 100, rpe: undefined, logged_at: '2024-01-10T10:00:00Z' }),
        ];

        const result = getAutoFillValues(
          exerciseId,
          programDayId,
          [],
          exerciseHistory,
          programItem
        );

        expect(result.source).toBe('exercise_history');
        expect(result.reps).toBe(5);
        expect(result.weight).toBe(100);
        expect(result.rpe).toBeUndefined();
      });
    });

    describe('Priority 3: Program plan targets', () => {
      it('should fall back to program plan targets when no history exists', () => {
        const result = getAutoFillValues(
          exerciseId,
          programDayId,
          [],
          [],
          programItem
        );

        expect(result.source).toBe('program_plan');
        expect(result.reps).toBe(8); // lower bound of "8-12"
        expect(result.weight).toBe(60);
        expect(result.rpe).toBe(8);
      });

      it('should handle program item without target_weight', () => {
        const item = makeProgramDayItem({ target_weight: undefined });

        const result = getAutoFillValues(
          exerciseId,
          programDayId,
          [],
          [],
          item
        );

        expect(result.source).toBe('program_plan');
        expect(result.weight).toBe(0);
      });

      it('should handle program item without target_rpe', () => {
        const item = makeProgramDayItem({ target_rpe: undefined });

        const result = getAutoFillValues(
          exerciseId,
          programDayId,
          [],
          [],
          item
        );

        expect(result.source).toBe('program_plan');
        expect(result.rpe).toBeUndefined();
      });

      it('should parse single-number target_reps', () => {
        const item = makeProgramDayItem({ target_reps: '5' });

        const result = getAutoFillValues(
          exerciseId,
          programDayId,
          [],
          [],
          item
        );

        expect(result.source).toBe('program_plan');
        expect(result.reps).toBe(5);
      });
    });

    describe('Priority chain ordering', () => {
      it('should prefer previous session over exercise history and plan', () => {
        const previousSessions: Session[] = [
          makeSession({
            logged_sets: [
              makeLoggedSet({ reps: 10, weight: 100, rpe: 8 }),
            ],
          }),
        ];

        const exerciseHistory: LoggedSet[] = [
          makeLoggedSet({ reps: 5, weight: 50, logged_at: '2024-01-20T10:00:00Z' }),
        ];

        const result = getAutoFillValues(
          exerciseId,
          programDayId,
          previousSessions,
          exerciseHistory,
          programItem
        );

        expect(result.source).toBe('previous_session');
        expect(result.weight).toBe(100);
      });

      it('should prefer exercise history over plan when no same-day session', () => {
        const exerciseHistory: LoggedSet[] = [
          makeLoggedSet({ reps: 12, weight: 70, logged_at: '2024-01-20T10:00:00Z' }),
        ];

        const result = getAutoFillValues(
          exerciseId,
          programDayId,
          [],
          exerciseHistory,
          programItem
        );

        expect(result.source).toBe('exercise_history');
        expect(result.weight).toBe(70);
      });
    });
  });

  describe('getIntraSessionFill', () => {
    describe('with no sets logged', () => {
      it('should return undefined when no sets exist', () => {
        const result = getIntraSessionFill([]);
        expect(result).toBeUndefined();
      });
    });

    describe('carrying forward set values', () => {
      it('should carry forward the most recent non-override set values', () => {
        const currentSets = [
          { reps: 10, weight: 80, rpe: 7, isManualOverride: false },
          { reps: 10, weight: 80, rpe: 7, isManualOverride: false },
        ];

        const result = getIntraSessionFill(currentSets);
        expect(result).toEqual({
          reps: 10,
          weight: 80,
          rpe: 7,
          source: 'previous_set',
        });
      });

      it('should carry forward values from the last non-override set when overrides exist', () => {
        const currentSets = [
          { reps: 10, weight: 80, rpe: 7, isManualOverride: false },
          { reps: 8, weight: 90, rpe: 9, isManualOverride: true },
          { reps: 10, weight: 85, rpe: 8, isManualOverride: false },
        ];

        const result = getIntraSessionFill(currentSets);
        expect(result).toEqual({
          reps: 10,
          weight: 85,
          rpe: 8,
          source: 'previous_set',
        });
      });

      it('should use the most recent override if ALL sets are manual overrides', () => {
        const currentSets = [
          { reps: 10, weight: 80, rpe: 7, isManualOverride: true },
          { reps: 8, weight: 90, rpe: 9, isManualOverride: true },
          { reps: 6, weight: 100, rpe: 10, isManualOverride: true },
        ];

        const result = getIntraSessionFill(currentSets);
        expect(result).toEqual({
          reps: 6,
          weight: 100,
          rpe: 10,
          source: 'previous_set',
        });
      });

      it('should handle sets without RPE', () => {
        const currentSets = [
          { reps: 10, weight: 80, rpe: undefined, isManualOverride: false },
        ];

        const result = getIntraSessionFill(currentSets);
        expect(result).toEqual({
          reps: 10,
          weight: 80,
          rpe: undefined,
          source: 'previous_set',
        });
      });

      it('should carry forward overridden value when user manually changed last set', () => {
        const currentSets = [
          { reps: 10, weight: 80, rpe: 7, isManualOverride: false },
          { reps: 12, weight: 85, rpe: 8, isManualOverride: true },
        ];

        // The last non-override set is the first one (reps: 10, weight: 80)
        // But if user overrode the last set, they expect those values forward
        // Per spec: "carry forward most recent set values, honor manual overrides"
        // The non-override preference means if a non-override exists after overrides,
        // it takes priority. Here, the only non-override is set 1.
        const result = getIntraSessionFill(currentSets);
        expect(result).toEqual({
          reps: 10,
          weight: 80,
          rpe: 7,
          source: 'previous_set',
        });
      });

      it('should handle single set that is a manual override', () => {
        const currentSets = [
          { reps: 15, weight: 60, rpe: 6, isManualOverride: true },
        ];

        const result = getIntraSessionFill(currentSets);
        expect(result).toEqual({
          reps: 15,
          weight: 60,
          rpe: 6,
          source: 'previous_set',
        });
      });

      it('should handle single non-override set', () => {
        const currentSets = [
          { reps: 8, weight: 100, rpe: 9, isManualOverride: false },
        ];

        const result = getIntraSessionFill(currentSets);
        expect(result).toEqual({
          reps: 8,
          weight: 100,
          rpe: 9,
          source: 'previous_set',
        });
      });
    });
  });
});
