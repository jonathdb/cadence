/**
 * Unit tests for the timer service.
 * Tests initializeTimerState and tick logic (pure functions).
 * Does not test setInterval/notification scheduling.
 */
import { describe, expect, it } from 'vitest';

import {
    calculateTotalSeconds,
    initializeTimerState,
    tick,
} from '@/services/timer';
import type { TimerConfig } from '@/types/program';

describe('Timer Service', () => {
  describe('initializeTimerState', () => {
    it('returns null for type "none"', () => {
      const config: TimerConfig = { type: 'none' };
      expect(initializeTimerState(config)).toBeNull();
    });

    it('initializes rest timer correctly', () => {
      const config: TimerConfig = { type: 'rest', rest_seconds: 60 };
      const state = initializeTimerState(config);

      expect(state).not.toBeNull();
      expect(state!.type).toBe('rest');
      expect(state!.phase).toBe('rest');
      expect(state!.remaining_seconds).toBe(60);
      expect(state!.elapsed_seconds).toBe(0);
      expect(state!.current_round).toBe(1);
      expect(state!.total_rounds).toBe(1);
      expect(state!.is_running).toBe(false);
    });

    it('initializes countdown timer correctly', () => {
      const config: TimerConfig = { type: 'countdown', duration_seconds: 90 };
      const state = initializeTimerState(config);

      expect(state).not.toBeNull();
      expect(state!.type).toBe('countdown');
      expect(state!.phase).toBe('countdown');
      expect(state!.remaining_seconds).toBe(90);
      expect(state!.elapsed_seconds).toBe(0);
      expect(state!.current_round).toBe(1);
      expect(state!.total_rounds).toBe(1);
      expect(state!.is_running).toBe(false);
    });

    it('initializes interval timer correctly', () => {
      const config: TimerConfig = {
        type: 'interval',
        work_seconds: 30,
        rest_seconds: 10,
        rounds: 5,
      };
      const state = initializeTimerState(config);

      expect(state).not.toBeNull();
      expect(state!.type).toBe('interval');
      expect(state!.phase).toBe('work');
      expect(state!.remaining_seconds).toBe(30);
      expect(state!.elapsed_seconds).toBe(0);
      expect(state!.current_round).toBe(1);
      expect(state!.total_rounds).toBe(5);
      expect(state!.is_running).toBe(false);
    });

    it('initializes duration timer correctly', () => {
      const config: TimerConfig = { type: 'duration', duration_seconds: 300 };
      const state = initializeTimerState(config);

      expect(state).not.toBeNull();
      expect(state!.type).toBe('duration');
      expect(state!.phase).toBe('work');
      expect(state!.remaining_seconds).toBe(0);
      expect(state!.elapsed_seconds).toBe(0);
      expect(state!.current_round).toBe(1);
      expect(state!.total_rounds).toBe(1);
      expect(state!.is_running).toBe(false);
    });

    it('handles missing optional config values with defaults', () => {
      const config: TimerConfig = { type: 'rest' };
      const state = initializeTimerState(config);

      expect(state).not.toBeNull();
      expect(state!.remaining_seconds).toBe(0);
    });

    it('handles interval timer with missing rounds defaulting to 1', () => {
      const config: TimerConfig = {
        type: 'interval',
        work_seconds: 20,
        rest_seconds: 10,
      };
      const state = initializeTimerState(config);

      expect(state).not.toBeNull();
      expect(state!.total_rounds).toBe(1);
    });
  });

  describe('tick - rest timer', () => {
    it('decrements remaining_seconds and increments elapsed_seconds', () => {
      const config: TimerConfig = { type: 'rest', rest_seconds: 60 };
      const state = initializeTimerState(config)!;
      const running = { ...state, is_running: true };

      const next = tick(running, config);

      expect(next.remaining_seconds).toBe(59);
      expect(next.elapsed_seconds).toBe(1);
      expect(next.phase).toBe('rest');
    });

    it('transitions to completed when remaining reaches zero', () => {
      const config: TimerConfig = { type: 'rest', rest_seconds: 60 };
      const state = initializeTimerState(config)!;
      const almostDone = { ...state, is_running: true, remaining_seconds: 1, elapsed_seconds: 59 };

      const next = tick(almostDone, config);

      expect(next.remaining_seconds).toBe(0);
      expect(next.elapsed_seconds).toBe(60);
      expect(next.phase).toBe('completed');
      expect(next.is_running).toBe(false);
    });

    it('does not change state when already completed', () => {
      const config: TimerConfig = { type: 'rest', rest_seconds: 60 };
      const completedState = {
        type: 'rest' as const,
        phase: 'completed' as const,
        remaining_seconds: 0,
        elapsed_seconds: 60,
        current_round: 1,
        total_rounds: 1,
        is_running: false,
      };

      const next = tick(completedState, config);
      expect(next).toEqual(completedState);
    });
  });

  describe('tick - countdown timer', () => {
    it('counts down correctly', () => {
      const config: TimerConfig = { type: 'countdown', duration_seconds: 30 };
      const state = initializeTimerState(config)!;
      const running = { ...state, is_running: true };

      const next = tick(running, config);

      expect(next.remaining_seconds).toBe(29);
      expect(next.elapsed_seconds).toBe(1);
      expect(next.phase).toBe('countdown');
    });

    it('completes when remaining reaches zero', () => {
      const config: TimerConfig = { type: 'countdown', duration_seconds: 30 };
      const almostDone = {
        type: 'countdown' as const,
        phase: 'countdown' as const,
        remaining_seconds: 1,
        elapsed_seconds: 29,
        current_round: 1,
        total_rounds: 1,
        is_running: true,
      };

      const next = tick(almostDone, config);

      expect(next.remaining_seconds).toBe(0);
      expect(next.elapsed_seconds).toBe(30);
      expect(next.phase).toBe('completed');
      expect(next.is_running).toBe(false);
    });
  });

  describe('tick - interval timer', () => {
    const config: TimerConfig = {
      type: 'interval',
      work_seconds: 30,
      rest_seconds: 10,
      rounds: 3,
    };

    it('counts down work phase', () => {
      const state = initializeTimerState(config)!;
      const running = { ...state, is_running: true };

      const next = tick(running, config);

      expect(next.remaining_seconds).toBe(29);
      expect(next.elapsed_seconds).toBe(1);
      expect(next.phase).toBe('work');
      expect(next.current_round).toBe(1);
    });

    it('transitions from work to rest phase', () => {
      const workEnding = {
        type: 'interval' as const,
        phase: 'work' as const,
        remaining_seconds: 1,
        elapsed_seconds: 29,
        current_round: 1,
        total_rounds: 3,
        is_running: true,
      };

      const next = tick(workEnding, config);

      expect(next.phase).toBe('rest');
      expect(next.remaining_seconds).toBe(10);
      expect(next.elapsed_seconds).toBe(30);
      expect(next.current_round).toBe(1);
    });

    it('transitions from rest to next round work phase', () => {
      const restEnding = {
        type: 'interval' as const,
        phase: 'rest' as const,
        remaining_seconds: 1,
        elapsed_seconds: 39,
        current_round: 1,
        total_rounds: 3,
        is_running: true,
      };

      const next = tick(restEnding, config);

      expect(next.phase).toBe('work');
      expect(next.remaining_seconds).toBe(30);
      expect(next.elapsed_seconds).toBe(40);
      expect(next.current_round).toBe(2);
    });

    it('completes after last round rest phase ends', () => {
      const lastRestEnding = {
        type: 'interval' as const,
        phase: 'rest' as const,
        remaining_seconds: 1,
        elapsed_seconds: 119, // 3 rounds * (30+10) - 1
        current_round: 3,
        total_rounds: 3,
        is_running: true,
      };

      const next = tick(lastRestEnding, config);

      expect(next.phase).toBe('completed');
      expect(next.remaining_seconds).toBe(0);
      expect(next.elapsed_seconds).toBe(120);
      expect(next.is_running).toBe(false);
      expect(next.current_round).toBe(3);
    });

    it('handles interval with no rest (rest_seconds = 0)', () => {
      const noRestConfig: TimerConfig = {
        type: 'interval',
        work_seconds: 20,
        rest_seconds: 0,
        rounds: 2,
      };

      const workEnding = {
        type: 'interval' as const,
        phase: 'work' as const,
        remaining_seconds: 1,
        elapsed_seconds: 19,
        current_round: 1,
        total_rounds: 2,
        is_running: true,
      };

      const next = tick(workEnding, noRestConfig);

      // Should skip rest and go to next round's work
      expect(next.phase).toBe('work');
      expect(next.remaining_seconds).toBe(20);
      expect(next.current_round).toBe(2);
    });

    it('completes after last round work when no rest', () => {
      const noRestConfig: TimerConfig = {
        type: 'interval',
        work_seconds: 20,
        rest_seconds: 0,
        rounds: 2,
      };

      const lastWorkEnding = {
        type: 'interval' as const,
        phase: 'work' as const,
        remaining_seconds: 1,
        elapsed_seconds: 39,
        current_round: 2,
        total_rounds: 2,
        is_running: true,
      };

      const next = tick(lastWorkEnding, noRestConfig);

      expect(next.phase).toBe('completed');
      expect(next.is_running).toBe(false);
    });
  });

  describe('tick - duration timer', () => {
    it('increments elapsed_seconds without completing', () => {
      const config: TimerConfig = { type: 'duration', duration_seconds: 300 };
      const state = initializeTimerState(config)!;
      const running = { ...state, is_running: true };

      const next = tick(running, config);

      expect(next.elapsed_seconds).toBe(1);
      expect(next.remaining_seconds).toBe(0);
      expect(next.phase).toBe('work');
    });

    it('continues counting up after many ticks', () => {
      const config: TimerConfig = { type: 'duration' };
      let state = initializeTimerState(config)!;
      state = { ...state, is_running: true };

      // Simulate 100 ticks
      for (let i = 0; i < 100; i++) {
        state = tick(state, config);
      }

      expect(state.elapsed_seconds).toBe(100);
      expect(state.phase).toBe('work'); // Never completes on its own
    });
  });

  describe('tick - idle state', () => {
    it('does not change state when phase is idle', () => {
      const config: TimerConfig = { type: 'rest', rest_seconds: 60 };
      const idleState = {
        type: 'rest' as const,
        phase: 'idle' as const,
        remaining_seconds: 60,
        elapsed_seconds: 0,
        current_round: 1,
        total_rounds: 1,
        is_running: false,
      };

      const next = tick(idleState, config);
      expect(next).toEqual(idleState);
    });
  });

  describe('calculateTotalSeconds', () => {
    it('returns 0 for type "none"', () => {
      expect(calculateTotalSeconds({ type: 'none' })).toBe(0);
    });

    it('returns rest_seconds for type "rest"', () => {
      expect(calculateTotalSeconds({ type: 'rest', rest_seconds: 45 })).toBe(45);
    });

    it('returns duration_seconds for type "countdown"', () => {
      expect(calculateTotalSeconds({ type: 'countdown', duration_seconds: 120 })).toBe(120);
    });

    it('calculates total for interval: (work + rest) * rounds', () => {
      const config: TimerConfig = {
        type: 'interval',
        work_seconds: 30,
        rest_seconds: 10,
        rounds: 4,
      };
      expect(calculateTotalSeconds(config)).toBe(160); // (30+10)*4
    });

    it('returns 0 for type "duration" (no fixed end)', () => {
      expect(calculateTotalSeconds({ type: 'duration', duration_seconds: 300 })).toBe(0);
    });

    it('handles missing values with defaults', () => {
      expect(calculateTotalSeconds({ type: 'rest' })).toBe(0);
      expect(calculateTotalSeconds({ type: 'interval' })).toBe(0); // (0+0)*1
    });
  });
});
