/**
 * Program screen — displays the user's active program overview.
 * Shows all days with exercises, targets. Links to day detail and library.
 * Supports pull-to-refresh and handles "No active program" state.
 *
 * Requirements: 1.2, 4.3, 5.1, 5.2
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/utils/supabase';

interface ProgramDayItemData {
  id: string;
  order_index: number;
  target_sets: number;
  target_reps: string;
  target_weight: number | null;
  target_rpe: number | null;
  timer_config: Record<string, unknown> | null;
  notes: string | null;
  exercises: { name: string } | null;
}

interface ProgramDayData {
  id: string;
  day_number: number;
  name: string;
  program_day_items: ProgramDayItemData[];
}

interface ProgramData {
  id: string;
  name: string;
  status: string;
  created_at: string;
  program_days: ProgramDayData[];
}

export default function ProgramScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [program, setProgram] = useState<ProgramData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchActiveProgram = useCallback(async () => {
    if (!session) return;

    try {
      const { data, error } = await supabase
        .from('programs')
        .select(`
          id,
          name,
          status,
          created_at,
          program_days (
            id,
            day_number,
            name,
            program_day_items (
              id,
              order_index,
              target_sets,
              target_reps,
              target_weight,
              target_rpe,
              timer_config,
              notes,
              exercises (name)
            )
          )
        `)
        .eq('user_id', session.user.id)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Failed to fetch program:', error.message);
      }

      setProgram(data as unknown as ProgramData | null);
    } catch (err) {
      console.error('Error fetching program:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      fetchActiveProgram();
    }, [fetchActiveProgram])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchActiveProgram();
  }, [fetchActiveProgram]);

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </ThemedView>
    );
  }

  if (!program) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="headlineMedium" style={styles.emptyTitle}>
          No Active Program
        </ThemedText>
        <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.emptyText}>
          Chat with the agent to create a personalized training program.
        </ThemedText>
        <Pressable
          style={styles.libraryLink}
          onPress={() => router.push('/(tabs)/program/library')}
          accessibilityRole="button"
          accessibilityLabel="View program library"
        >
          <ThemedText type="linkPrimary">View Program Library</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const sortedDays = [...(program.program_days || [])].sort(
    (a, b) => a.day_number - b.day_number
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <ThemedText type="headlineMedium" style={styles.programName}>
            {program.name}
          </ThemedText>
          <View style={[styles.badge, { backgroundColor: theme.success }]}>
            <ThemedText style={styles.badgeText}>Active</ThemedText>
          </View>
        </View>

        <Pressable
          style={[styles.libraryButton, { backgroundColor: theme.backgroundElement }]}
          onPress={() => router.push('/(tabs)/program/library')}
          accessibilityRole="button"
          accessibilityLabel="View program library"
        >
          <ThemedText style={[styles.libraryButtonText, { color: theme.accent }]}>Program Library</ThemedText>
        </Pressable>

        {sortedDays.map((day) => {
          const sortedItems = [...(day.program_day_items || [])].sort(
            (a, b) => a.order_index - b.order_index
          );

          return (
            <Pressable
              key={day.id}
              style={[styles.dayCard, { borderColor: theme.border, backgroundColor: theme.backgroundElevated }]}
              onPress={() => router.push(`/(tabs)/program/${day.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`View Day ${day.day_number}: ${day.name}`}
            >
              <View style={styles.dayHeader}>
                <ThemedText style={[styles.dayTitle, { color: theme.text }]}>
                  Day {day.day_number}: {day.name}
                </ThemedText>
                <ThemedText style={{ fontSize: 12, color: theme.textSecondary }}>
                  {sortedItems.length} exercise{sortedItems.length !== 1 ? 's' : ''}
                </ThemedText>
              </View>
              {sortedItems.slice(0, 4).map((item) => (
                <View key={item.id} style={styles.exerciseRow}>
                  <ThemedText style={{ fontWeight: '500', fontSize: 14, color: theme.text }}>
                    {item.exercises?.name || 'Unknown Exercise'}
                  </ThemedText>
                  <ThemedText style={{ fontSize: 13, color: theme.textSecondary }}>
                    {item.target_sets}×{item.target_reps}
                    {item.target_weight ? ` @ ${item.target_weight}kg` : ''}
                    {item.target_rpe ? ` RPE ${item.target_rpe}` : ''}
                  </ThemedText>
                </View>
              ))}
              {sortedItems.length > 4 && (
                <ThemedText style={{ fontSize: 13, color: theme.accent, paddingLeft: Spacing.two, fontWeight: '500' }}>
                  +{sortedItems.length - 4} more
                </ThemedText>
              )}
            </Pressable>
          );
        })}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  programName: {
    flex: 1,
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radii.full,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  libraryButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.medium,
    alignSelf: 'flex-start',
  },
  libraryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  libraryLink: {
    marginTop: Spacing.three,
  },
  dayCard: {
    borderWidth: 1,
    borderRadius: Radii.large,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayTitle: {
    fontWeight: '700',
    fontSize: 16,
  },
  exerciseRow: {
    paddingLeft: Spacing.two,
    gap: 2,
  },
  emptyTitle: {
    marginBottom: Spacing.two,
  },
  emptyText: {
    textAlign: 'center',
  },
});
