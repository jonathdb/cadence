/**
 * Store Integration Provider
 *
 * Wires the Zustand store with external data sources:
 * 1. Initial data hydration: loads active program, recent sessions, and exercises
 *    from Supabase into the store on app start (no redundant requests once cached)
 * 2. NetInfo connectivity listener: triggers Sync Engine flush on reconnect
 * 3. Supabase Realtime subscription: updates store when server-confirmed data changes
 *
 * This provider must be mounted inside AuthProvider (needs user session) and should
 * wrap the main navigation so it's active across all tabs.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.7
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { type RealtimeChannel } from '@supabase/supabase-js';
import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { logError } from '@/lib/error-logger';
import { useAuth } from '@/providers/AuthProvider';
import { initPurchases } from '@/services/purchases';
import { getSyncEngine, initSyncEngine, resetSyncEngine } from '@/services/sync-engine';
import { initWAL } from '@/services/wal';
import { useAiTierStore } from '@/store/ai-tier';
import {
    useCadenceStore,
    type Exercise,
    type Program,
    type ProgramDay,
    type ProgramDayItem,
    type Session
} from '@/store/index';
import { supabase } from '@/utils/supabase';

// ─── Data Fetching Helpers ───────────────────────────────────────────────────

/**
 * Fetch the user's active program with full structure (days + items).
 */
async function fetchActiveProgram(userId: string): Promise<Program | null> {
  const { data: program, error } = await supabase
    .from('programs')
    .select('id, name, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !program) return null;

  const { data: days } = await supabase
    .from('program_days')
    .select('id, name, day_number')
    .eq('program_id', program.id)
    .order('day_number', { ascending: true });

  const programDays: ProgramDay[] = [];

  if (days && days.length > 0) {
    const dayIds = days.map((d) => d.id);
    const { data: items } = await supabase
      .from('program_day_items')
      .select('id, program_day_id, exercise_id, order_index, target_sets, target_reps, target_weight, target_rpe, timer_config, notes')
      .in('program_day_id', dayIds)
      .order('order_index', { ascending: true });

    for (const day of days) {
      const dayItems: ProgramDayItem[] = (items ?? [])
        .filter((item) => item.program_day_id === day.id)
        .map((item) => ({
          id: item.id,
          exerciseId: item.exercise_id,
          orderIndex: item.order_index,
          targetSets: item.target_sets,
          targetReps: item.target_reps ?? '',
          targetWeight: item.target_weight,
          targetRpe: item.target_rpe,
          timerConfig: item.timer_config as Record<string, unknown> | null,
          notes: item.notes,
        }));

      programDays.push({
        id: day.id,
        name: day.name ?? `Day ${day.day_number}`,
        dayNumber: day.day_number,
        items: dayItems,
      });
    }
  }

  return {
    id: program.id,
    name: program.name,
    status: program.status,
    days: programDays,
  };
}

/**
 * Fetch the most recent 20 sessions with their logged sets.
 */
async function fetchRecentSessions(userId: string): Promise<Session[]> {
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, program_day_id, status, started_at, completed_at')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(20);

  if (error || !sessions || sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);
  const { data: sets } = await supabase
    .from('logged_sets')
    .select('id, exercise_id, session_id, set_number, reps, weight, rpe, notes, is_pr, logged_at')
    .in('session_id', sessionIds)
    .order('set_number', { ascending: true });

  return sessions.map((s) => ({
    id: s.id,
    programDayId: s.program_day_id,
    status: s.status,
    startedAt: s.started_at ?? '',
    completedAt: s.completed_at,
    sets: (sets ?? [])
      .filter((set) => set.session_id === s.id)
      .map((set) => ({
        id: set.id,
        exerciseId: set.exercise_id,
        sessionId: set.session_id,
        setNumber: set.set_number,
        reps: set.reps ?? 0,
        weight: set.weight ?? 0,
        rpe: set.rpe,
        notes: set.notes,
        isPr: set.is_pr,
        loggedAt: set.logged_at ?? '',
      })),
  }));
}

/**
 * Fetch the exercise library (global + user-owned exercises).
 */
async function fetchExercises(userId: string): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, primary_muscle_group, secondary_muscle_groups, instructions, is_global')
    .or(`is_global.eq.true,user_id.eq.${userId}`)
    .order('name', { ascending: true });

  if (error || !data) return [];

  return data.map((e) => ({
    id: e.id,
    name: e.name,
    primaryMuscleGroup: e.primary_muscle_group,
    secondaryMuscleGroups: e.secondary_muscle_groups as string[] | null,
    instructions: e.instructions,
    isGlobal: e.is_global ?? false,
  }));
}

// ─── Provider Component ──────────────────────────────────────────────────────

export function StoreIntegrationProvider({ children }: { children: React.ReactNode }) {
  const { session, user } = useAuth();
  const userId = user?.id ?? null;

  // Track whether initial data has been loaded for the current user
  const dataLoadedRef = useRef<string | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const netInfoUnsubscribeRef = useRef<(() => void) | null>(null);

  // ── Initial Data Hydration ─────────────────────────────────────────────────
  useEffect(() => {
    if (!userId || !session) {
      // User logged out — clear store
      useCadenceStore.getState().setActiveProgram(null);
      useCadenceStore.getState().setRecentSessions([]);
      useCadenceStore.getState().setExercises([]);
      dataLoadedRef.current = null;
      return;
    }

    // Don't re-fetch if we already loaded for this user
    if (dataLoadedRef.current === userId) return;

    const loadData = async () => {
      const [activeProgram, recentSessions, exercises] = await Promise.all([
        fetchActiveProgram(userId),
        fetchRecentSessions(userId),
        fetchExercises(userId),
      ]);

      useCadenceStore.getState().setActiveProgram(activeProgram);
      useCadenceStore.getState().setRecentSessions(recentSessions);
      useCadenceStore.getState().setExercises(exercises);

      dataLoadedRef.current = userId;
    };

    void loadData();
  }, [userId, session]);

  // ── RevenueCat + AI Tier Initialization ────────────────────────────────────
  useEffect(() => {
    if (!userId || !session) return;

    // Initialize RevenueCat SDK (native only, no-op on web)
    void initPurchases(userId);

    // Fetch AI tier info for the store
    void useAiTierStore.getState().fetchTierInfo(userId);
  }, [userId, session]);

  // ── Sync Engine Initialization & NetInfo Connectivity Listener ─────────────
  useEffect(() => {
    // Sync Engine requires expo-sqlite (WAL) — skip on web
    if (Platform.OS === 'web') return;

    if (!userId || !session) {
      // Cleanup sync engine and NetInfo listener when signed out
      if (netInfoUnsubscribeRef.current) {
        netInfoUnsubscribeRef.current();
        netInfoUnsubscribeRef.current = null;
      }
      resetSyncEngine();
      return;
    }

    // Initialize WAL first (sync engine depends on it), then sync engine
    try {
      initWAL();
    } catch (err) {
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { componentStack: '' } as React.ErrorInfo,
        'StoreIntegrationProvider:initWAL'
      );
      return; // Skip sync engine init — degrade gracefully
    }
    initSyncEngine();

    // Subscribe to NetInfo changes to trigger flush on reconnect
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const isConnected = state.isConnected ?? false;
      try {
        const syncEngine = getSyncEngine();
        syncEngine.onConnectivityChange(isConnected);
      } catch {
        // Sync engine not yet initialized — ignore
      }
    });

    netInfoUnsubscribeRef.current = unsubscribe;

    return () => {
      if (netInfoUnsubscribeRef.current) {
        netInfoUnsubscribeRef.current();
        netInfoUnsubscribeRef.current = null;
      }
    };
  }, [userId, session]);

  // ── Supabase Realtime Subscription ─────────────────────────────────────────
  useEffect(() => {
    if (!userId || !session) {
      // Cleanup realtime channel when signed out
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      return;
    }

    // Subscribe to postgres_changes for tables that affect the store
    const channel = supabase
      .channel(`store-sync-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'programs',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          handleProgramChange(payload, userId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sessions',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          handleSessionChange(payload, userId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'logged_sets',
        },
        (payload) => {
          handleLoggedSetChange(payload, userId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'exercises',
          filter: `is_global.eq.true`,
        },
        (payload) => {
          handleExerciseChange(payload, userId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'exercises',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          handleExerciseChange(payload, userId);
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [userId, session]);

  return <>{children}</>;
}

// ─── Realtime Change Handlers ────────────────────────────────────────────────

/**
 * Handle program table changes.
 * Re-fetches the active program when the user's program data changes on the server.
 * Requirement 11.7: update cache when server-confirmed data differs.
 */
function handleProgramChange(
  payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> },
  userId: string
): void {
  // Re-fetch the entire active program to stay consistent
  void fetchActiveProgram(userId).then((program) => {
    useCadenceStore.getState().setActiveProgram(program);
  });
}

/**
 * Handle session table changes.
 * Re-fetches recent sessions when a session is created, updated, or deleted.
 * Requirement 11.7: update cache when server-confirmed data differs.
 */
function handleSessionChange(
  payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> },
  userId: string
): void {
  void fetchRecentSessions(userId).then((sessions) => {
    useCadenceStore.getState().setRecentSessions(sessions);
  });
}

/**
 * Handle logged_sets table changes.
 * Re-fetches recent sessions (which include sets) to update the store.
 * Requirement 11.7: update cache when server-confirmed data differs.
 */
function handleLoggedSetChange(
  payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> },
  userId: string
): void {
  void fetchRecentSessions(userId).then((sessions) => {
    useCadenceStore.getState().setRecentSessions(sessions);
  });
}

/**
 * Handle exercise table changes.
 * Re-fetches the exercise library when exercises are added, updated, or deleted.
 * Requirement 11.7: update cache when server-confirmed data differs.
 */
function handleExerciseChange(
  payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> },
  userId: string
): void {
  void fetchExercises(userId).then((exercises) => {
    useCadenceStore.getState().setExercises(exercises);
  });
}
