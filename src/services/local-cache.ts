/**
 * Local SQLite Cache Service for Offline Browsing
 *
 * Provides a local cache layer using expo-sqlite for offline access to:
 * - Active program structure (days, exercises, timer configs)
 * - Most recent 100 chat messages
 * - Session history with logged sets for progress viewing
 * - Exercise library
 *
 * Uses a separate database (cadence_cache.db) from the WAL (cadence_wal.db)
 * and the store persistence (cadence_store.db).
 *
 * Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4
 */
import * as SQLite from 'expo-sqlite';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProgramData {
  id: string;
  name: string;
  status: string;
  days: ProgramDayData[];
}

export interface ProgramDayData {
  id: string;
  name: string;
  dayNumber: number;
  items: ProgramDayItemData[];
}

export interface ProgramDayItemData {
  id: string;
  exerciseId: string | null;
  orderIndex: number;
  targetSets: number;
  targetReps: string;
  targetWeight: number | null;
  targetRpe: number | null;
  timerConfig: Record<string, unknown> | null;
  notes: string | null;
}

export interface ChatMessage {
  id: string;
  userId: string;
  role: string;
  content: string;
  toolCalls: Record<string, unknown>[] | null;
  createdAt: string;
}

export interface SessionData {
  id: string;
  programDayId: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  sets: LoggedSetData[];
}

export interface LoggedSetData {
  id: string;
  exerciseId: string;
  sessionId: string;
  setNumber: number;
  reps: number;
  weight: number;
  rpe: number | null;
  notes: string | null;
  isPr: boolean | null;
  loggedAt: string;
}

export interface ExerciseData {
  id: string;
  name: string;
  primaryMuscleGroup: string;
  secondaryMuscleGroups: string[] | null;
  instructions: string | null;
  isGlobal: boolean;
  userId: string | null;
}

// ─── Max Cache Size ──────────────────────────────────────────────────────────

const MAX_CACHED_MESSAGES = 100;

// ─── Local Cache Service ─────────────────────────────────────────────────────

export class LocalCacheService {
  private db: SQLite.SQLiteDatabase;

  constructor(db: SQLite.SQLiteDatabase) {
    this.db = db;
  }

  /**
   * Initialize the cache database schema.
   * Creates all cache tables and indexes if they don't exist.
   */
  init(): void {
    this.db.execSync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS cached_programs (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cached_chat_messages (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_calls TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cached_chat_created
        ON cached_chat_messages(created_at DESC);

      CREATE TABLE IF NOT EXISTS cached_sessions (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cached_sessions_updated
        ON cached_sessions(updated_at DESC);

      CREATE TABLE IF NOT EXISTS cached_exercises (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  // ─── Program Cache ───────────────────────────────────────────────────────

  /**
   * Cache the active program structure (days, exercises, timer configs).
   * Serializes the full program data as JSON.
   */
  cacheActiveProgram(program: ProgramData): void {
    const now = new Date().toISOString();
    const data = JSON.stringify(program);

    this.db.runSync(
      `INSERT OR REPLACE INTO cached_programs (id, data, updated_at) VALUES (?, ?, ?)`,
      [program.id, data, now]
    );
  }

  /**
   * Retrieve a cached program by ID.
   * Returns null if not found in cache.
   */
  getCachedProgram(programId: string): ProgramData | null {
    const row = this.db.getFirstSync<{ data: string }>(
      `SELECT data FROM cached_programs WHERE id = ?`,
      [programId]
    );

    if (!row) return null;

    try {
      return JSON.parse(row.data) as ProgramData;
    } catch {
      return null;
    }
  }

  /**
   * Remove a stale program from the cache.
   */
  invalidateProgram(programId: string): void {
    this.db.runSync(
      `DELETE FROM cached_programs WHERE id = ?`,
      [programId]
    );
  }

  // ─── Chat Messages Cache ─────────────────────────────────────────────────

  /**
   * Cache chat messages, maintaining a maximum of 100 messages.
   * Uses INSERT OR REPLACE to update existing messages and prunes excess.
   */
  cacheMessages(messages: ChatMessage[]): void {
    if (messages.length === 0) return;

    for (const msg of messages) {
      const toolCalls = msg.toolCalls ? JSON.stringify(msg.toolCalls) : null;

      this.db.runSync(
        `INSERT OR REPLACE INTO cached_chat_messages (id, user_id, role, content, tool_calls, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [msg.id, msg.userId, msg.role, msg.content, toolCalls, msg.createdAt]
      );
    }

    // Prune to keep only the most recent MAX_CACHED_MESSAGES
    this.db.runSync(
      `DELETE FROM cached_chat_messages WHERE id NOT IN (
        SELECT id FROM cached_chat_messages ORDER BY created_at DESC LIMIT ?
      )`,
      [MAX_CACHED_MESSAGES]
    );
  }

  /**
   * Retrieve all cached chat messages, ordered by creation time ascending.
   */
  getCachedMessages(): ChatMessage[] {
    const rows = this.db.getAllSync<{
      id: string;
      user_id: string;
      role: string;
      content: string;
      tool_calls: string | null;
      created_at: string;
    }>(
      `SELECT id, user_id, role, content, tool_calls, created_at
       FROM cached_chat_messages
       ORDER BY created_at ASC`
    );

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      role: row.role,
      content: row.content,
      toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : null,
      createdAt: row.created_at,
    }));
  }

  // ─── Sessions Cache ──────────────────────────────────────────────────────

  /**
   * Cache session data (with embedded logged sets as JSON).
   */
  cacheSessions(sessions: SessionData[]): void {
    if (sessions.length === 0) return;

    for (const session of sessions) {
      const data = JSON.stringify(session);
      const updatedAt = session.completedAt || session.startedAt;

      this.db.runSync(
        `INSERT OR REPLACE INTO cached_sessions (id, data, updated_at) VALUES (?, ?, ?)`,
        [session.id, data, updatedAt]
      );
    }
  }

  /**
   * Retrieve cached sessions, ordered by updated_at descending.
   * Optionally limited to a specified count.
   */
  getCachedSessions(limit?: number): SessionData[] {
    const sql = limit
      ? `SELECT data FROM cached_sessions ORDER BY updated_at DESC LIMIT ?`
      : `SELECT data FROM cached_sessions ORDER BY updated_at DESC`;

    const params = limit ? [limit] : [];
    const rows = this.db.getAllSync<{ data: string }>(sql, params);

    const sessions: SessionData[] = [];
    for (const row of rows) {
      try {
        sessions.push(JSON.parse(row.data) as SessionData);
      } catch {
        // Skip corrupted entries
      }
    }

    return sessions;
  }

  // ─── Exercises Cache ─────────────────────────────────────────────────────

  /**
   * Cache exercises from the exercise library.
   */
  cacheExercises(exercises: ExerciseData[]): void {
    if (exercises.length === 0) return;

    for (const exercise of exercises) {
      const data = JSON.stringify(exercise);
      const now = new Date().toISOString();

      this.db.runSync(
        `INSERT OR REPLACE INTO cached_exercises (id, data, updated_at) VALUES (?, ?, ?)`,
        [exercise.id, data, now]
      );
    }
  }

  /**
   * Retrieve all cached exercises.
   */
  getCachedExercises(): ExerciseData[] {
    const rows = this.db.getAllSync<{ data: string }>(
      `SELECT data FROM cached_exercises ORDER BY updated_at DESC`
    );

    const exercises: ExerciseData[] = [];
    for (const row of rows) {
      try {
        exercises.push(JSON.parse(row.data) as ExerciseData);
      } catch {
        // Skip corrupted entries
      }
    }

    return exercises;
  }

  // ─── Cache Management ────────────────────────────────────────────────────

  /**
   * Clear all cached data across all tables.
   */
  clearAll(): void {
    this.db.execSync(`
      DELETE FROM cached_programs;
      DELETE FROM cached_chat_messages;
      DELETE FROM cached_sessions;
      DELETE FROM cached_exercises;
    `);
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let cacheInstance: LocalCacheService | null = null;

/**
 * Initialize the local cache service. Must be called before using getLocalCache().
 * Typically called during app startup.
 */
export function initLocalCache(): LocalCacheService {
  if (cacheInstance) {
    return cacheInstance;
  }

  const db = SQLite.openDatabaseSync('cadence_cache.db');
  cacheInstance = new LocalCacheService(db);
  cacheInstance.init();
  return cacheInstance;
}

/**
 * Get the singleton local cache service instance.
 * @throws Error if initLocalCache() has not been called
 */
export function getLocalCache(): LocalCacheService {
  if (!cacheInstance) {
    throw new Error(
      'Local cache service not initialized. Call initLocalCache() during app startup.'
    );
  }
  return cacheInstance;
}

/**
 * Reset the local cache singleton (for testing purposes).
 */
export function resetLocalCache(): void {
  cacheInstance = null;
}
