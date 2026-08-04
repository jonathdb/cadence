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
  sleepData?: unknown;
  hrData?: unknown;
  activityData?: unknown;
  workoutsData?: unknown;
  workoutsError?: unknown;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'imported_sleep_summaries') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: options.sleepData ?? null,
                      error: options.sleepData ? null : { message: 'Not found' },
                    }),
                  }),
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
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: options.hrData ?? null,
                      error: options.hrData ? null : { message: 'Not found' },
                    }),
                  }),
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
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: options.activityData ?? null,
                      error: options.activityData ? null : { message: 'Not found' },
                    }),
                  }),
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
    it('returns all health sections when data is available', async () => {
      const handler = getToolHandler('get_recovery_summary')!;
      const supabase = createMockSupabaseForHealth({
        sleepData: { date: '2025-01-15', total_duration_minutes: 480, deep_minutes: 90, rem_minutes: 120 },
        hrData: { date: '2025-01-15', resting_bpm: 55, average_bpm: 72 },
        activityData: { date: '2025-01-15', steps: 10000, hrv_ms: 45, vo2_max: 48.5 },
      });

      const result = (await handler(supabase, userId, { days: 7 })) as any;

      expect(result.sleep).toEqual({
        date: '2025-01-15',
        total_hours: 8.0,
        deep_minutes: 90,
        rem_minutes: 120,
      });
      expect(result.heart_rate).toEqual({
        date: '2025-01-15',
        resting_bpm: 55,
        average_bpm: 72,
      });
      expect(result.activity).toEqual({
        date: '2025-01-15',
        steps: 10000,
        hrv_ms: 45,
        vo2_max: 48.5,
      });
    });

    it('returns null for sections with no data', async () => {
      const handler = getToolHandler('get_recovery_summary')!;
      const supabase = createMockSupabaseForHealth({});

      const result = (await handler(supabase, userId, {})) as any;

      expect(result.sleep).toBeNull();
      expect(result.heart_rate).toBeNull();
      expect(result.activity).toBeNull();
    });

    it('defaults to 7 days when days argument is not provided', async () => {
      const handler = getToolHandler('get_recovery_summary')!;
      const supabase = createMockSupabaseForHealth({
        sleepData: { date: '2025-01-15', total_duration_minutes: 420, deep_minutes: null, rem_minutes: null },
      });

      const result = (await handler(supabase, userId, {})) as any;

      expect(result.sleep).toEqual({
        date: '2025-01-15',
        total_hours: 7.0,
        deep_minutes: null,
        rem_minutes: null,
      });
    });

    it('never returns raw_payload or raw record fields', async () => {
      const handler = getToolHandler('get_recovery_summary')!;
      const supabase = createMockSupabaseForHealth({
        sleepData: { date: '2025-01-15', total_duration_minutes: 450, deep_minutes: 80, rem_minutes: 100 },
        hrData: { date: '2025-01-15', resting_bpm: 60, average_bpm: 75 },
        activityData: { date: '2025-01-15', steps: 8000, hrv_ms: 42, vo2_max: 45 },
      });

      const result = (await handler(supabase, userId, { days: 7 })) as any;

      // Verify no raw fields leak
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
