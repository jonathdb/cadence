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
import { Spacing } from '@/constants/theme';
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
        <ActivityIndicator size="large" color="#3c87f7" />
      </ThemedView>
    );
  }

  if (!day) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="subtitle" style={styles.errorTitle}>
          Day Not Found
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
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
          <ThemedText style={styles.programLabel}>
            {day.programs?.name || 'Program'}
          </ThemedText>
          <ThemedText type="subtitle" style={styles.dayTitle}>
            Day {day.day_number}: {day.name}
          </ThemedText>
          <ThemedText style={styles.exerciseCount}>
            {sortedItems.length} exercise{sortedItems.length !== 1 ? 's' : ''}
          </ThemedText>
        </View>

        {sortedItems.map((item, index) => (
          <View key={item.id} style={styles.exerciseCard}>
            <View style={styles.exerciseHeader}>
              <View style={styles.orderBadge}>
                <ThemedText style={styles.orderText}>{index + 1}</ThemedText>
              </View>
              <View style={styles.exerciseInfo}>
                <ThemedText style={styles.exerciseName}>
                  {item.exercises?.name || 'Unknown Exercise'}
                </ThemedText>
                {item.exercises?.primary_muscle_group && (
                  <ThemedText style={styles.muscleGroup}>
                    {item.exercises.primary_muscle_group}
                  </ThemedText>
                )}
              </View>
            </View>

            <View style={styles.targetRow}>
              <View style={styles.targetItem}>
                <ThemedText style={styles.targetLabel}>Sets</ThemedText>
                <ThemedText style={styles.targetValue}>{item.target_sets}</ThemedText>
              </View>
              <View style={styles.targetItem}>
                <ThemedText style={styles.targetLabel}>Reps</ThemedText>
                <ThemedText style={styles.targetValue}>{item.target_reps}</ThemedText>
              </View>
              {item.target_weight != null && (
                <View style={styles.targetItem}>
                  <ThemedText style={styles.targetLabel}>Weight</ThemedText>
                  <ThemedText style={styles.targetValue}>{item.target_weight}kg</ThemedText>
                </View>
              )}
              {item.target_rpe != null && (
                <View style={styles.targetItem}>
                  <ThemedText style={styles.targetLabel}>RPE</ThemedText>
                  <ThemedText style={styles.targetValue}>{item.target_rpe}</ThemedText>
                </View>
              )}
            </View>

            {item.timer_config && formatTimerConfig(item.timer_config) && (
              <View style={styles.timerRow}>
                <ThemedText style={styles.timerIcon}>⏱</ThemedText>
                <ThemedText style={styles.timerText}>
                  {formatTimerConfig(item.timer_config)}
                </ThemedText>
              </View>
            )}

            {item.notes && (
              <View style={styles.notesRow}>
                <ThemedText style={styles.notesLabel}>Notes:</ThemedText>
                <ThemedText style={styles.notesText}>{item.notes}</ThemedText>
              </View>
            )}
          </View>
        ))}

        <Pressable
          style={styles.startButton}
          onPress={() => router.push(`/(tabs)/session/${dayId}`)}
          accessibilityRole="button"
          accessibilityLabel={`Start session for Day ${day.day_number}`}
        >
          <ThemedText style={styles.startButtonText}>Start Session</ThemedText>
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
  programLabel: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  dayTitle: {
    fontSize: 22,
  },
  exerciseCount: {
    fontSize: 13,
    color: '#6b7280',
  },
  errorTitle: {
    fontSize: 22,
    marginBottom: Spacing.two,
  },
  exerciseCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
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
    backgroundColor: '#3c87f7',
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
  exerciseName: {
    fontWeight: '700',
    fontSize: 15,
    color: '#1f2937',
  },
  muscleGroup: {
    fontSize: 12,
    color: '#6b7280',
    textTransform: 'capitalize',
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
  targetLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  targetValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingLeft: 36,
    backgroundColor: '#f0f9ff',
    padding: Spacing.two,
    borderRadius: 8,
    marginLeft: 36,
  },
  timerIcon: {
    fontSize: 14,
  },
  timerText: {
    fontSize: 13,
    color: '#0369a1',
    fontWeight: '500',
  },
  notesRow: {
    paddingLeft: 36,
    gap: 2,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  notesText: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  startButton: {
    backgroundColor: '#3c87f7',
    paddingVertical: Spacing.three,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
