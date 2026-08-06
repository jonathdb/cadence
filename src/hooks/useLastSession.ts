/**
 * useLastSession hook
 *
 * Queries the most recent completed session for a given Program_Day ID.
 * Checks the local SQLite cache first, then falls back to Supabase remote.
 *
 * Returns a summary containing: date, total sets, total volume, and PR count.
 * Returns null if no completed session exists for the given day.
 *
 * Requirements: 17.1, 17.2
 */
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/providers/AuthProvider';
import { getLocalCache } from '@/services/local-cache';
import { useCadenceStore } from '@/store/index';
import { supabase } from '@/utils/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LastSessionSummary {
  /** ISO date string of session completion */
  date: string;
  /** Total number of logged sets */
  totalSets: number;
  /** Total volume (sum of reps × weight across all sets) */
  totalVolume: number;
  /** Number of sets marked as personal records */
  prCount: number;
}

interface UseLastSessionResult {
  /** The last session summary, or null if none exists */
  data: LastSessionSummary | null;
  /** Whether the hook is currently loading data */
  isLoading: boolean;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Fetches the most recent completed session for a specific Program_Day.
 * Checks the Zustand store cache first (recentSessions), then the local SQLite
 * cache, and finally Supabase remote as a fallback.
 */
export function useLastSession(programDayId: string): UseLastSessionResult {
  const { session: authSession } = useAuth();
  const recentSessions = useCadenceStore((s) => s.recentSessions);
  const [data, setData] = useState<LastSessionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLastSession = useCallback(async () => {
    setIsLoading(true);

    // 1. Check Zustand store cache (recent sessions)
    const cachedSession = recentSessions
      .filter((s) => s.programDayId === programDayId && s.status === 'completed')
      .sort((a, b) => {
        const dateA = a.completedAt || a.startedAt;
        const dateB = b.completedAt || b.startedAt;
        return dateB.localeCompare(dateA);
      })[0];

    if (cachedSession) {
      setData(buildSummary(cachedSession.completedAt || cachedSession.startedAt, cachedSession.sets));
      setIsLoading(false);
      return;
    }

    // 2. Check local SQLite cache
    try {
      const cache = getLocalCache();
      const cachedSessions = cache.getCachedSessions();
      const localMatch = cachedSessions
        .filter((s) => s.programDayId === programDayId && s.status === 'completed')
        .sort((a, b) => {
          const dateA = a.completedAt || a.startedAt;
          const dateB = b.completedAt || b.startedAt;
          return dateB.localeCompare(dateA);
        })[0];

      if (localMatch) {
        setData(buildSummary(localMatch.completedAt || localMatch.startedAt, localMatch.sets));
        setIsLoading(false);
        return;
      }
    } catch {
      // Local cache not initialized — continue to remote
    }

    // 3. Fetch from Supabase remote
    if (!authSession) {
      setData(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data: sessionData, error } = await supabase
        .from('sessions')
        .select('id, completed_at, started_at')
        .eq('program_day_id', programDayId)
        .eq('user_id', authSession.user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !sessionData) {
        setData(null);
        setIsLoading(false);
        return;
      }

      // Fetch logged sets for this session
      const { data: setsData, error: setsError } = await supabase
        .from('logged_sets')
        .select('reps, weight, is_pr')
        .eq('session_id', sessionData.id);

      if (setsError || !setsData) {
        setData(null);
        setIsLoading(false);
        return;
      }

      const sets = setsData.map((s) => ({
        reps: s.reps,
        weight: s.weight,
        isPr: s.is_pr,
      }));

      setData(buildSummary(
        sessionData.completed_at || sessionData.started_at || new Date().toISOString(),
        sets
      ));
    } catch {
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [programDayId, recentSessions, authSession]);

  useEffect(() => {
    fetchLastSession();
  }, [fetchLastSession]);

  return { data, isLoading };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface SetLike {
  reps: number;
  weight: number;
  isPr?: boolean | null;
  is_pr?: boolean | null;
}

function buildSummary(date: string, sets: SetLike[]): LastSessionSummary {
  const totalSets = sets.length;
  const totalVolume = sets.reduce((sum, s) => sum + s.reps * s.weight, 0);
  const prCount = sets.filter((s) => s.isPr === true || s.is_pr === true).length;

  return {
    date,
    totalSets,
    totalVolume,
    prCount,
  };
}
