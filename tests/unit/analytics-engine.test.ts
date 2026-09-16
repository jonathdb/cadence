/**
 * Unit tests for the server-side analytics engine (strength analytics — Task 1).
 * Covers volume trend, muscle balance, PR history, and adherence.
 */
import { describe, expect, it } from 'vitest';

import {
  type AnalyticsSet,
  calculateEstimated1RM,
  classifyTrend,
  computeAdherence,
  computeExercisePRHistory,
  computeMuscleBalance,
  computeVolumeTrend,
  isoWeekKey,
} from '../../supabase/functions/_shared/analytics-engine.ts';

// --- Helpers ---

function set(overrides: Partial<AnalyticsSet> = {}): AnalyticsSet {
  return {
    weight: 100,
    reps: 10,
    rpe: null,
    logged_at: '2026-01-05T10:00:00Z', // Mon, ISO week 2026-W02
    muscle_group: 'chest',
    ...overrides,
  };
}

describe('classifyTrend', () => {
  it('flags increasing when last exceeds first beyond threshold', () => {
    expect(classifyTrend(100, 120)).toBe('increasing');
  });

  it('flags decreasing when last is below first beyond threshold', () => {
    expect(classifyTrend(100, 80)).toBe('decreasing');
  });

  it('flags stable within threshold', () => {
    expect(classifyTrend(100, 103)).toBe('stable');
  });

  it('treats zero baseline with positive last as increasing', () => {
    expect(classifyTrend(0, 50)).toBe('increasing');
  });

  it('treats zero baseline with zero last as stable', () => {
    expect(classifyTrend(0, 0)).toBe('stable');
  });
});

describe('isoWeekKey', () => {
  it('buckets consecutive weeks into distinct keys', () => {
    const w1 = isoWeekKey('2026-01-05T00:00:00Z');
    const w2 = isoWeekKey('2026-01-12T00:00:00Z');
    expect(w1).not.toBe(w2);
  });

  it('buckets same-week dates into the same key', () => {
    const a = isoWeekKey('2026-01-05T00:00:00Z');
    const b = isoWeekKey('2026-01-08T00:00:00Z');
    expect(a).toBe(b);
  });
});

describe('computeVolumeTrend', () => {
  it('returns stable with a single week', () => {
    const trend = computeVolumeTrend([set(), set({ reps: 8 })]);
    expect(trend.weekly).toHaveLength(1);
    expect(trend.trend).toBe('stable');
    expect(trend.total_volume).toBe(100 * 10 + 100 * 8);
  });

  it('detects an increasing trend across weeks', () => {
    const sets = [
      set({ logged_at: '2026-01-05T10:00:00Z', weight: 100, reps: 5 }),  // W02: 500
      set({ logged_at: '2026-01-12T10:00:00Z', weight: 100, reps: 10 }), // W03: 1000
    ];
    const trend = computeVolumeTrend(sets);
    expect(trend.weekly).toHaveLength(2);
    expect(trend.trend).toBe('increasing');
  });

  it('orders weeks oldest-first', () => {
    const sets = [
      set({ logged_at: '2026-01-12T10:00:00Z' }),
      set({ logged_at: '2026-01-05T10:00:00Z' }),
    ];
    const trend = computeVolumeTrend(sets);
    expect(trend.weekly[0].week < trend.weekly[1].week).toBe(true);
  });

  it('handles empty input', () => {
    const trend = computeVolumeTrend([]);
    expect(trend.total_volume).toBe(0);
    expect(trend.avg_weekly_volume).toBe(0);
    expect(trend.trend).toBe('stable');
  });
});

describe('computeMuscleBalance', () => {
  it('computes per-group volume, shares, and identifies extremes', () => {
    const sets = [
      set({ muscle_group: 'chest', weight: 100, reps: 10 }),   // 1000
      set({ muscle_group: 'chest', weight: 100, reps: 10 }),   // 1000
      set({ muscle_group: 'biceps', weight: 20, reps: 10 }),   // 200
    ];
    const balance = computeMuscleBalance(sets);
    expect(balance.most_trained).toBe('chest');
    expect(balance.least_trained).toBe('biceps');
    expect(balance.total_volume).toBe(2200);
    const chest = balance.groups.find((g) => g.muscle_group === 'chest')!;
    expect(chest.share).toBeCloseTo(2000 / 2200, 3);
  });

  it('reports untrained groups from the 9-group model', () => {
    const balance = computeMuscleBalance([set({ muscle_group: 'chest' })]);
    expect(balance.untrained).toContain('back');
    expect(balance.untrained).toContain('calves');
    expect(balance.untrained).not.toContain('chest');
  });

  it('computes imbalance ratio between most and least trained', () => {
    const sets = [
      set({ muscle_group: 'chest', weight: 100, reps: 10 }),  // 1000
      set({ muscle_group: 'biceps', weight: 50, reps: 10 }),  // 500
    ];
    const balance = computeMuscleBalance(sets);
    expect(balance.imbalance_ratio).toBeCloseTo(2, 1);
  });

  it('ignores sets without a resolved muscle group', () => {
    const balance = computeMuscleBalance([set({ muscle_group: null })]);
    expect(balance.total_volume).toBe(0);
    expect(balance.groups).toHaveLength(0);
  });
});

describe('calculateEstimated1RM', () => {
  it('equals weight at 1 rep', () => {
    expect(calculateEstimated1RM(100, 1)).toBe(100);
  });

  it('returns 0 for invalid reps', () => {
    expect(calculateEstimated1RM(100, 0)).toBe(0);
    expect(calculateEstimated1RM(100, 37)).toBe(0);
  });
});

describe('computeExercisePRHistory', () => {
  it('emits a weight PR on the first valid set', () => {
    const history = computeExercisePRHistory('Bench Press', [
      set({ weight: 80, reps: 5, logged_at: '2026-01-01T10:00:00Z' }),
    ]);
    expect(history.records).toHaveLength(1);
    expect(history.records[0].pr_type).toBe('weight');
    expect(history.best_weight).toBe(80);
  });

  it('prioritizes weight PR over 1RM and reps PRs within a set', () => {
    const history = computeExercisePRHistory('Squat', [
      set({ weight: 100, reps: 5, logged_at: '2026-01-01T10:00:00Z' }),
      set({ weight: 110, reps: 5, logged_at: '2026-01-08T10:00:00Z' }),
    ]);
    expect(history.records).toHaveLength(2);
    expect(history.records[1].pr_type).toBe('weight');
    expect(history.best_weight).toBe(110);
  });

  it('emits an estimated_1rm PR when weight is not a PR but 1RM is', () => {
    const history = computeExercisePRHistory('Deadlift', [
      set({ weight: 100, reps: 5, logged_at: '2026-01-01T10:00:00Z' }),  // est ~112.5
      set({ weight: 100, reps: 8, logged_at: '2026-01-08T10:00:00Z' }),  // est ~124, same weight
    ]);
    expect(history.records[1].pr_type).toBe('estimated_1rm');
  });

  it('emits a reps_at_weight PR when reps beat a prior set at the same weight without a new 1RM/weight best', () => {
    const history = computeExercisePRHistory('OHP', [
      set({ weight: 100, reps: 5, logged_at: '2026-01-01T10:00:00Z' }),   // weight PR + 1RM baseline
      set({ weight: 120, reps: 6, logged_at: '2026-01-08T10:00:00Z' }),   // weight PR, raises 1RM high
      set({ weight: 100, reps: 6, logged_at: '2026-01-15T10:00:00Z' }),   // same weight as first, more reps; 1RM below the 120 set
    ]);
    const last = history.records[history.records.length - 1];
    expect(last.pr_type).toBe('reps_at_weight');
    expect(last.value).toBe(6);
  });

  it('handles no history', () => {
    const history = computeExercisePRHistory('Row', []);
    expect(history.records).toHaveLength(0);
    expect(history.best_weight).toBe(0);
  });
});

describe('computeAdherence', () => {
  it('handles no history', () => {
    const a = computeAdherence({ completed_session_dates: [], planned_per_week: 3, weeks: 4 });
    expect(a.completed_sessions).toBe(0);
    expect(a.adherence_rate).toBe(0);
    expect(a.current_week_streak).toBe(0);
  });

  it('handles a single session', () => {
    const a = computeAdherence({
      completed_session_dates: ['2026-01-05T10:00:00Z'],
      planned_per_week: 3,
      weeks: 1,
    });
    expect(a.completed_sessions).toBe(1);
    expect(a.adherence_rate).toBeCloseTo(1 / 3, 2);
    expect(a.current_week_streak).toBe(1);
  });

  it('caps adherence rate at 1 when overtraining relative to plan', () => {
    const a = computeAdherence({
      completed_session_dates: [
        '2026-01-05T10:00:00Z',
        '2026-01-06T10:00:00Z',
        '2026-01-07T10:00:00Z',
        '2026-01-08T10:00:00Z',
      ],
      planned_per_week: 2,
      weeks: 1,
    });
    expect(a.adherence_rate).toBe(1);
  });

  it('computes a multi-week consecutive streak', () => {
    const a = computeAdherence({
      completed_session_dates: [
        '2026-01-05T10:00:00Z', // W02
        '2026-01-12T10:00:00Z', // W03
        '2026-01-19T10:00:00Z', // W04
      ],
      planned_per_week: 1,
      weeks: 3,
    });
    expect(a.current_week_streak).toBe(3);
  });

  it('breaks the streak when a week is skipped', () => {
    const a = computeAdherence({
      completed_session_dates: [
        '2026-01-05T10:00:00Z', // W02
        '2026-01-19T10:00:00Z', // W04 (skipped W03)
      ],
      planned_per_week: 1,
      weeks: 3,
    });
    expect(a.current_week_streak).toBe(1);
  });
});
