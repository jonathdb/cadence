/**
 * Unit tests for the Local WAL Service
 *
 * Tests the WAL service implementation including:
 * - Schema creation and initialization
 * - Enqueueing entries with UUID generation
 * - Referential integrity checks
 * - Status transitions: pending → syncing → synced/failed
 * - Query operations (getPending, getFailedCount, etc.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ReferentialIntegrityError,
    WALService,
    type EnqueueInput
} from '../../src/services/wal';

// ─── Mock expo-sqlite ────────────────────────────────────────────────────────

// We mock expo-sqlite to test the WAL service logic in isolation.
// The mock provides an in-memory store that simulates SQLite behavior.

interface MockRow {
  [key: string]: unknown;
}

let mockStore: MockRow[] = [];
let execCalls: string[] = [];

const mockDb = {
  execSync: vi.fn((sql: string) => {
    execCalls.push(sql);
  }),
  runSync: vi.fn((sql: string, params?: unknown[]) => {
    // Simulate INSERT
    if (sql.trim().toUpperCase().startsWith('INSERT')) {
      const entry: MockRow = {};
      if (params && params.length >= 8) {
        entry.id = params[0];
        entry.operation = params[1];
        entry.payload = params[2];
        entry.table_name = params[3];
        entry.record_id = params[4];
        entry.session_id = params[5];
        entry.exercise_id = params[6];
        entry.status = 'pending';
        entry.attempt_count = 0;
        entry.client_timestamp = params[7];
        entry.created_at = new Date().toISOString();
        entry.synced_at = null;
      }
      mockStore.push(entry);
      return { changes: 1, lastInsertRowId: mockStore.length };
    }
    // Simulate UPDATE for markSyncing
    if (sql.includes("status = 'syncing'") && sql.includes('status = \'pending\'')) {
      const ids = params as string[];
      let changes = 0;
      for (const row of mockStore) {
        if (ids.includes(row.id as string) && row.status === 'pending') {
          row.status = 'syncing';
          changes++;
        }
      }
      return { changes, lastInsertRowId: 0 };
    }
    // Simulate UPDATE for markSynced
    if (sql.includes("status = 'synced'") && sql.includes("synced_at")) {
      const syncedAt = params?.[0];
      const ids = (params as unknown[]).slice(1) as string[];
      let changes = 0;
      for (const row of mockStore) {
        if (ids.includes(row.id as string) && row.status === 'syncing') {
          row.status = 'synced';
          row.synced_at = syncedAt;
          changes++;
        }
      }
      return { changes, lastInsertRowId: 0 };
    }
    // Simulate UPDATE for markFailed
    if (sql.includes("status = 'failed'") && sql.includes("attempt_count = attempt_count + 1")) {
      const ids = params as string[];
      let changes = 0;
      for (const row of mockStore) {
        if (ids.includes(row.id as string) && row.status === 'syncing') {
          row.status = 'failed';
          row.attempt_count = (row.attempt_count as number) + 1;
          changes++;
        }
      }
      return { changes, lastInsertRowId: 0 };
    }
    // Simulate UPDATE for retryFailed
    if (sql.includes("status = 'pending'") && sql.includes("status = 'failed'")) {
      let changes = 0;
      for (const row of mockStore) {
        if (row.status === 'failed') {
          row.status = 'pending';
          changes++;
        }
      }
      return { changes, lastInsertRowId: 0 };
    }
    // Simulate DELETE for cleanupSynced
    if (sql.includes('DELETE') && sql.includes("status = 'synced'")) {
      const before = mockStore.length;
      mockStore = mockStore.filter((r) => r.status !== 'synced');
      return { changes: before - mockStore.length, lastInsertRowId: 0 };
    }
    return { changes: 0, lastInsertRowId: 0 };
  }),
  getAllSync: vi.fn((sql: string, params?: unknown[]) => {
    // Simulate SELECT for pending entries
    if (sql.includes("status = 'pending'") && sql.includes('ORDER BY')) {
      const pending = mockStore.filter((r) => r.status === 'pending');
      const limit = params?.[0] as number | undefined;
      return limit ? pending.slice(0, limit) : pending;
    }
    // Simulate SELECT for session entries
    if (sql.includes('session_id = ?') && sql.includes('record_id = ?')) {
      const sessionId = params?.[0] as string;
      return mockStore.filter(
        (r) => r.session_id === sessionId || (r.operation === 'session_start' && r.record_id === sessionId)
      );
    }
    // Simulate SELECT for hydrating known sessions
    if (sql.includes("operation = 'session_start'") && sql.includes('SELECT record_id')) {
      return mockStore
        .filter(
          (r) =>
            r.operation === 'session_start' &&
            ['pending', 'syncing', 'synced'].includes(r.status as string)
        )
        .map((r) => ({ record_id: r.record_id }));
    }
    return [];
  }),
  getFirstSync: vi.fn((sql: string, params?: unknown[]) => {
    // Simulate COUNT queries
    if (sql.includes('COUNT(*)')) {
      if (sql.includes("status = 'failed'")) {
        const count = mockStore.filter((r) => r.status === 'failed').length;
        return { count };
      }
      if (sql.includes('status = ?')) {
        const status = params?.[0] as string;
        const count = mockStore.filter((r) => r.status === status).length;
        return { count };
      }
    }
    // Simulate SELECT by ID
    if (sql.includes('WHERE id = ?')) {
      const id = params?.[0] as string;
      return mockStore.find((r) => r.id === id) ?? null;
    }
    // Simulate session existence check
    if (sql.includes("operation = 'session_start'") && sql.includes('record_id = ?')) {
      const recordId = params?.[0] as string;
      const found = mockStore.find(
        (r) =>
          r.operation === 'session_start' &&
          r.record_id === recordId &&
          ['pending', 'syncing', 'synced'].includes(r.status as string)
      );
      return found ? { id: found.id } : null;
    }
    return null;
  }),
} as unknown as import('expo-sqlite').SQLiteDatabase;

vi.mock('expo-sqlite', () => ({
  openDatabaseSync: vi.fn(() => mockDb),
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WALService', () => {
  let wal: WALService;

  beforeEach(() => {
    mockStore = [];
    execCalls = [];
    vi.clearAllMocks();
    wal = new WALService(mockDb);
    wal.init();
  });

  describe('init()', () => {
    it('should execute schema creation SQL', () => {
      expect(mockDb.execSync).toHaveBeenCalled();
      const schemaCall = execCalls[0];
      expect(schemaCall).toContain('CREATE TABLE IF NOT EXISTS wal_entries');
      expect(schemaCall).toContain('PRAGMA journal_mode = WAL');
      expect(schemaCall).toContain('CREATE INDEX IF NOT EXISTS idx_wal_status');
      expect(schemaCall).toContain('CREATE INDEX IF NOT EXISTS idx_wal_created');
    });
  });

  describe('enqueue()', () => {
    it('should insert a WAL entry with status pending', () => {
      const input: EnqueueInput = {
        operation: 'session_start',
        payload: { day_id: 'day-1', user_id: 'user-1' },
        table_name: 'sessions',
        record_id: 'session-123',
      };

      const id = wal.enqueue(input);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(mockStore.length).toBe(1);
      expect(mockStore[0].status).toBe('pending');
      expect(mockStore[0].operation).toBe('session_start');
      expect(mockStore[0].record_id).toBe('session-123');
    });

    it('should generate a valid UUID for the entry ID', () => {
      const input: EnqueueInput = {
        operation: 'session_start',
        payload: {},
        table_name: 'sessions',
        record_id: 'session-456',
      };

      const id = wal.enqueue(input);
      // UUID v4 format: 8-4-4-4-12 hex chars
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should serialize payload as JSON', () => {
      const payload = { reps: 8, weight: 100, rpe: 7.5 };
      const input: EnqueueInput = {
        operation: 'session_start',
        payload,
        table_name: 'sessions',
        record_id: 'session-789',
      };

      wal.enqueue(input);

      expect(mockStore[0].payload).toBe(JSON.stringify(payload));
    });

    it('should use provided client_timestamp', () => {
      const timestamp = '2024-01-15T10:30:00.000Z';
      const input: EnqueueInput = {
        operation: 'session_start',
        payload: {},
        table_name: 'sessions',
        record_id: 'session-101',
        client_timestamp: timestamp,
      };

      wal.enqueue(input);

      expect(mockStore[0].client_timestamp).toBe(timestamp);
    });

    it('should generate client_timestamp if not provided', () => {
      const input: EnqueueInput = {
        operation: 'session_start',
        payload: {},
        table_name: 'sessions',
        record_id: 'session-102',
      };

      const before = new Date().toISOString();
      wal.enqueue(input);

      expect(mockStore[0].client_timestamp).toBeDefined();
      expect(new Date(mockStore[0].client_timestamp as string).getTime()).toBeGreaterThanOrEqual(
        new Date(before).getTime() - 1000
      );
    });

    it('should register session_id after enqueuing session_start', () => {
      const input: EnqueueInput = {
        operation: 'session_start',
        payload: {},
        table_name: 'sessions',
        record_id: 'session-new',
      };

      wal.enqueue(input);

      // Now a set_log referencing this session should work
      const setInput: EnqueueInput = {
        operation: 'set_log',
        payload: { reps: 8, weight: 100 },
        table_name: 'logged_sets',
        record_id: 'set-1',
        session_id: 'session-new',
        exercise_id: 'exercise-1',
      };

      expect(() => wal.enqueue(setInput)).not.toThrow();
    });
  });

  describe('Referential Integrity', () => {
    it('should reject set_log without session_id', () => {
      const input: EnqueueInput = {
        operation: 'set_log',
        payload: { reps: 8 },
        table_name: 'logged_sets',
        record_id: 'set-1',
      };

      expect(() => wal.enqueue(input)).toThrow(ReferentialIntegrityError);
      expect(() => wal.enqueue(input)).toThrow(/requires a session_id/);
    });

    it('should reject set_log with unknown session_id', () => {
      const input: EnqueueInput = {
        operation: 'set_log',
        payload: { reps: 8 },
        table_name: 'logged_sets',
        record_id: 'set-1',
        session_id: 'non-existent-session',
        exercise_id: 'exercise-1',
      };

      expect(() => wal.enqueue(input)).toThrow(ReferentialIntegrityError);
      expect(() => wal.enqueue(input)).toThrow(/does not exist/);
    });

    it('should reject set_edit with unknown session_id', () => {
      const input: EnqueueInput = {
        operation: 'set_edit',
        payload: { reps: 10 },
        table_name: 'logged_sets',
        record_id: 'set-1',
        session_id: 'unknown-session',
        exercise_id: 'exercise-1',
      };

      expect(() => wal.enqueue(input)).toThrow(ReferentialIntegrityError);
    });

    it('should reject set_delete with unknown session_id', () => {
      const input: EnqueueInput = {
        operation: 'set_delete',
        payload: {},
        table_name: 'logged_sets',
        record_id: 'set-1',
        session_id: 'unknown-session',
        exercise_id: 'exercise-1',
      };

      expect(() => wal.enqueue(input)).toThrow(ReferentialIntegrityError);
    });

    it('should allow set_log when session is registered externally', () => {
      wal.registerKnownSession('external-session-1');

      const input: EnqueueInput = {
        operation: 'set_log',
        payload: { reps: 8 },
        table_name: 'logged_sets',
        record_id: 'set-1',
        session_id: 'external-session-1',
        exercise_id: 'exercise-1',
      };

      expect(() => wal.enqueue(input)).not.toThrow();
    });

    it('should allow session_start without session_id (it creates one)', () => {
      const input: EnqueueInput = {
        operation: 'session_start',
        payload: {},
        table_name: 'sessions',
        record_id: 'new-session',
      };

      expect(() => wal.enqueue(input)).not.toThrow();
    });

    it('should allow session_complete without session_id requirement', () => {
      // session_complete doesn't need referential integrity on session_id
      // because it IS a session operation itself
      const input: EnqueueInput = {
        operation: 'session_complete',
        payload: { duration: 3600 },
        table_name: 'sessions',
        record_id: 'session-done',
      };

      expect(() => wal.enqueue(input)).not.toThrow();
    });
  });

  describe('Status Transitions', () => {
    let entryId: string;

    beforeEach(() => {
      const input: EnqueueInput = {
        operation: 'session_start',
        payload: {},
        table_name: 'sessions',
        record_id: 'session-st',
      };
      entryId = wal.enqueue(input);
    });

    it('should transition pending → syncing', () => {
      expect(mockStore[0].status).toBe('pending');

      wal.markSyncing([entryId]);

      expect(mockStore[0].status).toBe('syncing');
    });

    it('should transition syncing → synced', () => {
      wal.markSyncing([entryId]);
      wal.markSynced([entryId]);

      expect(mockStore[0].status).toBe('synced');
      expect(mockStore[0].synced_at).toBeDefined();
    });

    it('should transition syncing → failed and increment attempt_count', () => {
      wal.markSyncing([entryId]);
      wal.markFailed([entryId]);

      expect(mockStore[0].status).toBe('failed');
      expect(mockStore[0].attempt_count).toBe(1);
    });

    it('should not transition directly from pending → synced', () => {
      // markSynced only works on 'syncing' entries
      wal.markSynced([entryId]);
      expect(mockStore[0].status).toBe('pending'); // unchanged
    });

    it('should not transition directly from pending → failed', () => {
      // markFailed only works on 'syncing' entries
      wal.markFailed([entryId]);
      expect(mockStore[0].status).toBe('pending'); // unchanged
    });

    it('should handle batch status updates', () => {
      // Enqueue multiple entries
      const id2 = wal.enqueue({
        operation: 'session_start',
        payload: {},
        table_name: 'sessions',
        record_id: 'session-st-2',
      });
      const id3 = wal.enqueue({
        operation: 'session_start',
        payload: {},
        table_name: 'sessions',
        record_id: 'session-st-3',
      });

      wal.markSyncing([entryId, id2, id3]);

      expect(mockStore.every((r) => r.status === 'syncing')).toBe(true);
    });

    it('should handle empty arrays gracefully', () => {
      expect(() => wal.markSyncing([])).not.toThrow();
      expect(() => wal.markSynced([])).not.toThrow();
      expect(() => wal.markFailed([])).not.toThrow();
    });
  });

  describe('getPending()', () => {
    beforeEach(() => {
      // Enqueue 3 entries
      wal.enqueue({ operation: 'session_start', payload: {}, table_name: 'sessions', record_id: 's1' });
      wal.enqueue({ operation: 'session_start', payload: {}, table_name: 'sessions', record_id: 's2' });
      wal.enqueue({ operation: 'session_start', payload: {}, table_name: 'sessions', record_id: 's3' });
    });

    it('should return all pending entries when no limit specified', () => {
      const pending = wal.getPending();
      expect(pending.length).toBe(3);
    });

    it('should respect the limit parameter', () => {
      const pending = wal.getPending(2);
      expect(pending.length).toBe(2);
    });

    it('should not return entries that have been marked syncing', () => {
      const pending = wal.getPending();
      wal.markSyncing([pending[0].id as string]);

      const stillPending = wal.getPending();
      expect(stillPending.length).toBe(2);
    });
  });

  describe('getFailedCount()', () => {
    it('should return 0 when no failed entries', () => {
      expect(wal.getFailedCount()).toBe(0);
    });

    it('should return the count of failed entries', () => {
      const id = wal.enqueue({ operation: 'session_start', payload: {}, table_name: 'sessions', record_id: 's1' });
      wal.markSyncing([id]);
      wal.markFailed([id]);

      expect(wal.getFailedCount()).toBe(1);
    });
  });

  describe('retryFailed()', () => {
    it('should reset failed entries back to pending', () => {
      const id = wal.enqueue({ operation: 'session_start', payload: {}, table_name: 'sessions', record_id: 's1' });
      wal.markSyncing([id]);
      wal.markFailed([id]);

      expect(mockStore[0].status).toBe('failed');

      wal.retryFailed();

      expect(mockStore[0].status).toBe('pending');
    });
  });

  describe('registerKnownSession()', () => {
    it('should make session available for integrity checks', () => {
      wal.registerKnownSession('external-session');

      expect(wal.isSessionKnown('external-session')).toBe(true);
    });

    it('should support batch registration', () => {
      wal.registerKnownSessions(['s1', 's2', 's3']);

      expect(wal.isSessionKnown('s1')).toBe(true);
      expect(wal.isSessionKnown('s2')).toBe(true);
      expect(wal.isSessionKnown('s3')).toBe(true);
    });
  });

  describe('getCountByStatus()', () => {
    it('should return count for a given status', () => {
      wal.enqueue({ operation: 'session_start', payload: {}, table_name: 'sessions', record_id: 's1' });
      wal.enqueue({ operation: 'session_start', payload: {}, table_name: 'sessions', record_id: 's2' });

      expect(wal.getCountByStatus('pending')).toBe(2);
      expect(wal.getCountByStatus('syncing')).toBe(0);
    });
  });
});
