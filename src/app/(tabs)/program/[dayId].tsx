/**
 * Program Day detail view — shows all exercises for a specific program day
 * with full details: sets, reps, weight targets, RPE targets, timer configs, notes.
 * Offers option to start a session from this day.
 *
 * Requirements: 5.1, 5.2
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
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

interface ExerciseData {
  name: string;
  primary_muscle_group: string;
}

interface DayItemData {
  id: string;
  order_index: number;
  type: 'exercise' | 'block';
  target_sets: number;
  target_reps: string;
  target_weight: number | null;
  target_rpe: number | null;
  timer_config: Record<string, unknown> | null;
  notes: string | null;
  exercise_id: string | null;
  exercises: ExerciseData | null;
}

interface DayData {
  id: string;
  day_number: number;
  name: string;
  program_day_items: DayItemData[];
  programs: { name: string } | null;
}

function formatTimerConfig(config: Record<string, unknown> | null): string | null {
  if (!config || config.type === 'none') return null;

  const type = config.type as string;

  switch (type) {
    case 'rest':
      return `Rest: ${config.rest_seconds}s`;
    case 'countdown':
      return `Countdown: ${config.work_seconds || config.duration_seconds}s`;
    case 'interval':
      return `Interval: ${config.work_seconds}s work / ${config.rest_seconds}s rest × ${config.rounds} rounds`;
    case 'duration':
      return `Duration: ${config.duration_seconds}s`;
    default:
      return `Timer: ${type}`;
  }
}

export default function ProgramDayDetailScreen() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const [day, setDay] = useState<DayData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDayDetail = useCallback(async () => {
    if (!dayId) return;

    try {
      const { data, error } = await supabase
        .from('program_days')
        .select(`
          id,
          day_number,
          name,
          programs (name),
          program_day_items (
            id,
            order_index,
            type,
            target_sets,
            target_reps,
            target_weight,
            target_rpe,
            timer_config,
            notes,
            exercise_id,
            exercises (name, primary_muscle_group)
          )
        `)
        .eq('id', dayId)
        .single();

      if (error) {
        console.error('Failed to fetch day detail:', error.message);
        return;
      }

      setDay(data as unknown as DayData);
    } catch (err) {
      console.error('Error fetching day detail:', err);
    } finally {
      setIsLoading(false);
    }
  }, [dayId]);

  useEffect(() => {
    fetchDayDetail();
  }, [fetchDayDetail]);

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </ThemedView>
    );
  }

  if (!day) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="headlineMedium" style={styles.errorTitle}>
          Day Not Found
        </ThemedText>
        <ThemedText type="bodyMedium" themeColor="textSecondary">
          This program day could not be loaded.
        </ThemedText>
      </ThemedView>
    );
  }

  const sortedItems = [...(day.program_day_items || [])].sort(
    (a, b) => a.order_index - b.order_index
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <ThemedText style={{ fontSize: 13, color: theme.textSecondary, fontWeight: '500' }}>
            {day.programs?.name || 'Program'}
          </ThemedText>
          <ThemedText type="headlineMedium">
            Day {day.day_number}: {day.name}
          </ThemedText>
          <ThemedText style={{ fontSize: 13, color: theme.textSecondary }}>
            {sortedItems.length} exercise{sortedItems.length !== 1 ? 's' : ''}
          </ThemedText>
        </View>

        {sortedItems.map((item, index) => (
          <Pressable
            key={item.id}
            style={[styles.exerciseCard, { borderColor: theme.border, backgroundColor: theme.backgroundElevated }]}
            onPress={() => {
              if (item.exercise_id) {
                router.push(`/(tabs)/progress/exercise/${item.exercise_id}`);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={`View history for ${item.exercises?.name || 'exercise'}`}
          >
            <View style={styles.exerciseHeader}>
              <View style={[styles.orderBadge, { backgroundColor: theme.accent }]}>
                <ThemedText style={[styles.orderText, { color: theme.accentText }]}>{index + 1}</ThemedText>
              </View>
              <View style={styles.exerciseInfo}>
                <ThemedText style={{ fontWeight: '700', fontSize: 15, color: theme.text }}>
                  {item.exercises?.name || 'Unknown Exercise'}
                </ThemedText>
                {item.exercises?.primary_muscle_group && (
                  <ThemedText style={{ fontSize: 12, color: theme.textSecondary, textTransform: 'capitalize' }}>
                    {item.exercises.primary_muscle_group}
                  </ThemedText>
                )}
              </View>
            </View>

            <View style={styles.targetRow}>
              <View style={styles.targetItem}>
                <ThemedText style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '500', textTransform: 'uppercase' }}>Sets</ThemedText>
                <ThemedText style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{item.target_sets}</ThemedText>
              </View>
              <View style={styles.targetItem}>
                <ThemedText style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '500', textTransform: 'uppercase' }}>Reps</ThemedText>
                <ThemedText style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{item.target_reps}</ThemedText>
              </View>
              {item.target_weight != null && (
                <View style={styles.targetItem}>
                  <ThemedText style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '500', textTransform: 'uppercase' }}>Weight</ThemedText>
                  <ThemedText style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{item.target_weight}kg</ThemedText>
                </View>
              )}
              {item.target_rpe != null && (
                <View style={styles.targetItem}>
                  <ThemedText style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '500', textTransform: 'uppercase' }}>RPE</ThemedText>
                  <ThemedText style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{item.target_rpe}</ThemedText>
                </View>
              )}
            </View>

            {item.timer_config && formatTimerConfig(item.timer_config) && (
              <View style={[styles.timerRow, { backgroundColor: theme.timerBackground, borderColor: theme.timerBorder }]}>
                <ThemedText style={styles.timerIcon}>⏱</ThemedText>
                <ThemedText style={{ fontSize: 13, color: theme.timerText, fontWeight: '500' }}>
                  {formatTimerConfig(item.timer_config)}
                </ThemedText>
              </View>
            )}

            {item.notes && (
              <View style={styles.notesRow}>
                <ThemedText style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary }}>Notes:</ThemedText>
                <ThemedText style={{ fontSize: 13, color: theme.text, lineHeight: 18 }}>{item.notes}</ThemedText>
              </View>
            )}
          </Pressable>
        ))}

        <Pressable
          style={[styles.startButton, { backgroundColor: theme.accent }]}
          onPress={() => router.push(`/(tabs)/session/${dayId}`)}
          accessibilityRole="button"
          accessibilityLabel={`Start session for Day ${day.day_number}`}
        >
          <ThemedText style={[styles.startButtonText, { color: theme.accentText }]}>Start Session</ThemedText>
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
    padding: Spacing.four,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.one,
  },
  errorTitle: {
    marginBottom: Spacing.two,
  },
  exerciseCard: {
    borderWidth: 1,
    borderRadius: Radii.large,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  orderBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  exerciseInfo: {
    flex: 1,
    gap: 2,
  },
  targetRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingLeft: 36,
  },
  targetItem: {
    alignItems: 'center',
    gap: 2,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    padding: Spacing.two,
    borderRadius: Radii.medium,
    marginLeft: 36,
    borderWidth: 1,
  },
  timerIcon: {
    fontSize: 14,
  },
  notesRow: {
    paddingLeft: 36,
    gap: 2,
  },
  startButton: {
    paddingVertical: Spacing.three,
    borderRadius: Radii.large,
    alignItems: 'center',
    marginTop: Spacing.two,
    minHeight: 48,
    justifyContent: 'center',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
