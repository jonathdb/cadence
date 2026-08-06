/**
 * Unit tests for the Sync Engine Service
 *
 * Tests the Sync Engine implementation including:
 * - flush() transmitting pending WAL entries
 * - Last-write-wins conflict resolution
 * - Exponential backoff retry delay calculation
 * - Failure marking after max attempts
 * - onConnectivityChange triggering flush on reconnect
 * - Idempotent flush (concurrent flush guard)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncEngine } from '../../src/services/sync-engine';
import type { WALEntry } from '../../src/services/wal';

// ─── Mock Dependencies ───────────────────────────────────────────────────────

// Mock the WAL service
const mockGetPending = vi.fn<() => WALEntry[]>();
const mockMarkSyncing = vi.fn();
const mockMarkSynced = vi.fn();
const mockMarkFailed = vi.fn();
const mockGetFailedCount = vi.fn<() => number>();
const mockRetryFailed = vi.fn();

vi.mock('@/services/wal', () => ({
  getWAL: () => ({
    getPending: mockGetPending,
    markSyncing: mockMarkSyncing,
    markSynced: mockMarkSynced,
    markFailed: mockMarkFailed,
    getFailedCount: mockGetFailedCount,
    retryFailed: mockRetryFailed,
  }),
}));

// Mock Supabase client
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();
const mockUpsert = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/utils/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => {
      mockFrom(...args);
      return {
        select: (...selectArgs: unknown[]) => {
          mockSelect(...selectArgs);
          return {
            eq: (...eqArgs: unknown[]) => {
              mockEq(...eqArgs);
              return {
                maybeSingle: () => mockMaybeSingle(),
              };
            },
          };
        },
        upsert: (...upsertArgs: unknown[]) => mockUpsert(...upsertArgs),
        delete: () => ({
          eq: (...eqArgs: unknown[]) => {
            mockDelete(...eqArgs);
            return mockDelete();
          },
        }),
      };
    },
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockWALEntry(overrides: Partial<WALEntry> = {}): WALEntry {
  return {
    id: crypto.randomUUID(),
    operation: 'set_log',
    payload: JSON.stringify({ reps: 8, weight: 100 }),
    table_name: 'logged_sets',
    record_id: crypto.randomUUID(),
    session_id: 'session-1',
    exercise_id: 'exercise-1',
    status: 'pending',
    attempt_count: 0,
    client_timestamp: '2024-06-01T10:00:00.000Z',
    created_at: '2024-06-01T10:00:00.000Z',
    synced_at: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SyncEngine', () => {
  let engine: SyncEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new SyncEngine({ batchSize: 20, maxAttempts: 5, baseRetryMs: 1000 });

    // Default mock behaviors
    mockGetPending.mockReturnValue([]);
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockUpsert.mockResolvedValue({ data: null, error: null });
    mockDelete.mockResolvedValue({ data: null, error: null });
  });

  describe('resolveConflict()', () => {
    it('should return "local" when client timestamp is newer', () => {
      const result = engine.resolveConflict(
        '2024-06-01T12:00:00.000Z',
        '2024-06-01T10:00:00.000Z'
      );
      expect(result).toBe('local');
    });

    it('should return "server" when server timestamp is newer', () => {
      const result = engine.resolveConflict(
        '2024-06-01T10:00:00.000Z',
        '2024-06-01T12:00:00.000Z'
      );
      expect(result).toBe('server');
    });

    it('should return "server" when timestamps are equal', () => {
      const result = engine.resolveConflict(
        '2024-06-01T10:00:00.000Z',
        '2024-06-01T10:00:00.000Z'
      );
      expect(result).toBe('server');
    });

    it('should handle millisecond differences', () => {
      const result = engine.resolveConflict(
        '2024-06-01T10:00:00.001Z',
        '2024-06-01T10:00:00.000Z'
      );
      expect(result).toBe('local');
    });
  });

  describe('getRetryDelayMs()', () => {
    it('should return 1000ms for attempt 1', () => {
      expect(engine.getRetryDelayMs(1)).toBe(1000);
    });

    it('should return 2000ms for attempt 2', () => {
      expect(engine.getRetryDelayMs(2)).toBe(2000);
    });

    it('should return 4000ms for attempt 3', () => {
      expect(engine.getRetryDelayMs(3)).toBe(4000);
    });

    it('should return 8000ms for attempt 4', () => {
      expect(engine.getRetryDelayMs(4)).toBe(8000);
    });

    it('should return 16000ms for attempt 5', () => {
      expect(engine.getRetryDelayMs(5)).toBe(16000);
    });

    it('should use custom baseRetryMs', () => {
      const customEngine = new SyncEngine({ baseRetryMs: 500 });
      expect(customEngine.getRetryDelayMs(1)).toBe(500);
      expect(customEngine.getRetryDelayMs(2)).toBe(1000);
      expect(customEngine.getRetryDelayMs(3)).toBe(2000);
    });

    it('should return baseRetryMs for attempt < 1', () => {
      expect(engine.getRetryDelayMs(0)).toBe(1000);
      expect(engine.getRetryDelayMs(-1)).toBe(1000);
    });
  });

  describe('flush()', () => {
    it('should not flush when already flushing (idempotent)', async () => {
      // Create a slow-resolving pending entry scenario
      const entry = createMockWALEntry();
      let callCount = 0;
      mockGetPending.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [entry];
        return [];
      });
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });
      mockUpsert.mockResolvedValue({ data: null, error: null });

      // Start two flushes simultaneously
      const flush1 = engine.flush();
      const flush2 = engine.flush();

      await Promise.all([flush1, flush2]);

      // Only one flush should have processed entries
      expect(mockMarkSyncing).toHaveBeenCalledTimes(1);
    });

    it('should mark entries as synced on successful transmission', async () => {
      const entry = createMockWALEntry();
      let callCount = 0;
      mockGetPending.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [entry];
        return [];
      });
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });
      mockUpsert.mockResolvedValue({ data: null, error: null });

      await engine.flush();

      expect(mockMarkSyncing).toHaveBeenCalledWith([entry.id]);
      expect(mockMarkSynced).toHaveBeenCalledWith([entry.id]);
    });

    it('should mark entries as failed on transmission error', async () => {
      const entry = createMockWALEntry();
      let callCount = 0;
      mockGetPending.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [entry];
        return [];
      });
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });
      mockUpsert.mockResolvedValue({ data: null, error: { message: 'Network error' } });

      await engine.flush();

      expect(mockMarkFailed).toHaveBeenCalledWith([entry.id]);
    });

    it('should process multiple batches until no pending remain', async () => {
      const entry1 = createMockWALEntry();
      const entry2 = createMockWALEntry();
      let callCount = 0;
      mockGetPending.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [entry1];
        if (callCount === 2) return [entry2];
        return [];
      });
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });
      mockUpsert.mockResolvedValue({ data: null, error: null });

      // Use batchSize 1 to force multiple batches
      engine = new SyncEngine({ batchSize: 1 });
      await engine.flush();

      expect(mockMarkSyncing).toHaveBeenCalledTimes(2);
      expect(mockMarkSynced).toHaveBeenCalledTimes(2);
    });

    it('should handle delete operations', async () => {
      const entry = createMockWALEntry({
        operation: 'set_delete',
        payload: JSON.stringify({}),
      });
      let callCount = 0;
      mockGetPending.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [entry];
        return [];
      });
      mockDelete.mockResolvedValue({ data: null, error: null });

      await engine.flush();

      expect(mockMarkSynced).toHaveBeenCalledWith([entry.id]);
    });

    it('should mark as synced when server wins conflict (local write discarded)', async () => {
      const entry = createMockWALEntry({
        client_timestamp: '2024-06-01T10:00:00.000Z',
      });
      let callCount = 0;
      mockGetPending.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [entry];
        return [];
      });
      // Server has newer data
      mockMaybeSingle.mockResolvedValue({
        data: { updated_at: '2024-06-01T12:00:00.000Z' },
        error: null,
      });

      await engine.flush();

      // Entry should be marked as synced (server already has newer data)
      expect(mockMarkSynced).toHaveBeenCalledWith([entry.id]);
      // Upsert should NOT have been called
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('should upsert when local wins conflict', async () => {
      const entry = createMockWALEntry({
        client_timestamp: '2024-06-01T12:00:00.000Z',
      });
      let callCount = 0;
      mockGetPending.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [entry];
        return [];
      });
      // Server has older data
      mockMaybeSingle.mockResolvedValue({
        data: { updated_at: '2024-06-01T10:00:00.000Z' },
        error: null,
      });
      mockUpsert.mockResolvedValue({ data: null, error: null });

      await engine.flush();

      expect(mockUpsert).toHaveBeenCalled();
      expect(mockMarkSynced).toHaveBeenCalledWith([entry.id]);
    });

    it('should release isFlushing flag even on error', async () => {
      mockGetPending.mockImplementation(() => {
        throw new Error('Unexpected DB error');
      });

      // Should not throw — flush catches errors internally
      try {
        await engine.flush();
      } catch {
        // flush might throw if getPending throws inside the try block
      }

      // Should be able to flush again (flag released)
      expect(engine.getIsFlushing()).toBe(false);
    });
  });

  describe('onConnectivityChange()', () => {
    it('should trigger flush when connectivity is restored', async () => {
      mockGetPending.mockReturnValue([]);

      engine.onConnectivityChange(true);

      // Give the async flush time to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // flush was called (getPending was invoked)
      expect(mockGetPending).toHaveBeenCalled();
    });

    it('should not trigger flush when connectivity is lost', async () => {
      engine.onConnectivityChange(false);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // flush should NOT have been called
      expect(mockGetPending).not.toHaveBeenCalled();
    });
  });

  describe('getFailedCount()', () => {
    it('should return the WAL failed count', async () => {
      mockGetFailedCount.mockReturnValue(3);

      const count = await engine.getFailedCount();

      expect(count).toBe(3);
    });
  });

  describe('retryFailed()', () => {
    it('should reset failed entries and flush', async () => {
      mockGetPending.mockReturnValue([]);

      await engine.retryFailed();

      expect(mockRetryFailed).toHaveBeenCalled();
      expect(mockGetPending).toHaveBeenCalled();
    });
  });

  describe('transmitEntry()', () => {
    it('should handle malformed payload gracefully', async () => {
      const entry = createMockWALEntry({
        payload: 'invalid-json{{{',
      });

      const result = await engine.transmitEntry(entry);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle session_start as INSERT', async () => {
      const entry = createMockWALEntry({
        operation: 'session_start',
        table_name: 'sessions',
        payload: JSON.stringify({ user_id: 'user-1', day_id: 'day-1' }),
      });
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });
      mockUpsert.mockResolvedValue({ data: null, error: null });

      const result = await engine.transmitEntry(entry);

      expect(result.success).toBe(true);
    });

    it('should handle session_complete as UPDATE', async () => {
      const entry = createMockWALEntry({
        operation: 'session_complete',
        table_name: 'sessions',
        payload: JSON.stringify({ duration: 3600, completed_at: '2024-06-01T11:00:00Z' }),
      });
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });
      mockUpsert.mockResolvedValue({ data: null, error: null });

      const result = await engine.transmitEntry(entry);

      expect(result.success).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should use default config values when none provided', () => {
      const defaultEngine = new SyncEngine();
      expect(defaultEngine.getRetryDelayMs(1)).toBe(1000);
      expect(defaultEngine.getRetryDelayMs(5)).toBe(16000);
    });

    it('should accept custom configuration', () => {
      const customEngine = new SyncEngine({
        batchSize: 10,
        maxAttempts: 3,
        baseRetryMs: 500,
        concurrency: 3,
      });
      expect(customEngine.getRetryDelayMs(1)).toBe(500);
      expect(customEngine.getRetryDelayMs(2)).toBe(1000);
    });
  });
});
