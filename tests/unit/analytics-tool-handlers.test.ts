/**
 * Handler-level tests for the analytics retrieval tools (Task 3):
 * get_training_analytics, get_pr_history, get_cardio_analytics.
 *
 * Uses a small chainable Supabase mock keyed by table name. Each table returns a
 * fixed dataset; the query-builder methods are chainable and thenable so the
 * handler's `await query` and `.in()/.eq()/.gte()/.order()` chains resolve.
 */
import { describe, expect, it, vi } from 'vitest';
import { getToolHandler } from '../../supabase/functions/_shared/tool-handlers.ts';

/** Build a chainable, thenable query object that resolves to { data, error }. */
function queryResult(data: unknown[]) {
  const result = { data, error: null };
  const builder: any = {};
  const chain = () => builder;
  for (const m of ['select', 'eq', 'gte', 'lte', 'in', 'or', 'ilike', 'order', 'limit']) {
    builder[m] = vi.fn(chain);
  }
  // Thenable so `await builder` and `await builder.order(...)` both resolve.
  builder.then = (resolve: (v: typeof result) => unknown) => resolve(result);
  // .single()/.maybeSingle() resolve to the first row.
  builder.single = vi.fn().mockResolvedValue({ data: data[0] ?? null, error: data[0] ? null : { message: 'not found' } });
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: data[0] ?? null, error: null });
  return builder;
}

function mockSupabase(tables: Record<string, unknown[]>, inserts?: { onInsert?: (t: string, row: unknown) => void }) {
  return {
    from: vi.fn((table: string) => {
      const builder = queryResult(tables[table] ?? []);
      builder.insert = vi.fn((row: unknown) => {
        inserts?.onInsert?.(table, row);
        return { data: null, error: null };
      });
      return builder;
    }),
  } as any;
}

const userId = 'user-1';

describe('get_training_analytics', () => {
  it('returns empty analytics when there are no completed sessions', async () => {
    const handler = getToolHandler('get_training_analytics')!;
    const supabase = mockSupabase({ sessions: [] });

    const result = (await handler(supabase, userId, { weeks: 8, planned_per_week: 3 })) as any;

    expect(result.window_weeks).toBe(8);
    expect(result.volume_trend.total_volume).toBe(0);
    expect(result.muscle_balance.total_volume).toBe(0);
    expect(result.adherence.completed_sessions).toBe(0);
  });

  it('aggregates volume, muscle balance, and adherence from sessions + sets', async () => {
    const handler = getToolHandler('get_training_analytics')!;
    const supabase = mockSupabase({
      sessions: [
        { id: 's1', completed_at: '2026-01-05T10:00:00Z' },
        { id: 's2', completed_at: '2026-01-12T10:00:00Z' },
      ],
      logged_sets: [
        { session_id: 's1', exercise_id: 'e1', reps: 10, weight: 100, rpe: 7, logged_at: '2026-01-05T10:00:00Z' },
        { session_id: 's2', exercise_id: 'e1', reps: 10, weight: 110, rpe: 7, logged_at: '2026-01-12T10:00:00Z' },
        { session_id: 's2', exercise_id: 'e2', reps: 10, weight: 40, rpe: 7, logged_at: '2026-01-12T10:00:00Z' },
      ],
      exercises: [
        { id: 'e1', primary_muscle_group: 'chest' },
        { id: 'e2', primary_muscle_group: 'biceps' },
      ],
    });

    const result = (await handler(supabase, userId, { weeks: 4, planned_per_week: 1 })) as any;

    expect(result.volume_trend.total_volume).toBe(100 * 10 + 110 * 10 + 40 * 10);
    expect(result.muscle_balance.most_trained).toBe('chest');
    expect(result.adherence.completed_sessions).toBe(2);
  });
});

describe('get_pr_history', () => {
  it('computes PR timelines and backfills personal_records', async () => {
    const handler = getToolHandler('get_pr_history')!;
    const inserted: { table: string; row: any }[] = [];
    const supabase = mockSupabase(
      {
        exercises: [{ id: 'e1', name: 'Bench Press' }],
        sessions: [{ id: 's1' }, { id: 's2' }],
        logged_sets: [
          { session_id: 's1', exercise_id: 'e1', reps: 5, weight: 100, logged_at: '2026-01-01T10:00:00Z' },
          { session_id: 's2', exercise_id: 'e1', reps: 5, weight: 110, logged_at: '2026-01-08T10:00:00Z' },
        ],
        personal_records: [],
      },
      { onInsert: (table, row) => inserted.push({ table, row }) }
    );

    const result = (await handler(supabase, userId, {})) as any;

    expect(result.pr_history).toHaveLength(1);
    expect(result.pr_history[0].exercise_name).toBe('Bench Press');
    expect(result.pr_history[0].best_weight).toBe(110);
    // Backfilled the latest PR into personal_records
    const prInserts = inserted.filter((i) => i.table === 'personal_records');
    expect(prInserts.length).toBeGreaterThan(0);
    expect(prInserts[prInserts.length - 1].row.value).toBe(110);
  });

  it('returns empty when no exercises match', async () => {
    const handler = getToolHandler('get_pr_history')!;
    const supabase = mockSupabase({ exercises: [] });
    const result = (await handler(supabase, userId, { exercise_name: 'Nonexistent' })) as any;
    expect(result.pr_history).toEqual([]);
  });
});

describe('suggest_progression (server-assembled)', () => {
  it('assembles inputs from the DB and returns unified v2 suggestions', async () => {
    const handler = getToolHandler('suggest_progression')!;
    const supabase = mockSupabase({
      // active program → days → items → exercises
      programs: [{ id: 'prog-1' }],
      program_days: [{ id: 'day-1' }],
      program_day_items: [
        { exercise_id: 'e1', target_sets: 3, target_reps: '8-12', target_weight: 100, target_rpe: 8 },
      ],
      exercises: [{ id: 'e1', name: 'Bench Press', primary_muscle_group: 'chest' }],
      // recent completed sessions + low-RPE sets → ready to progress
      sessions: [
        { id: 's1', completed_at: '2026-01-12T10:00:00Z' },
        { id: 's2', completed_at: '2026-01-05T10:00:00Z' },
      ],
      logged_sets: [
        { session_id: 's1', exercise_id: 'e1', reps: 10, weight: 100, rpe: 6 },
        { session_id: 's2', exercise_id: 'e1', reps: 10, weight: 100, rpe: 6 },
      ],
      // recovery window (good) — recovery handler reads these
      imported_sleep_summaries: [{ date: '2026-01-12', total_duration_minutes: 480, deep_minutes: 90, rem_minutes: 120 }],
      imported_heart_rate_summaries: [{ date: '2026-01-12', resting_bpm: 55, average_bpm: 70, max_bpm: 150 }],
      imported_activity_snapshots: [{ date: '2026-01-12', steps: 9000, hrv_ms: 60, vo2_max: 48 }],
      // no cardio
      routes: [],
      imported_workouts: [],
      // profile: strength goal
      user_profiles: [{ goal: 'strength', experience_level: 'intermediate', injuries: null, equipment: [] }],
    });

    const result = (await handler(supabase, userId, { scope: 'full_program' })) as any;

    expect(result.recovery_state).toBe('ok');
    expect(result.goal).toBe('strength');
    expect(result.strength_suggestions).toHaveLength(1);
    expect(result.strength_suggestions[0].exercise_name).toBe('Bench Press');
    expect(result.strength_suggestions[0].suggestion_type).toBe('increase_weight');
    expect(Array.isArray(result.cardio_suggestions)).toBe(true);
  });
});

describe('get_cardio_analytics', () => {
  it('combines routes and imported workouts into pace trend + load', async () => {
    const handler = getToolHandler('get_cardio_analytics')!;
    const supabase = mockSupabase({
      routes: [
        { distance_meters: 5000, duration_seconds: 1500, avg_pace_seconds_per_km: 300, avg_speed_kmh: 12, elevation_gain_meters: 0, created_at: '2026-01-05T10:00:00Z' },
      ],
      imported_workouts: [
        { workout_type: 'running', start_time: '2026-01-12T10:00:00Z', duration_seconds: 1400, distance_meters: 5000, average_pace_seconds_per_km: 280, average_speed_kmh: 12.8, elevation_gain_meters: 0 },
      ],
    });

    const result = (await handler(supabase, userId, { activity_type: 'running', weeks: 8 })) as any;

    expect(result.activity_type).toBe('running');
    expect(result.effort_count).toBe(2);
    // Second week faster (280 < 300) → improving fitness
    expect(result.pace_trend.pace_trend).toBe('increasing');
    expect(result.weekly_load.total_distance_meters).toBe(10000);
  });

  it('handles no cardio data', async () => {
    const handler = getToolHandler('get_cardio_analytics')!;
    const supabase = mockSupabase({ routes: [], imported_workouts: [] });
    const result = (await handler(supabase, userId, {})) as any;
    expect(result.effort_count).toBe(0);
    expect(result.pace_trend.pace_trend).toBe('stable');
  });
});
