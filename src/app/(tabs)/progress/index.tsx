/**
 * Progress tab — volume and trend visualization dashboard.
 * Shows volume-by-muscle-group chart, weekly volume trend line,
 * and training frequency trend line.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 24.3
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    View
} from 'react-native';


import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChartTableToggle } from '@/components/charts/ChartTableToggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GlassCard } from '@/components/ui/GlassCard';
import { Icon } from '@/components/ui/Icon';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Spacing, TabBarClearance } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { calculateVolumeByMuscleGroup } from '@/services/volume-calculator';
import type { Exercise } from '@/types/exercise';
import type { LoggedSet } from '@/types/session';
import { supabase } from '@/utils/supabase';

import { BarChart } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';

// ─── Types ───────────────────────────────────────────────────────────────────

type TimeWindow = '1w' | '4w' | '12w';

interface WeeklyVolume {
  weekLabel: string;
  volume: number;
}

interface WeeklyFrequency {
  weekLabel: string;
  sessions: number;
}

interface SessionRow {
  id: string;
  started_at: string;
  completed_at: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTimeWindowLabel(window: TimeWindow): string {
  switch (window) {
    case '1w': return '1 Week';
    case '4w': return '4 Weeks';
    case '12w': return '12 Weeks';
  }
}

function getDaysForWindow(window: TimeWindow): number {
  switch (window) {
    case '1w': return 7;
    case '4w': return 28;
    case '12w': return 84;
  }
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M kg`;
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}k kg`;
  return `${Math.round(volume)} kg`;
}

/** Get ISO week start (Monday) for a given date */
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/** Generate week labels within the time window */
function generateWeekLabels(daysBack: number): string[] {
  const labels: string[] = [];
  const now = new Date();
  const weeks = Math.ceil(daysBack / 7);

  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    labels.push(getWeekStart(d));
  }

  return labels;
}

/** Format week label for display (e.g., "Jan 6") */
function formatWeekLabel(isoDate: string): string {
  const d = new Date(isoDate);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('4w');
  const [sets, setSets] = useState<LoggedSet[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [showMuscleTable, setShowMuscleTable] = useState(false);
  const [showVolumeTable, setShowVolumeTable] = useState(false);
  const [showFrequencyTable, setShowFrequencyTable] = useState(false);
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const fetchData = useCallback(async (window: TimeWindow) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }

      const daysBack = getDaysForWindow(window);
      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      // Fetch completed sessions in the time window
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('id, started_at, completed_at')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .gte('started_at', since.toISOString());

      const fetchedSessions = (sessionData ?? []) as SessionRow[];
      setSessions(fetchedSessions);

      const sessionIds = fetchedSessions.map((s) => s.id);

      // Fetch all logged sets for those sessions
      let fetchedSets: LoggedSet[] = [];
      if (sessionIds.length > 0) {
        const { data: setsData } = await supabase
          .from('logged_sets')
          .select('id, session_id, exercise_id, set_number, reps, weight, rpe, notes, is_pr, pr_type, logged_at')
          .in('session_id', sessionIds);

        fetchedSets = (setsData ?? []).map((s: Record<string, unknown>) => ({
          id: s.id as string,
          session_id: s.session_id as string,
          exercise_id: s.exercise_id as string,
          set_number: s.set_number as number,
          reps: s.reps as number,
          weight: s.weight as number,
          rpe: s.rpe as number | undefined,
          notes: s.notes as string | undefined,
          is_pr: (s.is_pr as boolean) ?? false,
          pr_type: s.pr_type as string | undefined,
          logged_at: s.logged_at as string,
        })) as LoggedSet[];
      }
      setSets(fetchedSets);

      // Fetch exercises for muscle group mapping
      const exerciseIds = [...new Set(fetchedSets.map((s) => s.exercise_id))];
      let fetchedExercises: Exercise[] = [];
      if (exerciseIds.length > 0) {
        const { data: exerciseData } = await supabase
          .from('exercises')
          .select('id, user_id, name, primary_muscle_group, secondary_muscle_groups, instructions, is_global')
          .in('id', exerciseIds);

        fetchedExercises = (exerciseData ?? []).map((e: Record<string, unknown>) => ({
          id: e.id as string,
          user_id: e.user_id as string | null,
          name: e.name as string,
          primary_muscle_group: e.primary_muscle_group as string,
          secondary_muscle_groups: (e.secondary_muscle_groups as string[]) ?? [],
          instructions: (e.instructions as string) ?? '',
          is_global: (e.is_global as boolean) ?? false,
        })) as Exercise[];
      }
      setExercises(fetchedExercises);
    } catch (err) {
      console.error('Error fetching progress data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchData(timeWindow);
  }, [fetchData, timeWindow]);

  // ─── Computed Data ───────────────────────────────────────────────────────────

  const daysBack = getDaysForWindow(timeWindow);
  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    return d.toISOString();
  }, [daysBack]);

  // Volume by muscle group
  const volumeByMuscleGroup = useMemo(() => {
    if (sets.length === 0 || exercises.length === 0) return null;
    return calculateVolumeByMuscleGroup(sets, exercises, {
      start: since,
      end: new Date().toISOString(),
    });
  }, [sets, exercises, since]);

  // Weekly volume trend
  const weeklyVolume = useMemo((): WeeklyVolume[] => {
    const weekLabels = generateWeekLabels(daysBack);
    const weekMap = new Map<string, number>();
    weekLabels.forEach((w) => weekMap.set(w, 0));

    for (const set of sets) {
      const weekStart = getWeekStart(new Date(set.logged_at));
      const current = weekMap.get(weekStart) ?? 0;
      weekMap.set(weekStart, current + set.reps * set.weight);
    }

    return weekLabels.map((label) => ({
      weekLabel: label,
      volume: weekMap.get(label) ?? 0,
    }));
  }, [sets, daysBack]);

  // Weekly frequency trend (sessions per week)
  const weeklyFrequency = useMemo((): WeeklyFrequency[] => {
    const weekLabels = generateWeekLabels(daysBack);
    const weekMap = new Map<string, Set<string>>();
    weekLabels.forEach((w) => weekMap.set(w, new Set()));

    for (const session of sessions) {
      const weekStart = getWeekStart(new Date(session.started_at));
      const weekSet = weekMap.get(weekStart);
      if (weekSet) weekSet.add(session.id);
    }

    return weekLabels.map((label) => ({
      weekLabel: label,
      sessions: weekMap.get(label)?.size ?? 0,
    }));
  }, [sessions, daysBack]);

  // ─── Accessible Summaries ────────────────────────────────────────────────────

  const muscleGroupSummary = useMemo(() => {
    if (!volumeByMuscleGroup || volumeByMuscleGroup.muscle_groups.length === 0) {
      return 'No muscle group volume data available for the selected time window.';
    }
    const top = volumeByMuscleGroup.muscle_groups.slice(0, 3);
    return `Volume by muscle group: ${top.map((mg) =>
      `${mg.muscle_group} ${formatVolume(mg.volume)}`
    ).join(', ')}. Total volume: ${formatVolume(volumeByMuscleGroup.total_volume)}.`;
  }, [volumeByMuscleGroup]);

  const volumeTrendSummary = useMemo(() => {
    if (weeklyVolume.length === 0) return 'No weekly volume trend data.';
    const nonZero = weeklyVolume.filter((w) => w.volume > 0);
    if (nonZero.length === 0) return 'No training volume recorded in this period.';
    const latest = nonZero[nonZero.length - 1];
    return `Weekly volume trend: ${nonZero.length} weeks with training. Latest week starting ${formatWeekLabel(latest.weekLabel)}: ${formatVolume(latest.volume)}.`;
  }, [weeklyVolume]);

  const frequencyTrendSummary = useMemo(() => {
    if (weeklyFrequency.length === 0) return 'No frequency trend data.';
    const nonZero = weeklyFrequency.filter((w) => w.sessions > 0);
    if (nonZero.length === 0) return 'No sessions recorded in this period.';
    const avg = nonZero.reduce((sum, w) => sum + w.sessions, 0) / nonZero.length;
    return `Training frequency trend: average ${avg.toFixed(1)} sessions per week over ${nonZero.length} active weeks.`;
  }, [weeklyFrequency]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: TabBarClearance + insets.bottom },
        ]}
      >
        {/* Timeframe selector — Requirement 13.2 */}
        <SegmentedControl<TimeWindow>
          options={[
            { value: '1w', label: getTimeWindowLabel('1w') },
            { value: '4w', label: getTimeWindowLabel('4w') },
            { value: '12w', label: getTimeWindowLabel('12w') },
          ]}
          value={timeWindow}
          onChange={setTimeWindow}
        />

        {/* Volume by muscle group chart — Requirement 13.1 */}
        <GlassCard
          elevation="low"
          radius="xl"
          style={styles.chartCard}
          accessible={true}
          accessibilityLabel={muscleGroupSummary}
          accessibilityRole="image"
        >
          <View style={styles.chartTitleRow}>
            <Icon name="progress" size={18} color={theme.accent} />
            <ThemedText type="headlineSmall">Volume by Muscle Group</ThemedText>
          </View>
          {volumeByMuscleGroup && volumeByMuscleGroup.muscle_groups.length > 0 ? (
            <BarChart
              data={volumeByMuscleGroup.muscle_groups.map((mg) => ({
                label: mg.muscle_group,
                value: mg.volume,
              }))}
              accentColor={theme.accent}
              textColor={theme.textSecondary}
              height={180}
            />
          ) : (
            <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.emptyText}>
              No volume data for this period. Complete workouts to see muscle group breakdown.
            </ThemedText>
          )}
          {/* Accessible text summary */}
          <ThemedText type="bodySmall" themeColor="textTertiary" style={styles.chartSummary}>
            {muscleGroupSummary}
          </ThemedText>

          {/* View as table toggle (Req 24.3) */}
          <ChartTableToggle
            showTable={showMuscleTable}
            onToggle={() => setShowMuscleTable((prev) => !prev)}
            tableTitle="Volume by Muscle Group"
            data={
              volumeByMuscleGroup
                ? volumeByMuscleGroup.muscle_groups.map((mg) => ({
                    label: mg.muscle_group.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                    value: formatVolume(mg.volume),
                  }))
                : []
            }
          />
        </GlassCard>

        {/* Weekly volume trend — Requirement 13.3 */}
        <GlassCard
          elevation="low"
          radius="xl"
          style={styles.chartCard}
          accessible={true}
          accessibilityLabel={volumeTrendSummary}
          accessibilityRole="image"
        >
          <View style={styles.chartTitleRow}>
            <Icon name="insights" size={18} color={theme.accent} />
            <ThemedText type="headlineSmall">Weekly Volume</ThemedText>
          </View>
          {weeklyVolume.some((w) => w.volume > 0) ? (
            <LineChart
              data={weeklyVolume.map((w) => ({
                label: formatWeekLabel(w.weekLabel),
                value: w.volume,
              }))}
              accentColor={theme.accent}
              textColor={theme.textSecondary}
              height={140}
              formatValue={formatVolume}
            />
          ) : (
            <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.emptyText}>
              No weekly volume data yet.
            </ThemedText>
          )}
          <ThemedText type="bodySmall" themeColor="textTertiary" style={styles.chartSummary}>
            {volumeTrendSummary}
          </ThemedText>

          {/* View as table toggle (Req 24.3) */}
          <ChartTableToggle
            showTable={showVolumeTable}
            onToggle={() => setShowVolumeTable((prev) => !prev)}
            tableTitle="Weekly Volume"
            data={weeklyVolume
              .filter((w) => w.volume > 0)
              .map((w) => ({
                label: `Week of ${formatWeekLabel(w.weekLabel)}`,
                value: formatVolume(w.volume),
              }))
            }
          />
        </GlassCard>

        {/* Training frequency trend — Requirement 13.4 */}
        <GlassCard
          elevation="low"
          radius="xl"
          style={styles.chartCard}
          accessible={true}
          accessibilityLabel={frequencyTrendSummary}
          accessibilityRole="image"
        >
          <View style={styles.chartTitleRow}>
            <Icon name="calendar" size={18} color={theme.success} />
            <ThemedText type="headlineSmall">Training Frequency</ThemedText>
          </View>
          {weeklyFrequency.some((w) => w.sessions > 0) ? (
            <LineChart
              data={weeklyFrequency.map((w) => ({
                label: formatWeekLabel(w.weekLabel),
                value: w.sessions,
              }))}
              accentColor={theme.success}
              textColor={theme.textSecondary}
              height={140}
              formatValue={(v) => `${v} sessions`}
            />
          ) : (
            <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.emptyText}>
              No training frequency data yet.
            </ThemedText>
          )}
          <ThemedText type="bodySmall" themeColor="textTertiary" style={styles.chartSummary}>
            {frequencyTrendSummary}
          </ThemedText>

          {/* View as table toggle (Req 24.3) */}
          <ChartTableToggle
            showTable={showFrequencyTable}
            onToggle={() => setShowFrequencyTable((prev) => !prev)}
            tableTitle="Training Frequency"
            data={weeklyFrequency
              .filter((w) => w.sessions > 0)
              .map((w) => ({
                label: `Week of ${formatWeekLabel(w.weekLabel)}`,
                value: `${w.sessions} session${w.sessions !== 1 ? 's' : ''}`,
              }))
            }
          />
        </GlassCard>
      </ScrollView>
    </ThemedView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: Spacing.three, gap: Spacing.three },
  chartCard: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  chartTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  chartSummary: {
    marginTop: Spacing.one,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: Spacing.four,
  },
});
