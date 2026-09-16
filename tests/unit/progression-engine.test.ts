/**
 * Tests for the progression engine.
 *  - Regression tests for the base deterministic strength rules (evaluateProgression).
 *  - New tests for progression engine v2: goal-weighting, experience scaling,
 *    injury guardrails, unified recovery, and cardio rules.
 */
import { describe, expect, it } from 'vitest';

import {
  evaluateCardioProgression,
  evaluateProgression,
  evaluateProgressionV2,
  exerciseConflictsWithInjury,
  experienceIncrementMultiplier,
  isRecoveryCompromised,
  type CardioProgressionInput,
  type ExerciseHistory,
  type ProgramTarget,
  type ProgressionInput,
  type RecoveryV2,
} from '../../supabase/functions/_shared/progression-engine.ts';

// --- Fixtures ---

const goodRecoveryV2: RecoveryV2 = {
  avg_sleep_hours: 8,
  hrv_latest_ms: 60,
  hrv_baseline_ms: 60,
  resting_hr_bpm: 55,
};

const poorRecoveryV2: RecoveryV2 = {
  avg_sleep_hours: 4.5, // < 6 → compromised
  hrv_latest_ms: 40,
  hrv_baseline_ms: 60, // 33% below baseline → compromised
  resting_hr_bpm: 70,
};

function readyToProgress(exerciseName: string, muscle: ExerciseHistory['muscle_group']): ExerciseHistory {
  // All RPE < 7 for 2 sessions → base rule = increase_weight
  return {
    exercise_name: exerciseName,
    muscle_group: muscle,
    sessions: [
      { session_date: '2026-01-12T10:00:00Z', sets: [{ weight: 100, reps: 10, rpe: 6 }, { weight: 100, reps: 10, rpe: 6 }] },
      { session_date: '2026-01-05T10:00:00Z', sets: [{ weight: 100, reps: 10, rpe: 6 }, { weight: 100, reps: 10, rpe: 6 }] },
    ],
  };
}

const benchTarget: ProgramTarget = {
  exercise_name: 'Bench Press',
  target_sets: 3,
  target_rep_range: '8-12',
  target_weight: 100,
  target_rpe: 8,
};

// ─── Regression: base strength engine ────────────────────────────────────────

describe('evaluateProgression (base strength regression)', () => {
  it('returns rest_day for all exercises when recovery is compromised', () => {
    const input: ProgressionInput = {
      exercise_history: [readyToProgress('Bench Press', 'chest')],
      recovery_summary: { avg_sleep_hours: 4, hrv_ms: 40, hrv_baseline_ms: 60, resting_hr_bpm: 70 },
      program_targets: [benchTarget],
      scope: 'full_program',
    };
    const out = evaluateProgression(input);
    expect(out).toHaveLength(1);
    expect(out[0].suggestion_type).toBe('rest_day');
  });

  it('suggests increase_weight when RPE is consistently low with good recovery', () => {
    const input: ProgressionInput = {
      exercise_history: [readyToProgress('Bench Press', 'chest')],
      recovery_summary: { avg_sleep_hours: 8, hrv_ms: 60, hrv_baseline_ms: 60, resting_hr_bpm: 55 },
      program_targets: [benchTarget],
      scope: 'full_program',
    };
    const out = evaluateProgression(input);
    expect(out[0].suggestion_type).toBe('increase_weight');
    expect(out[0].suggested_values.weight).toBeGreaterThan(100);
  });
});

// ─── V2: helpers ──────────────────────────────────────────────────────────────

describe('isRecoveryCompromised', () => {
  it('is false for good recovery', () => {
    expect(isRecoveryCompromised(goodRecoveryV2)).toBe(false);
  });
  it('is true for low sleep or depressed HRV', () => {
    expect(isRecoveryCompromised(poorRecoveryV2)).toBe(true);
  });
});

describe('experienceIncrementMultiplier', () => {
  it('scales by experience', () => {
    expect(experienceIncrementMultiplier('beginner')).toBe(1.5);
    expect(experienceIncrementMultiplier('intermediate')).toBe(1.0);
    expect(experienceIncrementMultiplier('advanced')).toBe(0.5);
    expect(experienceIncrementMultiplier(null)).toBe(1.0);
  });
});

describe('exerciseConflictsWithInjury', () => {
  it('flags overhead work against a shoulder injury', () => {
    expect(exerciseConflictsWithInjury('Overhead Press', 'left shoulder impingement')).toBe(true);
  });
  it('does not flag unrelated movements', () => {
    expect(exerciseConflictsWithInjury('Leg Curl', 'left shoulder impingement')).toBe(false);
  });
  it('is false when there are no injuries', () => {
    expect(exerciseConflictsWithInjury('Overhead Press', null)).toBe(false);
  });
});

// ─── V2: goal weighting + experience scaling ─────────────────────────────────

describe('evaluateProgressionV2 — goal weighting', () => {
  it('strength goal increases load using an experience-scaled increment', () => {
    const out = evaluateProgressionV2({
      exercise_history: [readyToProgress('Bench Press', 'chest')],
      recovery: goodRecoveryV2,
      program_targets: [benchTarget],
      profile: { goal: 'strength', experience_level: 'beginner' },
    });
    const s = out.strength_suggestions[0];
    expect(s.suggestion_type).toBe('increase_weight');
    // beginner upper-body increment: 2.5 * 1.5 = 3.75 → +3.75 over 100
    expect(s.suggested_values.weight).toBeGreaterThan(100);
    expect(s.suggested_values.sets).toBe(3); // load path keeps sets
  });

  it('hypertrophy goal adds a set instead of load', () => {
    const out = evaluateProgressionV2({
      exercise_history: [readyToProgress('Bench Press', 'chest')],
      recovery: goodRecoveryV2,
      program_targets: [benchTarget],
      profile: { goal: 'hypertrophy', experience_level: 'intermediate' },
    });
    const s = out.strength_suggestions[0];
    expect(s.suggested_values.sets).toBe(4); // +1 set
    expect(s.suggested_values.weight).toBe(100); // load unchanged
  });
});

// ─── V2: injury guardrail ─────────────────────────────────────────────────────

describe('evaluateProgressionV2 — injury guardrail', () => {
  it('holds a conflicting exercise at maintenance and records a note', () => {
    const out = evaluateProgressionV2({
      exercise_history: [readyToProgress('Overhead Press', 'shoulders')],
      recovery: goodRecoveryV2,
      program_targets: [{ ...benchTarget, exercise_name: 'Overhead Press' }],
      profile: { goal: 'strength', injuries: 'left shoulder impingement' },
    });
    const s = out.strength_suggestions[0];
    expect(s.suggestion_type).toBe('maintain');
    expect(out.guardrail_notes.length).toBeGreaterThan(0);
  });
});

// ─── V2: unified recovery ─────────────────────────────────────────────────────

describe('evaluateProgressionV2 — unified recovery', () => {
  it('marks recovery_state compromised and dampens both strength and cardio', () => {
    const cardio: CardioProgressionInput = {
      activity_type: 'running',
      pace_trend: 'increasing',
      weekly_distance_trend: 'increasing',
      avg_weekly_distance_meters: 20000,
      effort_count: 4,
    };
    const out = evaluateProgressionV2({
      exercise_history: [readyToProgress('Bench Press', 'chest')],
      recovery: poorRecoveryV2,
      program_targets: [benchTarget],
      profile: { goal: 'strength' },
      cardio: [cardio],
    });
    expect(out.recovery_state).toBe('compromised');
    // strength → rest_day (from base recovery override)
    expect(out.strength_suggestions[0].suggestion_type).toBe('rest_day');
    // cardio → reduce load
    expect(out.cardio_suggestions[0].suggestion_type).toBe('reduce_cardio_load');
  });
});

// ─── V2: cardio rules ─────────────────────────────────────────────────────────

describe('evaluateCardioProgression', () => {
  const base: CardioProgressionInput = {
    activity_type: 'running',
    pace_trend: 'stable',
    weekly_distance_trend: 'stable',
    avg_weekly_distance_meters: 15000,
    effort_count: 4,
  };

  it('reduces load when recovery is compromised', () => {
    expect(evaluateCardioProgression(base, true).suggestion_type).toBe('reduce_cardio_load');
  });

  it('adds intervals when pace is improving', () => {
    expect(evaluateCardioProgression({ ...base, pace_trend: 'increasing' }, false).suggestion_type).toBe('add_intervals');
  });

  it('increases distance when pace and volume are flat', () => {
    expect(evaluateCardioProgression(base, false).suggestion_type).toBe('increase_distance');
  });

  it('maintains when there is insufficient data', () => {
    expect(evaluateCardioProgression({ ...base, effort_count: 1 }, false).suggestion_type).toBe('maintain_cardio');
  });
});
