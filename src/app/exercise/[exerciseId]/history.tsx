/**
 * Per-Exercise History Screen — shows all logged sets for a given exercise
 * in reverse chronological order, grouped by session date. Includes a weight
 * progression chart and personal record highlighting.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';

import { ChartTableToggle } from '@/components/charts/ChartTableToggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTabBarClearance } from '@/hooks/useTabBarClearance';
import { supabase } from '@/utils/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SetRecord {
  id: string;
  set_number: number;
  reps: number;
  weight: number;
  rpe: number | null;
  notes: string | null;
  is_pr: boolean | null;
  pr_type: string | null;
  logged_at: string | null;
  session_id: string;
}

interface SessionGroup {
  sessionId: string;
  date: string;
  sets: SetRecord[];
}

interface ChartPoint {
  date: string;
  weight: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Simple SVG-style Line Chart (pure RN Views) ─────────────────────────────

interface WeightChartProps {
  points: ChartPoint[];
  accentColor: string;
  bgColor: string;
  textColor: string;
  textSecondary: string;
}

const CHART_HEIGHT = 160;
const CHART_PADDING_LEFT = 44;
const CHART_PADDING_RIGHT = 16;
const CHART_PADDING_TOP = 12;
const CHART_PADDING_BOTTOM = 28;

function WeightProgressionChart({
  points,
  accentColor,
  bgColor,
  textColor,
  textSecondary,
}: WeightChartProps) {
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = screenWidth - Spacing.four * 2 - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;

  if (points.length === 0) {
    return (
      <View
        style={[styles.chartContainer, { backgroundColor: bgColor }]}
        accessibilityLabel="No weight data available for chart"
        accessibilityRole="image"
      >
        <ThemedText type="bodyMedium" style={{ color: textSecondary, textAlign: 'center' }}>
          No data to chart yet
        </ThemedText>
      </View>
    );
  }

  const weights = points.map((p) => p.weight);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const weightRange = maxWeight - minWeight || 1;

  // Generate accessible text summary
  const summaryText = `Weight progression chart. ${points.length} data points from ${formatShortDate(points[0].date)} to ${formatShortDate(points[points.length - 1].date)}. Range: ${minWeight}kg to ${maxWeight}kg.`;

  return (
    <View
      style={[styles.chartContainer, { backgroundColor: bgColor }]}
      accessibilityLabel={summaryText}
      accessibilityRole="image"
    >
      <ThemedText type="labelMedium" style={{ color: textSecondary, marginBottom: Spacing.two }}>
        Weight Progression (kg)
      </ThemedText>

      <View style={styles.chartArea}>
        {/* Y-axis labels */}
        <View style={styles.yAxis}>
          <ThemedText style={[styles.axisLabel, { color: textSecondary }]}>
            {maxWeight.toFixed(1)}
          </ThemedText>
          <ThemedText style={[styles.axisLabel, { color: textSecondary }]}>
            {((maxWeight + minWeight) / 2).toFixed(1)}
          </ThemedText>
          <ThemedText style={[styles.axisLabel, { color: textSecondary }]}>
            {minWeight.toFixed(1)}
          </ThemedText>
        </View>

        {/* Plot area with dots and connecting lines */}
        <View style={[styles.plotArea, { height: plotHeight }]}>
          {/* Horizontal grid lines */}
          {[0, 0.5, 1].map((fraction) => (
            <View
              key={`grid-${fraction}`}
              style={[
                styles.gridLine,
                {
                  top: fraction * plotHeight,
                  backgroundColor: `${textSecondary}22`,
                },
              ]}
            />
          ))}

          {/* Data points and connecting lines */}
          {points.map((point, index) => {
            const x = points.length > 1
              ? (index / (points.length - 1)) * chartWidth
              : chartWidth / 2;
            const y = plotHeight - ((point.weight - minWeight) / weightRange) * plotHeight;

            return (
              <View
                key={`${point.date}-${index}`}
                style={[
                  styles.dataPoint,
                  {
                    left: x - 4,
                    top: y - 4,
                    backgroundColor: accentColor,
                  },
                ]}
              />
            );
          })}

          {/* Connecting line segments rendered as thin views */}
          {points.length > 1 &&
            points.slice(1).map((point, index) => {
              const prevPoint = points[index];
              const x1 = (index / (points.length - 1)) * chartWidth;
              const x2 = ((index + 1) / (points.length - 1)) * chartWidth;
              const y1 = plotHeight - ((prevPoint.weight - minWeight) / weightRange) * plotHeight;
              const y2 = plotHeight - ((point.weight - minWeight) / weightRange) * plotHeight;

              const dx = x2 - x1;
              const dy = y2 - y1;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);

              return (
                <View
                  key={`line-${index}`}
                  style={[
                    styles.lineSegment,
                    {
                      left: x1,
                      top: y1,
                      width: length,
                      backgroundColor: accentColor,
                      transform: [{ rotate: `${angle}deg` }],
                    },
                  ]}
                />
              );
            })}
        </View>
      </View>

      {/* X-axis labels (show first and last) */}
      {points.length > 0 && (
        <View style={styles.xAxis}>
          <ThemedText style={[styles.axisLabel, { color: textSecondary }]}>
            {formatShortDate(points[0].date)}
          </ThemedText>
          {points.length > 1 && (
            <ThemedText style={[styles.axisLabel, { color: textSecondary }]}>
              {formatShortDate(points[points.length - 1].date)}
            </ThemedText>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ExerciseHistoryScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const dockClearance = useTabBarClearance();

  const [exerciseName, setExerciseName] = useState<string>('');
  const [sessionGroups, setSessionGroups] = useState<SessionGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showChartTable, setShowChartTable] = useState(false);

  const fetchExerciseHistory = useCallback(async () => {
    if (!exerciseId) return;

    try {
      // Fetch exercise name
      const { data: exerciseData } = await supabase
        .from('exercises')
        .select('name')
        .eq('id', exerciseId)
        .single();

      if (exerciseData) {
        setExerciseName(exerciseData.name);
      }

      // Fetch all logged sets for this exercise, joined with session dates
      const { data: sets, error } = await supabase
        .from('logged_sets')
        .select(`
          id,
          set_number,
          reps,
          weight,
          rpe,
          notes,
          is_pr,
          pr_type,
          logged_at,
          session_id,
          sessions!inner (
            id,
            started_at,
            status
          )
        `)
        .eq('exercise_id', exerciseId)
        .eq('sessions.status', 'completed')
        .order('logged_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch exercise history:', error.message);
        return;
      }

      // Group sets by session, in reverse chronological order
      const groupMap = new Map<string, SessionGroup>();

      for (const set of (sets ?? []) as any[]) {
        const session = set.sessions;
        const sessionDate = session?.started_at ?? set.logged_at ?? '';
        const sessionId = set.session_id;

        if (!groupMap.has(sessionId)) {
          groupMap.set(sessionId, {
            sessionId,
            date: sessionDate,
            sets: [],
          });
        }

        groupMap.get(sessionId)!.sets.push({
          id: set.id,
          set_number: set.set_number,
          reps: set.reps,
          weight: set.weight,
          rpe: set.rpe,
          notes: set.notes,
          is_pr: set.is_pr,
          pr_type: set.pr_type,
          logged_at: set.logged_at,
          session_id: set.session_id,
        });
      }

      // Sort groups by date descending
      const groups = Array.from(groupMap.values()).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      // Sort sets within each group by set_number
      for (const group of groups) {
        group.sets.sort((a, b) => a.set_number - b.set_number);
      }

      setSessionGroups(groups);
    } catch (err) {
      console.error('Error fetching exercise history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [exerciseId]);

  useEffect(() => {
    fetchExerciseHistory();
  }, [fetchExerciseHistory]);

  // Build chart data: one point per session showing max weight
  const chartPoints = useMemo<ChartPoint[]>(() => {
    // Reverse to chronological order for the chart
    return [...sessionGroups]
      .reverse()
      .map((group) => {
        const maxWeight = Math.max(...group.sets.map((s) => s.weight));
        return {
          date: group.date,
          weight: maxWeight,
        };
      })
      .filter((p) => p.weight > 0);
  }, [sessionGroups]);

  // ─── Loading State ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </ThemedView>
    );
  }

  // ─── Empty State ────────────────────────────────────────────────────────────

  if (sessionGroups.length === 0) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="headlineMedium" style={{ marginBottom: Spacing.two }}>
          {exerciseName || 'Exercise'}
        </ThemedText>
        <ThemedText type="bodyMedium" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          No logged sets yet. Complete a session with this exercise to see your history.
        </ThemedText>
        <Pressable
          style={[styles.backButton, { backgroundColor: theme.backgroundElement }]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ThemedText style={{ color: theme.accent, fontWeight: '600' }}>
            Go Back
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: dockClearance }]}>
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="headlineMedium">{exerciseName}</ThemedText>
          <ThemedText type="bodyMedium" themeColor="textSecondary">
            {sessionGroups.length} session{sessionGroups.length !== 1 ? 's' : ''} logged
          </ThemedText>
        </View>

        {/* Weight Progression Chart */}
        <WeightProgressionChart
          points={chartPoints}
          accentColor={theme.accent}
          bgColor={theme.backgroundElevated}
          textColor={theme.text}
          textSecondary={theme.textSecondary}
        />

        {/* View as table toggle (Req 24.3) */}
        <ChartTableToggle
          showTable={showChartTable}
          onToggle={() => setShowChartTable((prev) => !prev)}
          tableTitle="Weight Progression"
          data={chartPoints.map((p) => ({
            label: formatShortDate(p.date),
            value: `${p.weight} kg`,
          }))}
        />

        {/* Session History Timeline */}
        <View style={styles.historySection}>
          <ThemedText type="headlineSmall" style={{ marginBottom: Spacing.three }}>
            History
          </ThemedText>

          {sessionGroups.map((group) => (
            <View
              key={group.sessionId}
              style={[styles.sessionGroup, { borderColor: theme.border, backgroundColor: theme.backgroundElevated }]}
            >
              {/* Session date header */}
              <View style={[styles.sessionDateHeader, { borderBottomColor: theme.borderSubtle }]}>
                <ThemedText type="labelLarge" style={{ color: theme.text }}>
                  {formatDate(group.date)}
                </ThemedText>
                <ThemedText type="bodySmall" themeColor="textSecondary">
                  {group.sets.length} set{group.sets.length !== 1 ? 's' : ''}
                </ThemedText>
              </View>

              {/* Sets in this session */}
              {group.sets.map((set) => (
                <View
                  key={set.id}
                  style={[
                    styles.setRow,
                    set.is_pr && { backgroundColor: theme.prBackground, borderColor: theme.prBorder, borderWidth: 1 },
                  ]}
                  accessibilityLabel={`Set ${set.set_number}: ${set.weight}kg × ${set.reps} reps${set.rpe ? `, RPE ${set.rpe}` : ''}${set.is_pr ? ', Personal Record' : ''}`}
                >
                  {/* Set number */}
                  <View style={[styles.setNumberBadge, { backgroundColor: set.is_pr ? theme.prBorder : theme.backgroundElement }]}>
                    <ThemedText style={[styles.setNumberText, { color: set.is_pr ? theme.prText : theme.textSecondary }]}>
                      {set.set_number}
                    </ThemedText>
                  </View>

                  {/* Set details */}
                  <View style={styles.setDetails}>
                    <ThemedText style={{ fontSize: 15, fontWeight: '600', color: theme.text }}>
                      {set.weight}kg × {set.reps}
                    </ThemedText>
                    {set.rpe != null && (
                      <ThemedText style={{ fontSize: 12, color: theme.textSecondary }}>
                        RPE {set.rpe}
                      </ThemedText>
                    )}
                  </View>

                  {/* PR badge */}
                  {set.is_pr && (
                    <View style={[styles.prBadge, { backgroundColor: theme.prBackground, borderColor: theme.prBorder }]}>
                      <ThemedText style={[styles.prBadgeText, { color: theme.prText }]}>
                        🏆 PR
                      </ThemedText>
                    </View>
                  )}

                  {/* Notes */}
                  {set.notes && (
                    <ThemedText style={{ fontSize: 11, color: theme.textTertiary, flex: 1 }} numberOfLines={1}>
                      {set.notes}
                    </ThemedText>
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one,
  },
  backButton: {
    marginTop: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.twoHalf,
    borderRadius: Radii.medium,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Chart styles
  chartContainer: {
    borderRadius: Radii.large,
    padding: Spacing.three,
    minHeight: CHART_HEIGHT + 40,
    justifyContent: 'center',
  },
  chartArea: {
    flexDirection: 'row',
    height: CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM,
  },
  yAxis: {
    width: CHART_PADDING_LEFT - 8,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: Spacing.one,
  },
  plotArea: {
    flex: 1,
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  dataPoint: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  lineSegment: {
    position: 'absolute',
    height: 2,
    transformOrigin: 'left center',
  },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: CHART_PADDING_LEFT - 8,
    marginTop: Spacing.one,
  },
  axisLabel: {
    fontSize: 10,
    fontWeight: '500',
  },

  // History styles
  historySection: {
    gap: Spacing.one,
  },
  sessionGroup: {
    borderRadius: Radii.large,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: Spacing.three,
  },
  sessionDateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.twoHalf,
    borderBottomWidth: 1,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.twoHalf,
    borderRadius: Radii.small,
    marginHorizontal: Spacing.two,
    marginVertical: 2,
  },
  setNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  setNumberText: {
    fontSize: 12,
    fontWeight: '700',
  },
  setDetails: {
    flex: 1,
    gap: 2,
  },
  prBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: Radii.full,
    borderWidth: 1,
  },
  prBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
