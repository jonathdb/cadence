/**
 * Progress tab — progression dashboard.
 * Shows activity summary (session count, volume trends, frequency).
 * Cadence sessions only — not passively imported health workouts.
 *
 * Requirements: 21.1, 21.2, 21.3
 */
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/utils/supabase';

type TimeWindow = '7d' | '30d' | '90d';

interface ActivitySummary {
  sessionCount: number;
  totalVolume: number;
  sessionsPerWeek: number;
}

function getTimeWindowLabel(window: TimeWindow): string {
  switch (window) {
    case '7d': return 'Last 7 days';
    case '30d': return 'Last 30 days';
    case '90d': return 'Last 90 days';
  }
}

function formatVolume(volume: number): string {
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}k kg`;
  return `${volume.toLocaleString()} kg`;
}

export default function ProgressScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30d');
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const theme = useTheme();

  const fetchData = useCallback(async (window: TimeWindow) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }

      const daysBack = window === '7d' ? 7 : window === '30d' ? 30 : 90;
      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      const { data: sessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .gte('started_at', since.toISOString());

      const sessionCount = sessions?.length ?? 0;
      const sessionIds = (sessions ?? []).map((s) => s.id);

      let totalVolume = 0;
      if (sessionIds.length > 0) {
        const { data: sets } = await supabase
          .from('logged_sets')
          .select('reps, weight')
          .in('session_id', sessionIds);

        totalVolume = (sets ?? []).reduce(
          (sum, s) => sum + (s.reps ?? 0) * (s.weight ?? 0), 0
        );
      }

      const weeks = daysBack / 7;
      const sessionsPerWeek = weeks > 0 ? Math.round((sessionCount / weeks) * 10) / 10 : 0;

      setSummary({ sessionCount, totalVolume, sessionsPerWeek });
    } catch (err) {
      console.error('Error fetching progress:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchData(timeWindow);
  }, [fetchData, timeWindow]);

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedText type="headlineMedium">Progress</ThemedText>

        {/* Time window selector */}
        <View style={styles.timeRow}>
          {(['7d', '30d', '90d'] as TimeWindow[]).map((w) => (
            <Pressable
              key={w}
              style={[styles.timeButton, { backgroundColor: timeWindow === w ? theme.accent : theme.backgroundElement }]}
              onPress={() => setTimeWindow(w)}
            >
              <ThemedText style={{ fontSize: 13, fontWeight: '600', color: timeWindow === w ? '#fff' : theme.text }}>
                {getTimeWindowLabel(w)}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {/* Activity summary */}
        {summary ? (
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="monoMedium">{summary.sessionCount}</ThemedText>
              <ThemedText type="bodySmall" themeColor="textSecondary">Sessions</ThemedText>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="monoMedium">{formatVolume(summary.totalVolume)}</ThemedText>
              <ThemedText type="bodySmall" themeColor="textSecondary">Volume</ThemedText>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="monoMedium">{summary.sessionsPerWeek}</ThemedText>
              <ThemedText type="bodySmall" themeColor="textSecondary">/week</ThemedText>
            </View>
          </View>
        ) : (
          <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.emptyText}>
            No sessions logged yet. Complete a workout to see your progress.
          </ThemedText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: Spacing.four, gap: Spacing.four },
  timeRow: { flexDirection: 'row', gap: Spacing.two },
  timeButton: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: Radii.medium,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  statsRow: { flexDirection: 'row', gap: Spacing.two },
  statCard: {
    flex: 1,
    borderRadius: Radii.large,
    padding: Spacing.three,
    alignItems: 'center',
    gap: Spacing.one,
  },
  emptyText: { textAlign: 'center' },
});
