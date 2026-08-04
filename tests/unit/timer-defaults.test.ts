/**
 * Unit tests for Timer Defaults from History Service.
 * Validates timer default resolution logic (Req 17.1, 17.2, 17.3).
 */
import { describe, expect, it } from 'vitest';

import {
    findMostRecentCompletedSession,
    getTimerDefaults,
    reconstructBlockTimerFromCompletion,
    reconstructExerciseTimerFromSet,
} from '@/services/timer-defaults';
import type { Block, ProgramDay, ProgramDayItem, TimerConfig } from '@/types/program';
import type { BlockCompletion, LoggedSet, Session } from '@/types/session';

// --- Test Helpers ---

function makeBlockCompletion(overrides: Partial<BlockCompletion> = {}): BlockCompletion {
  return {
    id: 'bc-1',
    session_id: 'session-1',
    block_id: 'block-1',
    actual_duration_seconds: 180,
    actual_rounds: 3,
    completed_at: '2024-01-15T10:05:00Z',
    ...overrides,
  };
}

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

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-1',
    name: 'Circuit A',
    type: 'circuit',
    exercises: [],
    timer_config: { type: 'interval', work_seconds: 30, rest_seconds: 10, rounds: 3 },
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
    timer_config: { type: 'rest', rest_seconds: 90 },
    ...overrides,
  };
}

function makeProgramDay(overrides: Partial<ProgramDay> = {}): ProgramDay {
  return {
    id: 'day-1',
    program_id: 'program-1',
    day_number: 1,
    name: 'Push Day',
    items: [],
    ...overrides,
  };
}

// --- Tests ---

describe('Timer Defaults from History Service', () => {
  describe('findMostRecentCompletedSession', () => {
    it('should return the most recently completed session for the given program day', () => {
      const sessions: Session[] = [
        makeSession({
          id: 'session-old',
          completed_at: '2024-01-10T10:00:00Z',
        }),
        makeSession({
          id: 'session-recent',
          completed_at: '2024-01-15T10:00:00Z',
        }),
        makeSession({
          id: 'session-mid',
          completed_at: '2024-01-12T10:00:00Z',
        }),
      ];

      const result = findMostRecentCompletedSession('day-1', sessions);
      expect(result?.id).toBe('session-recent');
    });

    it('should ignore in_progress sessions', () => {
      const sessions: Session[] = [
        makeSession({
          id: 'session-in-progress',
          status: 'in_progress',
          completed_at: undefined,
        }),
        makeSession({
          id: 'session-completed',
          completed_at: '2024-01-10T10:00:00Z',
        }),
      ];

      const result = findMostRecentCompletedSession('day-1', sessions);
      expect(result?.id).toBe('session-completed');
    });

    it('should ignore sessions for a different program day', () => {
      const sessions: Session[] = [
        makeSession({
          id: 'session-different-day',
          program_day_id: 'day-2',
          completed_at: '2024-01-20T10:00:00Z',
        }),
        makeSession({
          id: 'session-same-day',
          program_day_id: 'day-1',
          completed_at: '2024-01-15T10:00:00Z',
        }),
      ];

      const result = findMostRecentCompletedSession('day-1', sessions);
      expect(result?.id).toBe('session-same-day');
    });

    it('should return undefined when no completed sessions exist', () => {
      const sessions: Session[] = [
        makeSession({
          id: 'session-in-progress',
          status: 'in_progress',
          completed_at: undefined,
        }),
      ];

      const result = findMostRecentCompletedSession('day-1', sessions);
      expect(result).toBeUndefined();
    });

    it('should return undefined when sessions list is empty', () => {
      const result = findMostRecentCompletedSession('day-1', []);
      expect(result).toBeUndefined();
    });
  });

  describe('reconstructBlockTimerFromCompletion', () => {
    it('should reconstruct interval timer from completion', () => {
      const completion = makeBlockCompletion({
        actual_duration_seconds: 120,
        actual_rounds: 3,
      });
      const originalConfig: TimerConfig = {
        type: 'interval',
        work_seconds: 30,
        rest_seconds: 10,
        rounds: 3,
      };

      const result = reconstructBlockTimerFromCompletion(completion, originalConfig);

      expect(result.type).toBe('interval');
      expect(result.rounds).toBe(3);
      expect(result.rest_seconds).toBe(10);
      // work_seconds = (120/3) - 10 = 30
      expect(result.work_seconds).toBe(30);
    });

    it('should reconstruct countdown timer from completion', () => {
      const completion = makeBlockCompletion({ actual_duration_seconds: 60 });
      const originalConfig: TimerConfig = { type: 'countdown', duration_seconds: 45 };

      const result = reconstructBlockTimerFromCompletion(completion, originalConfig);

      expect(result.type).toBe('countdown');
      expect(result.duration_seconds).toBe(60);
    });

    it('should reconstruct duration timer from completion', () => {
      const completion = makeBlockCompletion({ actual_duration_seconds: 300 });
      const originalConfig: TimerConfig = { type: 'duration', duration_seconds: 240 };

      const result = reconstructBlockTimerFromCompletion(completion, originalConfig);

      expect(result.type).toBe('duration');
      expect(result.duration_seconds).toBe(300);
    });

    it('should reconstruct rest timer from completion', () => {
      const completion = makeBlockCompletion({ actual_duration_seconds: 90 });
      const originalConfig: TimerConfig = { type: 'rest', rest_seconds: 60 };

      const result = reconstructBlockTimerFromCompletion(completion, originalConfig);

      expect(result.type).toBe('rest');
      expect(result.rest_seconds).toBe(90);
    });

    it('should return { type: "none" } for none config', () => {
      const completion = makeBlockCompletion();
      const originalConfig: TimerConfig = { type: 'none' };

      const result = reconstructBlockTimerFromCompletion(completion, originalConfig);
      expect(result.type).toBe('none');
    });

    it('should default to duration when no original config is provided', () => {
      const completion = makeBlockCompletion({ actual_duration_seconds: 200 });

      const result = reconstructBlockTimerFromCompletion(completion, undefined);

      expect(result.type).toBe('duration');
      expect(result.duration_seconds).toBe(200);
    });

    it('should handle interval with zero rounds gracefully', () => {
      const completion = makeBlockCompletion({
        actual_duration_seconds: 120,
        actual_rounds: 0,
      });
      const originalConfig: TimerConfig = {
        type: 'interval',
        work_seconds: 30,
        rest_seconds: 10,
        rounds: 3,
      };

      const result = reconstructBlockTimerFromCompletion(completion, originalConfig);
      // Falls back to original config when rounds is 0
      expect(result).toEqual(originalConfig);
    });
  });

  describe('reconstructExerciseTimerFromSet', () => {
    it('should reconstruct countdown timer from actual duration', () => {
      const originalConfig: TimerConfig = { type: 'countdown', duration_seconds: 45 };
      const result = reconstructExerciseTimerFromSet(50, originalConfig);

      expect(result.type).toBe('countdown');
      expect(result.duration_seconds).toBe(50);
    });

    it('should reconstruct duration timer from actual duration', () => {
      const originalConfig: TimerConfig = { type: 'duration', duration_seconds: 60 };
      const result = reconstructExerciseTimerFromSet(75, originalConfig);

      expect(result.type).toBe('duration');
      expect(result.duration_seconds).toBe(75);
    });

    it('should reconstruct rest timer from actual duration', () => {
      const originalConfig: TimerConfig = { type: 'rest', rest_seconds: 60 };
      const result = reconstructExerciseTimerFromSet(90, originalConfig);

      expect(result.type).toBe('rest');
      expect(result.rest_seconds).toBe(90);
    });

    it('should return { type: "none" } for none config', () => {
      const result = reconstructExerciseTimerFromSet(30, { type: 'none' });
      expect(result.type).toBe('none');
    });

    it('should fallback to original for interval type on individual exercise', () => {
      const originalConfig: TimerConfig = {
        type: 'interval',
        work_seconds: 30,
        rest_seconds: 10,
        rounds: 3,
      };
      const result = reconstructExerciseTimerFromSet(120, originalConfig);
      expect(result).toEqual(originalConfig);
    });

    it('should default to duration when no original config is provided', () => {
      const result = reconstructExerciseTimerFromSet(45, undefined);
      expect(result.type).toBe('duration');
      expect(result.duration_seconds).toBe(45);
    });
  });

  describe('getTimerDefaults', () => {
    describe('Requirement 17.1 — defaults from most recent completed session', () => {
      it('should use timer values from the most recent completed session for exercises', () => {
        const programDay = makeProgramDay({
          items: [
            makeProgramDayItem({
              exercise_id: 'exercise-1',
              timer_config: { type: 'rest', rest_seconds: 60 },
            }),
          ],
        });

        const previousSessions: Session[] = [
          makeSession({
            id: 'session-recent',
            completed_at: '2024-01-15T10:00:00Z',
            logged_sets: [
              makeLoggedSet({
                exercise_id: 'exercise-1',
                set_number: 1,
                actual_duration_seconds: 90,
              }),
            ],
          }),
        ];

        const results = getTimerDefaults(programDay, previousSessions);

        expect(results).toHaveLength(1);
        expect(results[0].source).toBe('previous_session');
        expect(results[0].timerConfig.type).toBe('rest');
        expect(results[0].timerConfig.rest_seconds).toBe(90);
      });

      it('should use timer values from block completions for blocks', () => {
        const block = makeBlock({
          id: 'block-1',
          timer_config: { type: 'interval', work_seconds: 30, rest_seconds: 10, rounds: 3 },
        });

        const programDay = makeProgramDay({
          items: [
            {
              id: 'item-block',
              type: 'block',
              order: 1,
              target_sets: 1,
              target_reps: '1',
              block,
            },
          ],
        });

        const previousSessions: Session[] = [
          makeSession({
            id: 'session-recent',
            completed_at: '2024-01-15T10:00:00Z',
            block_completions: [
              makeBlockCompletion({
                block_id: 'block-1',
                actual_duration_seconds: 150,
                actual_rounds: 3,
              }),
            ],
          }),
        ];

        const results = getTimerDefaults(programDay, previousSessions);

        expect(results).toHaveLength(1);
        expect(results[0].source).toBe('previous_session');
        expect(results[0].itemType).toBe('block');
        expect(results[0].timerConfig.type).toBe('interval');
        expect(results[0].timerConfig.rounds).toBe(3);
      });

      it('should use the most recent completed session, not an older one', () => {
        const programDay = makeProgramDay({
          items: [
            makeProgramDayItem({
              exercise_id: 'exercise-1',
              timer_config: { type: 'countdown', duration_seconds: 45 },
            }),
          ],
        });

        const previousSessions: Session[] = [
          makeSession({
            id: 'session-old',
            completed_at: '2024-01-10T10:00:00Z',
            logged_sets: [
              makeLoggedSet({
                exercise_id: 'exercise-1',
                set_number: 1,
                actual_duration_seconds: 40,
              }),
            ],
          }),
          makeSession({
            id: 'session-recent',
            completed_at: '2024-01-15T10:00:00Z',
            logged_sets: [
              makeLoggedSet({
                exercise_id: 'exercise-1',
                set_number: 1,
                actual_duration_seconds: 60,
              }),
            ],
          }),
        ];

        const results = getTimerDefaults(programDay, previousSessions);

        expect(results[0].source).toBe('previous_session');
        expect(results[0].timerConfig.duration_seconds).toBe(60);
      });
    });

    describe('Requirement 17.2 — use program plan when no prior session', () => {
      it('should fall back to program plan timer_config when no completed sessions exist', () => {
        const programDay = makeProgramDay({
          items: [
            makeProgramDayItem({
              exercise_id: 'exercise-1',
              timer_config: { type: 'rest', rest_seconds: 90 },
            }),
          ],
        });

        const results = getTimerDefaults(programDay, []);

        expect(results).toHaveLength(1);
        expect(results[0].source).toBe('program_plan');
        expect(results[0].timerConfig.type).toBe('rest');
        expect(results[0].timerConfig.rest_seconds).toBe(90);
      });

      it('should fall back to program plan when sessions exist but for different day', () => {
        const programDay = makeProgramDay({
          id: 'day-1',
          items: [
            makeProgramDayItem({
              exercise_id: 'exercise-1',
              timer_config: { type: 'countdown', duration_seconds: 30 },
            }),
          ],
        });

        const previousSessions: Session[] = [
          makeSession({
            program_day_id: 'day-2', // different day
            logged_sets: [
              makeLoggedSet({ exercise_id: 'exercise-1', actual_duration_seconds: 60 }),
            ],
          }),
        ];

        const results = getTimerDefaults(programDay, previousSessions);

        expect(results[0].source).toBe('program_plan');
        expect(results[0].timerConfig.type).toBe('countdown');
        expect(results[0].timerConfig.duration_seconds).toBe(30);
      });

      it('should default to { type: "none" } when no timer_config on item', () => {
        const programDay = makeProgramDay({
          items: [
            makeProgramDayItem({
              exercise_id: 'exercise-1',
              timer_config: undefined,
            }),
          ],
        });

        const results = getTimerDefaults(programDay, []);

        expect(results[0].source).toBe('program_plan');
        expect(results[0].timerConfig.type).toBe('none');
      });

      it('should fall back to plan when session has no actual_duration_seconds for exercise', () => {
        const programDay = makeProgramDay({
          items: [
            makeProgramDayItem({
              exercise_id: 'exercise-1',
              timer_config: { type: 'rest', rest_seconds: 60 },
            }),
          ],
        });

        const previousSessions: Session[] = [
          makeSession({
            logged_sets: [
              makeLoggedSet({
                exercise_id: 'exercise-1',
                actual_duration_seconds: undefined,
              }),
            ],
          }),
        ];

        const results = getTimerDefaults(programDay, previousSessions);

        expect(results[0].source).toBe('program_plan');
        expect(results[0].timerConfig.rest_seconds).toBe(60);
      });
    });

    describe('Mixed items — exercises and blocks', () => {
      it('should resolve defaults for both exercises and blocks in a program day', () => {
        const block = makeBlock({
          id: 'block-1',
          timer_config: { type: 'interval', work_seconds: 40, rest_seconds: 20, rounds: 4 },
        });

        const programDay = makeProgramDay({
          items: [
            makeProgramDayItem({
              id: 'item-1',
              type: 'exercise',
              exercise_id: 'exercise-1',
              timer_config: { type: 'rest', rest_seconds: 60 },
              order: 1,
            }),
            {
              id: 'item-2',
              type: 'block',
              order: 2,
              target_sets: 1,
              target_reps: '1',
              block,
            },
            makeProgramDayItem({
              id: 'item-3',
              type: 'exercise',
              exercise_id: 'exercise-2',
              timer_config: { type: 'countdown', duration_seconds: 30 },
              order: 3,
            }),
          ],
        });

        const previousSessions: Session[] = [
          makeSession({
            completed_at: '2024-01-15T10:00:00Z',
            logged_sets: [
              makeLoggedSet({
                exercise_id: 'exercise-1',
                actual_duration_seconds: 75,
              }),
            ],
            block_completions: [
              makeBlockCompletion({
                block_id: 'block-1',
                actual_duration_seconds: 240,
                actual_rounds: 4,
              }),
            ],
            // exercise-2 has no actual_duration_seconds
          }),
        ];

        const results = getTimerDefaults(programDay, previousSessions);

        expect(results).toHaveLength(3);

        // exercise-1: from previous session
        expect(results[0].itemId).toBe('exercise-1');
        expect(results[0].source).toBe('previous_session');
        expect(results[0].timerConfig.rest_seconds).toBe(75);

        // block-1: from previous session
        expect(results[1].itemId).toBe('block-1');
        expect(results[1].source).toBe('previous_session');
        expect(results[1].timerConfig.type).toBe('interval');
        expect(results[1].timerConfig.rounds).toBe(4);

        // exercise-2: falls back to program plan (no history)
        expect(results[2].itemId).toBe('exercise-2');
        expect(results[2].source).toBe('program_plan');
        expect(results[2].timerConfig.duration_seconds).toBe(30);
      });
    });

    describe('Edge cases', () => {
      it('should handle empty program day items', () => {
        const programDay = makeProgramDay({ items: [] });
        const results = getTimerDefaults(programDay, []);
        expect(results).toHaveLength(0);
      });

      it('should handle session with multiple sets and use the highest set_number with duration', () => {
        const programDay = makeProgramDay({
          items: [
            makeProgramDayItem({
              exercise_id: 'exercise-1',
              timer_config: { type: 'countdown', duration_seconds: 45 },
            }),
          ],
        });

        const previousSessions: Session[] = [
          makeSession({
            logged_sets: [
              makeLoggedSet({
                exercise_id: 'exercise-1',
                set_number: 1,
                actual_duration_seconds: undefined,
              }),
              makeLoggedSet({
                exercise_id: 'exercise-1',
                set_number: 2,
                actual_duration_seconds: undefined,
              }),
              makeLoggedSet({
                exercise_id: 'exercise-1',
                set_number: 3,
                actual_duration_seconds: 55,
              }),
            ],
          }),
        ];

        const results = getTimerDefaults(programDay, previousSessions);

        expect(results[0].source).toBe('previous_session');
        expect(results[0].timerConfig.duration_seconds).toBe(55);
      });
    });
  });
});
