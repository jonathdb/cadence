/**
 * Unit tests for journal_draft, get_recovery_summary, and get_recent_workouts_summary
 * tool handlers.
 *
 * Validates: Requirements 15.2, 22.3
 */
import { describe, expect, it, vi } from 'vitest';
import { getToolHandler } from '../../supabase/functions/_shared/tool-handlers.ts';

// --- Mock Supabase Client Helpers ---

function createMockSupabaseForJournal(
  insertResult: { data: unknown; error: unknown } = {
    data: { id: 'entry-1', content: 'Great workout today' },
    error: null,
  }
) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'journal_entries') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(insertResult),
            }),
          }),
        };
      }
      return {};
    }),
  } as any;
}

function createMockSupabaseForHealth(options: {
  sleepRows?: unknown[];
  hrRows?: unknown[];
  activityRows?: unknown[];
  workoutsData?: unknown;
  workoutsError?: unknown;
}) {
  return {
    from: vi.fn((table: string) => {
      // get_recovery_summary now fetches ALL rows in the window and averages.
      // The query chain ends at .order() returning an array (no .limit/.single).
      if (table === 'imported_sleep_summaries') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: options.sleepRows ?? [],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'imported_heart_rate_summaries') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: options.hrRows ?? [],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'imported_activity_snapshots') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: options.activityRows ?? [],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'imported_workouts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: options.workoutsData ?? [],
                  error: options.workoutsError ?? null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    }),
  } as any;
}

// --- Tests ---

describe('Tool Handlers - Task 4.4', () => {
  const userId = 'user-abc-123';

  describe('journal_draft', () => {
    it('creates a journal entry with agent_drafted = true', async () => {
      const handler = getToolHandler('journal_draft')!;
      const supabase = createMockSupabaseForJournal({
        data: { id: 'je-1', content: 'Solid session today, hit PRs on bench' },
        error: null,
      });

      const result = (await handler(supabase, userId, {
        session_id: 'session-1',
        content: 'Solid session today, hit PRs on bench',
      })) as { journal_entry_id: string; content_preview: string };

      expect(result.journal_entry_id).toBe('je-1');
      expect(result.content_preview).toBe('Solid session today, hit PRs on bench');
    });

    it('truncates content_preview to 100 characters', async () => {
      const longContent = 'A'.repeat(200);
      const handler = getToolHandler('journal_draft')!;
      const supabase = createMockSupabaseForJournal({
        data: { id: 'je-2', content: longContent },
        error: null,
      });

      const result = (await handler(supabase, userId, {
        content: longContent,
      })) as { journal_entry_id: string; content_preview: string };

      expect(result.content_preview.length).toBe(100);
    });

    it('throws when content is missing', async () => {
      const handler = getToolHandler('journal_draft')!;
      const supabase = createMockSupabaseForJournal();

      await expect(
        handler(supabase, userId, { session_id: 's-1' })
      ).rejects.toThrow('journal_draft requires a "content" argument');
    });

    it('throws on database error', async () => {
      const handler = getToolHandler('journal_draft')!;
      const supabase = createMockSupabaseForJournal({
        data: null,
        error: { message: 'RLS violation' },
      });

      await expect(
        handler(supabase, userId, { content: 'Test entry' })
      ).rejects.toThrow('Failed to create journal entry: RLS violation');
    });

    it('works without session_id (optional)', async () => {
      const handler = getToolHandler('journal_draft')!;
      const supabase = createMockSupabaseForJournal({
        data: { id: 'je-3', content: 'General reflection' },
        error: null,
      });

      const result = (await handler(supabase, userId, {
        content: 'General reflection',
      })) as { journal_entry_id: string; content_preview: string };

      expect(result.journal_entry_id).toBe('je-3');
      expect(result.content_preview).toBe('General reflection');
    });
  });

  describe('get_recovery_summary', () => {
    it('averages sleep and resting HR across the window and reports latest + HRV baseline', async () => {
      const handler = getToolHandler('get_recovery_summary')!;
      const supabase = createMockSupabaseForHealth({
        // most-recent-first
        sleepRows: [
          { date: '2025-01-15', total_duration_minutes: 480, deep_minutes: 90, rem_minutes: 120 },
          { date: '2025-01-14', total_duration_minutes: 420, deep_minutes: 70, rem_minutes: 100 },
        ],
        hrRows: [
          { date: '2025-01-15', resting_bpm: 55, average_bpm: 72, max_bpm: 150 },
          { date: '2025-01-14', resting_bpm: 57, average_bpm: 74, max_bpm: 158 },
        ],
        activityRows: [
          { date: '2025-01-15', steps: 10000, hrv_ms: 40, vo2_max: 48.5 },
          { date: '2025-01-14', steps: 8000, hrv_ms: 50, vo2_max: 48.0 },
        ],
      });

      const result = (await handler(supabase, userId, { days: 7 })) as any;

      // Averages across the window
      expect(result.sleep.avg_total_hours).toBeCloseTo(7.5, 1); // (480+420)/2 = 450min = 7.5h
      expect(result.sleep.latest_total_hours).toBe(8.0);
      expect(result.heart_rate.avg_resting_bpm).toBe(56); // (55+57)/2
      expect(result.heart_rate.latest_resting_bpm).toBe(55);
      // HRV: latest is most-recent (40), baseline is the window average (45)
      expect(result.hrv.latest_ms).toBe(40);
      expect(result.hrv.baseline_ms).toBe(45);
      expect(result.window_days).toBe(7);
      expect(result.sample_counts).toEqual({ sleep: 2, heart_rate: 2, activity: 2 });
    });

    it('returns null averages and latests for empty sections', async () => {
      const handler = getToolHandler('get_recovery_summary')!;
      const supabase = createMockSupabaseForHealth({});

      const result = (await handler(supabase, userId, {})) as any;

      expect(result.sleep.avg_total_hours).toBeNull();
      expect(result.sleep.latest_total_hours).toBeNull();
      expect(result.heart_rate.avg_resting_bpm).toBeNull();
      expect(result.hrv.latest_ms).toBeNull();
      expect(result.hrv.baseline_ms).toBeNull();
    });

    it('defaults to 7 days when days argument is not provided', async () => {
      const handler = getToolHandler('get_recovery_summary')!;
      const supabase = createMockSupabaseForHealth({
        sleepRows: [{ date: '2025-01-15', total_duration_minutes: 420, deep_minutes: null, rem_minutes: null }],
      });

      const result = (await handler(supabase, userId, {})) as any;

      expect(result.window_days).toBe(7);
      expect(result.sleep.avg_total_hours).toBe(7.0);
      expect(result.sleep.latest_total_hours).toBe(7.0);
    });

    it('never returns raw_payload or raw record fields', async () => {
      const handler = getToolHandler('get_recovery_summary')!;
      const supabase = createMockSupabaseForHealth({
        sleepRows: [{ date: '2025-01-15', total_duration_minutes: 450, deep_minutes: 80, rem_minutes: 100 }],
        hrRows: [{ date: '2025-01-15', resting_bpm: 60, average_bpm: 75, max_bpm: 160 }],
        activityRows: [{ date: '2025-01-15', steps: 8000, hrv_ms: 42, vo2_max: 45 }],
      });

      const result = (await handler(supabase, userId, { days: 7 })) as any;

      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain('raw_payload');
      expect(resultStr).not.toContain('raw_record_id');
      expect(resultStr).not.toContain('provider_record_id');
    });
  });

  describe('get_recent_workouts_summary', () => {
    it('returns formatted workout summaries', async () => {
      const handler = getToolHandler('get_recent_workouts_summary')!;
      const supabase = createMockSupabaseForHealth({
        workoutsData: [
          { workout_type: 'running', start_time: '2025-01-15T08:00:00Z', duration_seconds: 1800, distance_meters: 5000 },
          { workout_type: 'cycling', start_time: '2025-01-14T07:00:00Z', duration_seconds: 3600, distance_meters: 20000 },
        ],
      });

      const result = (await handler(supabase, userId, { limit: 5 })) as any;

      expect(result.workouts).toHaveLength(2);
      expect(result.workouts[0]).toEqual({
        workout_type: 'running',
        start_time: '2025-01-15T08:00:00Z',
        duration_minutes: 30.0,
        distance_km: 5.0,
      });
      expect(result.workouts[1]).toEqual({
        workout_type: 'cycling',
        start_time: '2025-01-14T07:00:00Z',
        duration_minutes: 60.0,
        distance_km: 20.0,
      });
    });

    it('returns null distance_km when distance_meters is null', async () => {
      const handler = getToolHandler('get_recent_workouts_summary')!;
      const supabase = createMockSupabaseForHealth({
        workoutsData: [
          { workout_type: 'strength', start_time: '2025-01-15T09:00:00Z', duration_seconds: 2700, distance_meters: null },
        ],
      });

      const result = (await handler(supabase, userId, {})) as any;

      expect(result.workouts[0].distance_km).toBeNull();
    });

    it('defaults to limit 5 when not provided', async () => {
      const handler = getToolHandler('get_recent_workouts_summary')!;
      const supabase = createMockSupabaseForHealth({ workoutsData: [] });

      // Just verify it doesn't throw with empty args
      const result = (await handler(supabase, userId, {})) as any;
      expect(result.workouts).toEqual([]);
    });

    it('throws on database error', async () => {
      const handler = getToolHandler('get_recent_workouts_summary')!;
      const supabase = createMockSupabaseForHealth({
        workoutsData: null,
        workoutsError: { message: 'Connection error' },
      });

      await expect(handler(supabase, userId, {})).rejects.toThrow(
        'Failed to fetch workouts summary: Connection error'
      );
    });

    it('never exposes raw records or raw_payload', async () => {
      const handler = getToolHandler('get_recent_workouts_summary')!;
      const supabase = createMockSupabaseForHealth({
        workoutsData: [
          { workout_type: 'running', start_time: '2025-01-15T08:00:00Z', duration_seconds: 1800, distance_meters: 5000 },
        ],
      });

      const result = (await handler(supabase, userId, {})) as any;

      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain('raw_payload');
      expect(resultStr).not.toContain('raw_record_id');
      expect(resultStr).not.toContain('provider_record_id');
      expect(resultStr).not.toContain('route_data');
    });
  });
});
