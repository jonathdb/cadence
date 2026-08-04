/**
 * End-of-session summary screen.
 * Displays total duration, total sets, estimated total volume, and PRs achieved.
 * Hides PR section when no PRs were achieved.
 * Offers journal entry creation option.
 *
 * Requirements: 11.1, 11.2, 22.1
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { calculateSessionVolume } from '@/services/volume-calculator';
import type { LoggedSet, PRType } from '@/types/session';
import { supabase } from '@/utils/supabase';

interface SessionSummaryData {
  totalDurationSeconds: number;
  totalSets: number;
  totalVolume: number;
  prs: PRDisplay[];
}

interface PRDisplay {
  exerciseName: string;
  prType: PRType;
  value: number;
}

/**
 * Format seconds into a human-readable duration string (e.g., "1h 23m" or "45m 12s").
 */
function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Format a PR type into a human-readable label.
 */
function formatPRType(prType: PRType): string {
  switch (prType) {
    case 'weight':
      return 'Best Weight';
    case 'reps_at_weight':
      return 'Best Reps at Weight';
    case 'estimated_1rm':
      return 'Best Est. 1RM';
    default:
      return 'PR';
  }
}

/**
 * Format volume with appropriate units.
 */
function formatVolume(volume: number): string {
  if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}k kg`;
  }
  return `${volume.toLocaleString()} kg`;
}

export default function SessionSummaryScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const [summaryData, setSummaryData] = useState<SessionSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessionSummary = useCallback(async () => {
    if (!sessionId) {
      setError('No session ID provided.');
      setIsLoading(false);
      return;
    }

    try {
      // Fetch the completed session
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, started_at, completed_at, total_duration_seconds')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) {
        setError('Could not load session data.');
        setIsLoading(false);
        return;
      }

      // Calculate total duration
      let totalDurationSeconds = session.total_duration_seconds ?? 0;
      if (!totalDurationSeconds && session.started_at && session.completed_at) {
        const start = new Date(session.started_at).getTime();
        const end = new Date(session.completed_at).getTime();
        totalDurationSeconds = Math.round((end - start) / 1000);
      }

      // Fetch logged sets for this session
      const { data: loggedSets, error: setsError } = await supabase
        .from('logged_sets')
        .select('id, session_id, exercise_id, set_number, reps, weight, rpe, notes, is_pr, pr_type, logged_at')
        .eq('session_id', sessionId)
        .order('logged_at', { ascending: true });

      if (setsError) {
        setError('Could not load session sets.');
        setIsLoading(false);
        return;
      }

      const sets: LoggedSet[] = (loggedSets || []).map((s) => ({
        id: s.id,
        session_id: s.session_id,
        exercise_id: s.exercise_id,
        set_number: s.set_number,
        reps: s.reps,
        weight: s.weight,
        rpe: s.rpe ?? undefined,
        notes: s.notes ?? undefined,
        is_pr: s.is_pr,
        pr_type: s.pr_type as PRType | undefined,
        logged_at: s.logged_at,
      }));

      // Calculate volume using the volume calculator service
      const { total_volume, total_sets } = calculateSessionVolume(sets);

      // Collect PRs and resolve exercise names
      const prSets = sets.filter((s) => s.is_pr && s.pr_type);
      let prs: PRDisplay[] = [];

      if (prSets.length > 0) {
        // Get unique exercise IDs from PR sets
        const exerciseIds = [...new Set(prSets.map((s) => s.exercise_id))];

        const { data: exercises } = await supabase
          .from('exercises')
          .select('id, name')
          .in('id', exerciseIds);

        const exerciseMap = new Map<string, string>();
        (exercises || []).forEach((ex) => exerciseMap.set(ex.id, ex.name));

        prs = prSets.map((s) => ({
          exerciseName: exerciseMap.get(s.exercise_id) || 'Unknown Exercise',
          prType: s.pr_type!,
          value: s.pr_type === 'reps_at_weight' ? s.reps : s.weight,
        }));
      }

      setSummaryData({
        totalDurationSeconds,
        totalSets: total_sets,
        totalVolume: total_volume,
        prs,
      });
    } catch (err) {
      setError('An unexpected error occurred.');
      console.error('Session summary error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSessionSummary();
  }, [fetchSessionSummary]);

  const handleCreateJournal = useCallback(() => {
    // Navigate to chat with a prompt to create a journal entry for this session
    router.push({
      pathname: '/(tabs)/chat',
      params: { action: 'journal_draft', sessionId },
    });
  }, [router, sessionId]);

  const handleDone = useCallback(() => {
    router.replace('/(tabs)/session');
  }, [router]);

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color="#3c87f7" />
        <ThemedText type="small" themeColor="textSecondary">
          Loading summary…
        </ThemedText>
      </ThemedView>
    );
  }

  if (error || !summaryData) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="subtitle" style={styles.title}>
          Summary
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {error || 'No data available.'}
        </ThemedText>
        <Pressable style={styles.doneButton} onPress={handleDone} accessibilityRole="button">
          <ThemedText style={styles.doneButtonText}>Back to Sessions</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const { totalDurationSeconds, totalSets, totalVolume, prs } = summaryData;
  const hasPRs = prs.length > 0;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.title}>
            Session Complete 🎉
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Here's how your workout went.
          </ThemedText>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Duration
            </ThemedText>
            <ThemedText style={styles.statValue}>
              {formatDuration(totalDurationSeconds)}
            </ThemedText>
          </View>

          <View style={styles.statCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Total Sets
            </ThemedText>
            <ThemedText style={styles.statValue}>{totalSets}</ThemedText>
          </View>

          <View style={styles.statCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Est. Volume
            </ThemedText>
            <ThemedText style={styles.statValue}>{formatVolume(totalVolume)}</ThemedText>
          </View>
        </View>

        {/* PRs Section — hidden when no PRs achieved (Requirement 11.2) */}
        {hasPRs && (
          <View style={styles.prSection}>
            <ThemedText style={styles.sectionTitle}>🏆 Personal Records</ThemedText>
            {prs.map((pr, index) => (
              <View key={`${pr.exerciseName}-${pr.prType}-${index}`} style={styles.prRow}>
                <View style={styles.prInfo}>
                  <ThemedText style={styles.prExercise}>{pr.exerciseName}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatPRType(pr.prType)}
                  </ThemedText>
                </View>
                <ThemedText style={styles.prValue}>
                  {pr.prType === 'reps_at_weight' ? `${pr.value} reps` : `${pr.value} kg`}
                </ThemedText>
              </View>
            ))}
          </View>
        )}

        {/* Journal Entry CTA (Requirement 22.1) */}
        <View style={styles.journalSection}>
          <ThemedText style={styles.sectionTitle}>Reflect on your session</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.journalDescription}>
            Create a journal entry to capture your thoughts, how you felt, and what to improve.
          </ThemedText>
          <Pressable
            style={styles.journalButton}
            onPress={handleCreateJournal}
            accessibilityRole="button"
            accessibilityLabel="Create journal entry for this session"
          >
            <ThemedText style={styles.journalButtonText}>Create Journal Entry</ThemedText>
          </Pressable>
        </View>

        {/* Done Button */}
        <Pressable
          style={styles.doneButton}
          onPress={handleDone}
          accessibilityRole="button"
          accessibilityLabel="Return to session list"
        >
          <ThemedText style={styles.doneButtonText}>Done</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  scrollContent: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one,
    alignItems: 'center',
    paddingTop: Spacing.three,
  },
  title: {
    fontSize: 22,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: Spacing.three,
    alignItems: 'center',
    gap: Spacing.one,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  prSection: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  prRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  prInfo: {
    flex: 1,
    gap: 2,
  },
  prExercise: {
    fontSize: 15,
    fontWeight: '600',
  },
  prValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3c87f7',
  },
  journalSection: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  journalDescription: {
    lineHeight: 20,
  },
  journalButton: {
    backgroundColor: '#3c87f7',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  journalButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  doneButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
