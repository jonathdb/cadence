/**
 * Local Write-Ahead Log (WAL) Service
 *
 * Persists all session operations to a local SQLite database using expo-sqlite
 * for offline-first operation. All operations are persisted within 100ms of
 * the user action.
 *
 * Requirements: 4.1, 4.6
 */
import { Platform } from 'react-native';

import { randomUUID } from '@/utils/uuid';

// Lazy-load expo-sqlite only on native platforms to avoid web .wasm resolution errors
let SQLite: typeof import('expo-sqlite') | null = null;
function getSQLite(): typeof import('expo-sqlite') {
  if (!SQLite) {
    if (Platform.OS === 'web') {
      throw new Error('expo-sqlite is not available on web platform');
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SQLite = require('expo-sqlite') as typeof import('expo-sqlite');
  }
  return SQLite;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type WALOperation =
  | 'session_start'
  | 'set_log'
  | 'set_edit'
  | 'set_delete'
  | 'session_complete'
  // Manual + agent session edit/delete (Requirement 4.13 — see session-manager.ts).
  // session_soft_delete sets sessions.deleted_at; it is never a hard DELETE
  // so logged_sets survive (Requirement 4.12).
  | 'session_update'
  | 'session_soft_delete'
  // Manual + agent exercise-instance edit/delete on program_day_items rows
  // (Requirement 4.13 — see program-manager.ts / tool-handlers.ts).
  | 'program_day_item_insert'
  | 'program_day_item_update'
  | 'program_day_item_delete'
  // Program lifecycle ops (offline archive/hide/purge — see program-manager.ts)
  | 'program_archive'
  | 'program_hide'
  | 'program_purge';

export type WALStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface WALEntry {
  id: string;
  operation: WALOperation;
  payload: string; // JSON-serialized operation data
  table_name: string; // target Supabase table
  record_id: string; // UUID of the target record
  session_id: string | null; // FK reference for integrity checks
  exercise_id: string | null; // FK reference for integrity checks
  status: WALStatus;
  attempt_count: number;
  client_timestamp: string; // ISO string for conflict resolution
  created_at: string;
  synced_at: string | null;
}

export interface EnqueueInput {
  operation: WALOperation;
  payload: Record<string, unknown>;
  table_name: string;
  record_id: string;
  session_id?: string | null;
  exercise_id?: string | null;
  client_timestamp?: string;
}

export class ReferentialIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferentialIntegrityError';
  }
}

// ─── WAL Service ─────────────────────────────────────────────────────────────

export class WALService {
  private db: any; // SQLite.SQLiteDatabase (lazily resolved)
  private knownSessionIds: Set<string> = new Set();

  constructor(db: any) {
    this.db = db;
  }

  /**
   * Initialize the WAL database schema.
   * Creates the wal_entries table and indexes if they don't exist.
   */
  init(): void {
    this.db.execSync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS wal_entries (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL CHECK (operation IN ('session_start', 'set_log', 'set_edit', 'set_delete', 'session_complete', 'session_update', 'session_soft_delete', 'program_day_item_insert', 'program_day_item_update', 'program_day_item_delete', 'program_archive', 'program_hide', 'program_purge')),
        payload TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        session_id TEXT,
        exercise_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'syncing', 'synced', 'failed')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        client_timestamp TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        synced_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_wal_status ON wal_entries(status);
      CREATE INDEX IF NOT EXISTS idx_wal_created ON wal_entries(created_at);
      CREATE INDEX IF NOT EXISTS idx_wal_session_id ON wal_entries(session_id);
    `);

    // Migrate the operation CHECK constraint on databases created before the
    // program lifecycle ops or the session/exercise-instance edit ops were
    // added. CREATE TABLE IF NOT EXISTS leaves the old CHECK in place, which
    // would reject the newer op names, so rebuild the table when either
    // constraint generation is detected as stale.
    this.migrateOperationCheck();

    // Hydrate known session IDs from existing WAL entries
    this.hydrateKnownSessions();
  }

  /**
   * Rebuild the wal_entries table when its `operation` CHECK constraint predates
   * the program lifecycle ops or the session/exercise-instance edit ops.
   * SQLite can't ALTER a CHECK, so detect the old definition in sqlite_master
   * and, if the newest op names are missing, recreate the table (preserving
   * all rows) with the widened constraint.
   */
  private migrateOperationCheck(): void {
    const row = this.db.getFirstSync<{ sql: string }>(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'wal_entries'`
    );

    // If the current schema already allows the newest ops, nothing to do.
    if (!row?.sql || row.sql.includes('program_day_item_insert')) {
      return;
    }

    this.db.execSync(`
      PRAGMA foreign_keys = OFF;
      BEGIN TRANSACTION;

      ALTER TABLE wal_entries RENAME TO wal_entries_old;

      CREATE TABLE wal_entries (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL CHECK (operation IN ('session_start', 'set_log', 'set_edit', 'set_delete', 'session_complete', 'session_update', 'session_soft_delete', 'program_day_item_insert', 'program_day_item_update', 'program_day_item_delete', 'program_archive', 'program_hide', 'program_purge')),
        payload TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        session_id TEXT,
        exercise_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'syncing', 'synced', 'failed')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        client_timestamp TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        synced_at TEXT
      );

      INSERT INTO wal_entries
        SELECT id, operation, payload, table_name, record_id, session_id, exercise_id,
               status, attempt_count, client_timestamp, created_at, synced_at
        FROM wal_entries_old;

      DROP TABLE wal_entries_old;

      CREATE INDEX IF NOT EXISTS idx_wal_status ON wal_entries(status);
      CREATE INDEX IF NOT EXISTS idx_wal_created ON wal_entries(created_at);
      CREATE INDEX IF NOT EXISTS idx_wal_session_id ON wal_entries(session_id);

      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }

  /**
   * Load existing session_start entries to populate the known sessions registry.
   */
  private hydrateKnownSessions(): void {
    const rows = this.db.getAllSync<{ record_id: string }>(
      `SELECT record_id FROM wal_entries WHERE operation = 'session_start' AND status IN ('pending', 'syncing', 'synced')`
    );
    for (const row of rows) {
      this.knownSessionIds.add(row.record_id);
    }
  }

  /**
   * Register a session ID as known (e.g., from server-synced sessions).
   * This allows referential integrity checks to pass for sessions
   * that exist on the server but not in the local WAL.
   */
  registerKnownSession(sessionId: string): void {
    this.knownSessionIds.add(sessionId);
  }

  /**
   * Register multiple session IDs as known.
   */
  registerKnownSessions(sessionIds: string[]): void {
    for (const id of sessionIds) {
      this.knownSessionIds.add(id);
    }
  }

  /**
   * Check if a session ID is known (either in WAL or registered externally).
   */
  isSessionKnown(sessionId: string): boolean {
    // Check the in-memory registry first (fast path)
    if (this.knownSessionIds.has(sessionId)) {
      return true;
    }

    // Check WAL entries for a session_start with this record_id
    const row = this.db.getFirstSync<{ id: string }>(
      `SELECT id FROM wal_entries WHERE operation = 'session_start' AND record_id = ? AND status IN ('pending', 'syncing', 'synced') LIMIT 1`,
      [sessionId]
    );

    if (row) {
      this.knownSessionIds.add(sessionId);
      return true;
    }

    return false;
  }

  /**
   * Validate referential integrity before enqueuing an entry.
   * For set_log, set_edit, set_delete operations, the referenced session_id
   * must exist either in the WAL as a session_start entry or in the known sessions registry.
   */
  private validateReferentialIntegrity(input: EnqueueInput): void {
    const operationsRequiringSession: WALOperation[] = ['set_log', 'set_edit', 'set_delete'];

    if (operationsRequiringSession.includes(input.operation)) {
      if (!input.session_id) {
        throw new ReferentialIntegrityError(
          `Operation '${input.operation}' requires a session_id but none was provided`
        );
      }

      if (!this.isSessionKnown(input.session_id)) {
        throw new ReferentialIntegrityError(
          `Referential integrity violation: session_id '${input.session_id}' does not exist. ` +
            `A 'session_start' entry must be enqueued or the session must be registered before logging sets.`
        );
      }
    }

    // Program lifecycle ops target a `programs` row by record_id. They carry no
    // session/exercise FK, but the target program id is required so the sync
    // engine can address the row on replay.
    const programOperations: WALOperation[] = [
      'program_archive',
      'program_hide',
      'program_purge',
    ];

    if (programOperations.includes(input.operation)) {
      if (!input.record_id || input.record_id.trim() === '') {
        throw new ReferentialIntegrityError(
          `Operation '${input.operation}' requires a program record_id but none was provided`
        );
      }

      if (input.table_name !== 'programs') {
        throw new ReferentialIntegrityError(
          `Operation '${input.operation}' must target the 'programs' table (got '${input.table_name}')`
        );
      }
    }

    // Session edit/delete ops target a `sessions` row by record_id. The
    // session must already be known (same requirement as set_log/set_edit/
    // set_delete) so the sync engine can address a real row on replay.
    const sessionEditOperations: WALOperation[] = ['session_update', 'session_soft_delete'];

    if (sessionEditOperations.includes(input.operation)) {
      if (!input.record_id || input.record_id.trim() === '') {
        throw new ReferentialIntegrityError(
          `Operation '${input.operation}' requires a session record_id but none was provided`
        );
      }

      if (input.table_name !== 'sessions') {
        throw new ReferentialIntegrityError(
          `Operation '${input.operation}' must target the 'sessions' table (got '${input.table_name}')`
        );
      }

      if (!this.isSessionKnown(input.record_id)) {
        throw new ReferentialIntegrityError(
          `Referential integrity violation: session_id '${input.record_id}' does not exist. ` +
            `A 'session_start' entry must be enqueued or the session must be registered first.`
        );
      }
    }

    // Exercise-instance ops target a `program_day_items` row by record_id.
    // For inserts, the caller pre-generates the id client-side (same
    // convention as `session_start`) so the sync engine can address the
    // exact row on replay; there is no "known instance ids" registry since
    // instances are always created/edited/removed against an
    // already-synced program.
    const programDayItemOperations: WALOperation[] = [
      'program_day_item_insert',
      'program_day_item_update',
      'program_day_item_delete',
    ];

    if (programDayItemOperations.includes(input.operation)) {
      if (input.table_name !== 'program_day_items') {
        throw new ReferentialIntegrityError(
          `Operation '${input.operation}' must target the 'program_day_items' table (got '${input.table_name}')`
        );
      }

      if (!input.record_id || input.record_id.trim() === '') {
        throw new ReferentialIntegrityError(
          `Operation '${input.operation}' requires a program_day_items record_id but none was provided`
        );
      }
    }
  }

  /**
   * Enqueue a new WAL entry.
   *
   * Generates a UUID for the entry, validates referential integrity,
   * and inserts into wal_entries with status 'pending'.
   *
   * @returns The generated entry ID
   * @throws ReferentialIntegrityError if foreign key validation fails
   */
  enqueue(input: EnqueueInput): string {
    // Validate referential integrity
    this.validateReferentialIntegrity(input);

    const id = randomUUID();
    const clientTimestamp = input.client_timestamp || new Date().toISOString();
    const payload = JSON.stringify(input.payload);

    this.db.runSync(
      `INSERT INTO wal_entries (id, operation, payload, table_name, record_id, session_id, exercise_id, status, attempt_count, client_timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
      [
        id,
        input.operation,
        payload,
        input.table_name,
        input.record_id,
        input.session_id ?? null,
        input.exercise_id ?? null,
        clientTimestamp,
      ]
    );

    // If this is a session_start, register the session ID for future integrity checks
    if (input.operation === 'session_start') {
      this.knownSessionIds.add(input.record_id);
    }

    return id;
  }

  /**
   * Mark entries as 'syncing'. Used by the Sync Engine before transmitting.
   */
  markSyncing(ids: string[]): void {
    if (ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(',');
    this.db.runSync(
      `UPDATE wal_entries SET status = 'syncing' WHERE id IN (${placeholders}) AND status = 'pending'`,
      ids
    );
  }

  /**
   * Mark entries as 'synced'. Sets synced_at timestamp.
   */
  markSynced(ids: string[]): void {
    if (ids.length === 0) return;

    const now = new Date().toISOString();
    const placeholders = ids.map(() => '?').join(',');
    this.db.runSync(
      `UPDATE wal_entries SET status = 'synced', synced_at = ? WHERE id IN (${placeholders}) AND status = 'syncing'`,
      [now, ...ids]
    );
  }

  /**
   * Mark entries as 'failed'. Increments attempt_count.
   */
  markFailed(ids: string[]): void {
    if (ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(',');
    this.db.runSync(
      `UPDATE wal_entries SET status = 'failed', attempt_count = attempt_count + 1 WHERE id IN (${placeholders}) AND status = 'syncing'`,
      ids
    );
  }

  /**
   * Get pending entries ordered by creation time.
   * Used by the Sync Engine to dequeue entries for transmission.
   */
  getPending(limit?: number): WALEntry[] {
    const sql = limit
      ? `SELECT * FROM wal_entries WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`
      : `SELECT * FROM wal_entries WHERE status = 'pending' ORDER BY created_at ASC`;

    const params = limit ? [limit] : [];
    return this.db.getAllSync<WALEntry>(sql, params);
  }

  /**
   * Get the count of failed entries.
   */
  getFailedCount(): number {
    const row = this.db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM wal_entries WHERE status = 'failed'`
    );
    return row?.count ?? 0;
  }

  /**
   * Reset all failed entries back to 'pending' for retry.
   */
  retryFailed(): void {
    this.db.runSync(
      `UPDATE wal_entries SET status = 'pending' WHERE status = 'failed'`
    );
  }

  /**
   * Get a single entry by ID.
   */
  getEntry(id: string): WALEntry | null {
    return this.db.getFirstSync<WALEntry>(
      `SELECT * FROM wal_entries WHERE id = ?`,
      [id]
    );
  }

  /**
   * Get all entries for a specific session.
   */
  getEntriesForSession(sessionId: string): WALEntry[] {
    return this.db.getAllSync<WALEntry>(
      `SELECT * FROM wal_entries WHERE session_id = ? OR (operation = 'session_start' AND record_id = ?) ORDER BY created_at ASC`,
      [sessionId, sessionId]
    );
  }

  /**
   * Get the count of entries by status.
   */
  getCountByStatus(status: WALStatus): number {
    const row = this.db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM wal_entries WHERE status = ?`,
      [status]
    );
    return row?.count ?? 0;
  }

  /**
   * Clean up synced entries older than the specified number of days.
   * This prevents the local database from growing indefinitely.
   */
  cleanupSynced(olderThanDays: number = 7): number {
    const result = this.db.runSync(
      `DELETE FROM wal_entries WHERE status = 'synced' AND synced_at < datetime('now', ? || ' days')`,
      [`-${olderThanDays}`]
    );
    return result.changes;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let walInstance: WALService | null = null;

/**
 * Initialize the WAL service. Must be called before using getWAL().
 * Typically called during app startup.
 */
export function initWAL(): WALService {
  if (walInstance) {
    return walInstance;
  }

  if (Platform.OS === 'web') {
    throw new Error('WAL service is not available on web platform. Use Supabase directly.');
  }

  const sqlite = getSQLite();
  const db = sqlite.openDatabaseSync('cadence_wal.db');
  walInstance = new WALService(db);
  walInstance.init();
  return walInstance;
}

/**
 * Get the singleton WAL service instance.
 * @throws Error if initWAL() has not been called
 */
export function getWAL(): WALService {
  if (!walInstance) {
    throw new Error(
      'WAL service not initialized. Call initWAL() during app startup.'
    );
  }
  return walInstance;
}

/**
 * Reset the WAL singleton (for testing purposes).
 */
export function resetWAL(): void {
  walInstance = null;
}
