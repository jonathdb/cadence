/**
 * Cadence Zustand State Store
 *
 * Global reactive state management with:
 * - persist middleware: hydrates from expo-sqlite on app start
 * - walMiddleware: intercepts mutations and writes WAL entries
 * - Optimistic updates applied within 100ms of user action
 * - Rollback on server rejection (revert to pre-mutation state)
 * - Sync status tracking (pendingSyncCount, failedSyncCount)
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7
 */
import { create, type StateCreator } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { getWAL, type EnqueueInput } from '@/services/wal';

// ─── Domain Types ────────────────────────────────────────────────────────────

export interface Program {
  id: string;
  name: string;
  status: string;
  days: ProgramDay[];
}

export interface ProgramDay {
  id: string;
  name: string;
  dayNumber: number;
  items: ProgramDayItem[];
}

export interface ProgramDayItem {
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

export interface Session {
  id: string;
  programDayId: string | null;
  status: string;
  startedAt: string;
  completedAt?: string | null;
  sets: LoggedSet[];
}

export interface LoggedSet {
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

export interface LoggedSetData {
  reps: number;
  weight: number;
  rpe?: number | null;
  notes?: string | null;
}

export interface Exercise {
  id: string;
  name: string;
  primaryMuscleGroup: string;
  secondaryMuscleGroups: string[] | null;
  instructions: string | null;
  isGlobal: boolean;
}

export interface ActiveSession {
  id: string;
  programDayId: string | null;
  status: string;
  startedAt: string;
  exercises: ActiveSessionExercise[];
}

export interface ActiveSessionExercise {
  exerciseId: string;
  sets: LoggedSet[];
}

// ─── Rollback Snapshot ───────────────────────────────────────────────────────

interface RollbackSnapshot {
  entryId: string;
  stateSlice: Partial<CadenceStoreState>;
  operationDescription: string;
}

// ─── Store State (data only, no actions) ─────────────────────────────────────

export interface CadenceStoreState {
  // Active program cache
  activeProgram: Program | null;

  // Sessions
  recentSessions: Session[]; // last 20
  activeSession: ActiveSession | null;

  // Exercise library cache
  exercises: Exercise[];

  // Sync status
  pendingSyncCount: number;
  failedSyncCount: number;

  // Rollback snapshots (keyed by WAL entry ID)
  _rollbackSnapshots: Map<string, RollbackSnapshot>;
}

// ─── Store Actions ───────────────────────────────────────────────────────────

export interface CadenceStoreActions {
  // Program
  setActiveProgram: (program: Program | null) => void;

  // Sessions
  setRecentSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  startSession: (programDayId: string | null) => string;
  logSet: (sessionId: string, exerciseId: string, data: LoggedSetData) => string;
  editSet: (setId: string, sessionId: string, data: Partial<LoggedSetData>) => void;
  deleteSet: (setId: string, sessionId: string, exerciseId: string) => void;
  completeSession: (sessionId: string) => void;

  // Exercise library
  setExercises: (exercises: Exercise[]) => void;

  // Sync status
  updateSyncStatus: () => void;

  // Rollback
  rollback: (entryId: string) => void;
}

// ─── Combined Store Type ─────────────────────────────────────────────────────

export type CadenceStore = CadenceStoreState & CadenceStoreActions;

// ─── SQLite Storage Adapter for persist middleware ───────────────────────────

let sqliteStorage: StateStorage | null = null;

/**
 * Creates an expo-sqlite backed storage adapter for zustand's persist middleware.
 * This enables hydrating the store from SQLite on app start.
 */
export function createSQLiteStorage(): StateStorage {
  if (sqliteStorage) return sqliteStorage;

  // Lazy import to avoid issues in test environments
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SQLite = require('expo-sqlite') as typeof import('expo-sqlite');
  const db = SQLite.openDatabaseSync('cadence_store.db');

  // Create the key-value store table
  db.execSync(`
    CREATE TABLE IF NOT EXISTS store_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  sqliteStorage = {
    getItem: (name: string): string | null => {
      const row = db.getFirstSync<{ value: string }>(
        'SELECT value FROM store_kv WHERE key = ?',
        [name]
      );
      return row?.value ?? null;
    },
    setItem: (name: string, value: string): void => {
      db.runSync(
        'INSERT OR REPLACE INTO store_kv (key, value) VALUES (?, ?)',
        [name, value]
      );
    },
    removeItem: (name: string): void => {
      db.runSync('DELETE FROM store_kv WHERE key = ?', [name]);
    },
  };

  return sqliteStorage;
}

// ─── WAL Middleware ──────────────────────────────────────────────────────────

/**
 * WAL middleware that intercepts state mutations and writes WAL entries.
 * It wraps the store creator to capture mutations and enqueue them.
 */
type WALMiddleware = <T extends CadenceStore>(
  config: StateCreator<T, [], []>
) => StateCreator<T, [], []>;

const walMiddleware: WALMiddleware = (config) => (set, get, api) => {
  return config(set, get, api);
};

// ─── Helper: Write WAL entry and store rollback snapshot ─────────────────────

function writeWALEntry(
  input: EnqueueInput,
  snapshotSlice: Partial<CadenceStoreState>,
  operationDescription: string,
  get: () => CadenceStore
): string {
  const wal = getWAL();
  const entryId = wal.enqueue(input);

  // Store rollback snapshot
  const snapshots = new Map(get()._rollbackSnapshots);
  snapshots.set(entryId, {
    entryId,
    stateSlice: snapshotSlice,
    operationDescription,
  });

  return entryId;
}

// ─── Store Creator ───────────────────────────────────────────────────────────

const storeCreator: StateCreator<CadenceStore, [], []> = (set, get, api) => ({
  // ── Initial State ──────────────────────────────────────────────────────────

  activeProgram: null,
  recentSessions: [],
  activeSession: null,
  exercises: [],
  pendingSyncCount: 0,
  failedSyncCount: 0,
  _rollbackSnapshots: new Map(),

  // ── Program Actions ────────────────────────────────────────────────────────

  setActiveProgram: (program) => {
    set({ activeProgram: program });
  },

  // ── Session Actions ────────────────────────────────────────────────────────

  setRecentSessions: (sessions) => {
    set({ recentSessions: sessions.slice(0, 20) });
  },

  addSession: (session) => {
    set((state) => ({
      recentSessions: [session, ...state.recentSessions].slice(0, 20),
    }));
  },

  startSession: (programDayId) => {
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Capture pre-mutation state for rollback
    const snapshot: Partial<CadenceStoreState> = {
      activeSession: get().activeSession,
      recentSessions: [...get().recentSessions],
    };

    // Optimistic update: create the active session immediately
    const newSession: ActiveSession = {
      id: sessionId,
      programDayId,
      status: 'in_progress',
      startedAt: now,
      exercises: [],
    };

    const newRecentSession: Session = {
      id: sessionId,
      programDayId,
      status: 'in_progress',
      startedAt: now,
      sets: [],
    };

    set((state) => ({
      activeSession: newSession,
      recentSessions: [newRecentSession, ...state.recentSessions].slice(0, 20),
    }));

    // Write WAL entry
    const entryId = writeWALEntry(
      {
        operation: 'session_start',
        payload: {
          program_day_id: programDayId,
          status: 'in_progress',
          started_at: now,
        },
        table_name: 'sessions',
        record_id: sessionId,
        session_id: null,
        client_timestamp: now,
      },
      snapshot,
      `Start session${programDayId ? ` for day ${programDayId}` : ' (freestyle)'}`,
      get
    );

    // Store the snapshot in state
    set((state) => {
      const snapshots = new Map(state._rollbackSnapshots);
      snapshots.set(entryId, {
        entryId,
        stateSlice: snapshot,
        operationDescription: `Start session${programDayId ? ` for day ${programDayId}` : ' (freestyle)'}`,
      });
      return { _rollbackSnapshots: snapshots };
    });

    // Update sync status
    get().updateSyncStatus();

    return sessionId;
  },

  logSet: (sessionId, exerciseId, data) => {
    const setId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Capture pre-mutation state for rollback
    const snapshot: Partial<CadenceStoreState> = {
      activeSession: get().activeSession
        ? { ...get().activeSession!, exercises: [...get().activeSession!.exercises] }
        : null,
      recentSessions: [...get().recentSessions],
    };

    // Determine set number
    const activeSession = get().activeSession;
    let setNumber = 1;
    if (activeSession) {
      const exerciseEntry = activeSession.exercises.find(
        (e) => e.exerciseId === exerciseId
      );
      if (exerciseEntry) {
        setNumber = exerciseEntry.sets.length + 1;
      }
    }

    const newSet: LoggedSet = {
      id: setId,
      exerciseId,
      sessionId,
      setNumber,
      reps: data.reps,
      weight: data.weight,
      rpe: data.rpe ?? null,
      notes: data.notes ?? null,
      isPr: null,
      loggedAt: now,
    };

    // Optimistic update: add set to active session and recent sessions
    set((state) => {
      const updatedActiveSession = state.activeSession
        ? {
            ...state.activeSession,
            exercises: updateExerciseSets(
              state.activeSession.exercises,
              exerciseId,
              newSet
            ),
          }
        : null;

      const updatedRecentSessions = state.recentSessions.map((s) =>
        s.id === sessionId
          ? { ...s, sets: [...s.sets, newSet] }
          : s
      );

      return {
        activeSession: updatedActiveSession,
        recentSessions: updatedRecentSessions,
      };
    });

    // Write WAL entry
    const entryId = writeWALEntry(
      {
        operation: 'set_log',
        payload: {
          exercise_id: exerciseId,
          set_number: setNumber,
          reps: data.reps,
          weight: data.weight,
          rpe: data.rpe ?? null,
          notes: data.notes ?? null,
          logged_at: now,
        },
        table_name: 'logged_sets',
        record_id: setId,
        session_id: sessionId,
        exercise_id: exerciseId,
        client_timestamp: now,
      },
      snapshot,
      `Log set: ${data.reps} reps × ${data.weight}kg`,
      get
    );

    // Store the snapshot in state
    set((state) => {
      const snapshots = new Map(state._rollbackSnapshots);
      snapshots.set(entryId, {
        entryId,
        stateSlice: snapshot,
        operationDescription: `Log set: ${data.reps} reps × ${data.weight}kg`,
      });
      return { _rollbackSnapshots: snapshots };
    });

    // Update sync status
    get().updateSyncStatus();

    return setId;
  },

  editSet: (setId, sessionId, data) => {
    const now = new Date().toISOString();

    // Capture pre-mutation state for rollback
    const snapshot: Partial<CadenceStoreState> = {
      activeSession: get().activeSession
        ? { ...get().activeSession!, exercises: [...get().activeSession!.exercises] }
        : null,
      recentSessions: [...get().recentSessions],
    };

    // Optimistic update: edit the set in active session and recent sessions
    set((state) => {
      const updatedActiveSession = state.activeSession
        ? {
            ...state.activeSession,
            exercises: state.activeSession.exercises.map((ex) => ({
              ...ex,
              sets: ex.sets.map((s) =>
                s.id === setId
                  ? {
                      ...s,
                      ...(data.reps !== undefined && { reps: data.reps }),
                      ...(data.weight !== undefined && { weight: data.weight }),
                      ...(data.rpe !== undefined && { rpe: data.rpe ?? null }),
                      ...(data.notes !== undefined && { notes: data.notes ?? null }),
                    }
                  : s
              ),
            })),
          }
        : null;

      const updatedRecentSessions = state.recentSessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              sets: s.sets.map((set) =>
                set.id === setId
                  ? {
                      ...set,
                      ...(data.reps !== undefined && { reps: data.reps }),
                      ...(data.weight !== undefined && { weight: data.weight }),
                      ...(data.rpe !== undefined && { rpe: data.rpe ?? null }),
                      ...(data.notes !== undefined && { notes: data.notes ?? null }),
                    }
                  : set
              ),
            }
          : s
      );

      return {
        activeSession: updatedActiveSession,
        recentSessions: updatedRecentSessions,
      };
    });

    // Write WAL entry
    const payload: Record<string, unknown> = {};
    if (data.reps !== undefined) payload.reps = data.reps;
    if (data.weight !== undefined) payload.weight = data.weight;
    if (data.rpe !== undefined) payload.rpe = data.rpe;
    if (data.notes !== undefined) payload.notes = data.notes;

    const entryId = writeWALEntry(
      {
        operation: 'set_edit',
        payload,
        table_name: 'logged_sets',
        record_id: setId,
        session_id: sessionId,
        client_timestamp: now,
      },
      snapshot,
      `Edit set ${setId}`,
      get
    );

    // Store the snapshot in state
    set((state) => {
      const snapshots = new Map(state._rollbackSnapshots);
      snapshots.set(entryId, {
        entryId,
        stateSlice: snapshot,
        operationDescription: `Edit set ${setId}`,
      });
      return { _rollbackSnapshots: snapshots };
    });

    // Update sync status
    get().updateSyncStatus();
  },

  deleteSet: (setId, sessionId, exerciseId) => {
    const now = new Date().toISOString();

    // Capture pre-mutation state for rollback
    const snapshot: Partial<CadenceStoreState> = {
      activeSession: get().activeSession
        ? { ...get().activeSession!, exercises: [...get().activeSession!.exercises] }
        : null,
      recentSessions: [...get().recentSessions],
    };

    // Optimistic update: remove the set and re-number
    set((state) => {
      const updatedActiveSession = state.activeSession
        ? {
            ...state.activeSession,
            exercises: state.activeSession.exercises.map((ex) => {
              if (ex.exerciseId !== exerciseId) return ex;
              const filteredSets = ex.sets
                .filter((s) => s.id !== setId)
                .map((s, idx) => ({ ...s, setNumber: idx + 1 }));
              return { ...ex, sets: filteredSets };
            }),
          }
        : null;

      const updatedRecentSessions = state.recentSessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              sets: s.sets
                .filter((set) => set.id !== setId)
                .map((set, idx, arr) => {
                  // Re-number sets for the affected exercise only
                  if (set.exerciseId === exerciseId) {
                    const exerciseSets = arr.filter((es) => es.exerciseId === exerciseId);
                    const exerciseIdx = exerciseSets.indexOf(set);
                    return { ...set, setNumber: exerciseIdx + 1 };
                  }
                  return set;
                }),
            }
          : s
      );

      return {
        activeSession: updatedActiveSession,
        recentSessions: updatedRecentSessions,
      };
    });

    // Write WAL entry
    const entryId = writeWALEntry(
      {
        operation: 'set_delete',
        payload: { exercise_id: exerciseId },
        table_name: 'logged_sets',
        record_id: setId,
        session_id: sessionId,
        exercise_id: exerciseId,
        client_timestamp: now,
      },
      snapshot,
      `Delete set ${setId}`,
      get
    );

    // Store the snapshot in state
    set((state) => {
      const snapshots = new Map(state._rollbackSnapshots);
      snapshots.set(entryId, {
        entryId,
        stateSlice: snapshot,
        operationDescription: `Delete set ${setId}`,
      });
      return { _rollbackSnapshots: snapshots };
    });

    // Update sync status
    get().updateSyncStatus();
  },

  completeSession: (sessionId) => {
    const now = new Date().toISOString();

    // Capture pre-mutation state for rollback
    const snapshot: Partial<CadenceStoreState> = {
      activeSession: get().activeSession
        ? { ...get().activeSession!, exercises: [...get().activeSession!.exercises] }
        : null,
      recentSessions: [...get().recentSessions],
    };

    // Optimistic update: mark session as completed
    set((state) => {
      const updatedRecentSessions = state.recentSessions.map((s) =>
        s.id === sessionId
          ? { ...s, status: 'completed', completedAt: now }
          : s
      );

      return {
        activeSession: state.activeSession?.id === sessionId ? null : state.activeSession,
        recentSessions: updatedRecentSessions,
      };
    });

    // Write WAL entry
    const entryId = writeWALEntry(
      {
        operation: 'session_complete',
        payload: {
          status: 'completed',
          completed_at: now,
        },
        table_name: 'sessions',
        record_id: sessionId,
        session_id: sessionId,
        client_timestamp: now,
      },
      snapshot,
      `Complete session ${sessionId}`,
      get
    );

    // Store the snapshot in state
    set((state) => {
      const snapshots = new Map(state._rollbackSnapshots);
      snapshots.set(entryId, {
        entryId,
        stateSlice: snapshot,
        operationDescription: `Complete session ${sessionId}`,
      });
      return { _rollbackSnapshots: snapshots };
    });

    // Update sync status
    get().updateSyncStatus();
  },

  // ── Exercise Library ───────────────────────────────────────────────────────

  setExercises: (exercises) => {
    set({ exercises });
  },

  // ── Sync Status ────────────────────────────────────────────────────────────

  updateSyncStatus: () => {
    try {
      const wal = getWAL();
      const pendingCount = wal.getCountByStatus('pending') + wal.getCountByStatus('syncing');
      const failedCount = wal.getCountByStatus('failed');
      set({ pendingSyncCount: pendingCount, failedSyncCount: failedCount });
    } catch {
      // WAL not initialized yet — skip status update
    }
  },

  // ── Rollback ───────────────────────────────────────────────────────────────

  rollback: (entryId) => {
    const state = get();
    const snapshot = state._rollbackSnapshots.get(entryId);

    if (!snapshot) {
      // No snapshot found — nothing to rollback
      return;
    }

    // Revert state to pre-mutation values
    const rollbackUpdate: Partial<CadenceStoreState> = { ...snapshot.stateSlice };

    // Remove the snapshot from the map
    const updatedSnapshots = new Map(state._rollbackSnapshots);
    updatedSnapshots.delete(entryId);
    rollbackUpdate._rollbackSnapshots = updatedSnapshots;

    set(rollbackUpdate as Partial<CadenceStore>);

    // Update sync status after rollback
    get().updateSyncStatus();
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Add a set to the correct exercise entry, creating the exercise entry if needed.
 */
function updateExerciseSets(
  exercises: ActiveSessionExercise[],
  exerciseId: string,
  newSet: LoggedSet
): ActiveSessionExercise[] {
  const existingIndex = exercises.findIndex((e) => e.exerciseId === exerciseId);

  if (existingIndex >= 0) {
    return exercises.map((ex, idx) =>
      idx === existingIndex
        ? { ...ex, sets: [...ex.sets, newSet] }
        : ex
    );
  }

  // Exercise not yet in the session — add it
  return [...exercises, { exerciseId, sets: [newSet] }];
}

// ─── Store Instance ──────────────────────────────────────────────────────────

/**
 * Create the store with persist middleware for SQLite hydration.
 * The persist middleware hydrates from expo-sqlite on app start.
 */
export const useCadenceStore = create<CadenceStore>()(
  persist(
    walMiddleware(storeCreator),
    {
      name: 'cadence-store',
      storage: createJSONStorage(() => createSQLiteStorage()),
      partialize: (state) => ({
        activeProgram: state.activeProgram,
        recentSessions: state.recentSessions,
        activeSession: state.activeSession,
        exercises: state.exercises,
        pendingSyncCount: state.pendingSyncCount,
        failedSyncCount: state.failedSyncCount,
      }),
    }
  )
);

// ─── Non-React Access ────────────────────────────────────────────────────────

/**
 * Get the current store state without React hooks.
 * Useful for services (sync engine, WAL callbacks) that need store access.
 */
export function getStoreState(): CadenceStore {
  return useCadenceStore.getState();
}

/**
 * Subscribe to store changes outside of React.
 * Returns an unsubscribe function.
 */
export function subscribeToStore(
  listener: (state: CadenceStore, prevState: CadenceStore) => void
): () => void {
  return useCadenceStore.subscribe(listener);
}
