/**
 * Program screen — Training Programs (Kinetic Obsidian).
 *
 * Shows the active program: a phase header card, an agent prompt banner,
 * library/template actions, and per-day workout cards with exercise rows.
 * Preserves all existing data fetching, refresh, and navigation behavior.
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

import { LastSessionCard } from '@/components/LastSessionCard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/Badge';
import { GhostButton } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { Icon } from '@/components/ui/Icon';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTabBarClearance } from '@/hooks/useTabBarClearance';
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

function formatPrescription(item: ProgramDayItemData): string {
  const parts = [`${item.target_sets}×${item.target_reps}`];
  if (item.target_weight) parts.push(`${item.target_weight}kg`);
  if (item.target_rpe) parts.push(`RPE ${item.target_rpe}`);
  return parts.join(' • ');
}

export default function ProgramScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const dockClearance = useTabBarClearance();
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
          onPress={() => router.push('/(tabs)/program/saved-programs')}
          accessibilityRole="button"
          accessibilityLabel="View program library"
        >
          <ThemedText type="linkPrimary">View Program Library</ThemedText>
        </Pressable>
        <Pressable
          style={styles.libraryLink}
          onPress={() => router.push('/(tabs)/program/library')}
          accessibilityRole="button"
          accessibilityLabel="Browse exercise library"
        >
          <ThemedText type="linkPrimary">Browse Exercise Library</ThemedText>
        </Pressable>
        <Pressable
          style={[styles.createProgramButton, { backgroundColor: theme.accent }]}
          onPress={() => router.push('/(tabs)/program/edit/new')}
          accessibilityRole="button"
          accessibilityLabel="Create new program"
        >
          <Icon name="add" size={18} color={theme.accentText} />
          <ThemedText style={{ color: theme.accentText, fontWeight: '600' }}>
            Create New Program
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const sortedDays = [...(program.program_days || [])].sort(
    (a, b) => a.day_number - b.day_number
  );
  const totalExercises = sortedDays.reduce(
    (sum, d) => sum + (d.program_day_items?.length || 0),
    0
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: dockClearance },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
      >
        {/* Phase header card */}
        <GlassCard elevation="mid" radius="xl" style={styles.phaseCard}>
          <View style={styles.phaseTagRow}>
            <ThemedText type="labelCaps" style={{ color: theme.accent }}>
              Current Program
            </ThemedText>
            <Badge label="Active" variant="success" dot />
          </View>
          <ThemedText type="headlineLarge" style={styles.phaseTitle}>
            {program.name}
          </ThemedText>

          <View style={styles.phaseStats}>
            <View style={styles.phaseStat}>
              <ThemedText type="dataMetric" style={{ color: theme.accent }}>
                {sortedDays.length}
              </ThemedText>
              <ThemedText type="labelCaps" themeColor="textSecondary">
                Training Days
              </ThemedText>
            </View>
            <View style={[styles.phaseDivider, { backgroundColor: theme.border }]} />
            <View style={styles.phaseStat}>
              <ThemedText type="dataMetric" style={{ color: theme.success }}>
                {totalExercises}
              </ThemedText>
              <ThemedText type="labelCaps" themeColor="textSecondary">
                Exercises
              </ThemedText>
            </View>
          </View>

          <View style={styles.phaseActions}>
            <GhostButton
              label="Program Library"
              icon={<Icon name="library" size={18} color={theme.text} />}
              style={styles.phaseActionBtn}
              onPress={() => router.push('/(tabs)/program/saved-programs')}
            />
            <GhostButton
              label="Templates"
              icon={<Icon name="grid" size={18} color={theme.text} />}
              style={styles.phaseActionBtn}
              onPress={() => router.push('/(tabs)/program/templates')}
            />
          </View>
          <View style={styles.phaseActions}>
            <GhostButton
              label="Exercise Library"
              icon={<Icon name="dumbbell" size={18} color={theme.text} />}
              style={styles.phaseActionBtn}
              onPress={() => router.push('/(tabs)/program/library')}
            />
            <GhostButton
              label="Edit Program"
              icon={<Icon name="edit" size={18} color={theme.text} />}
              style={styles.phaseActionBtn}
              onPress={() => router.push(`/(tabs)/program/edit/${program.id}`)}
            />
          </View>
          <View style={styles.phaseActions}>
            <GhostButton
              label="Create New Program"
              icon={<Icon name="add" size={18} color={theme.text} />}
              style={styles.phaseActionBtn}
              onPress={() => router.push('/(tabs)/program/edit/new')}
            />
          </View>
        </GlassCard>

        {/* Agent prompt banner */}
        <Pressable
          onPress={() => router.push('/(tabs)/chat')}
          accessibilityRole="button"
          accessibilityLabel="Ask the Cadence agent to adapt your program"
        >
          <GlassCard elevation="low" radius="full" style={styles.agentBanner}>
            <View style={[styles.agentIcon, { backgroundColor: theme.accentSoft }]}>
              <Icon name="bot" size={18} color={theme.accent} />
            </View>
            <ThemedText type="bodyMedium" style={styles.agentText} numberOfLines={1}>
              Want to adapt volume?{' '}
              <ThemedText type="labelLarge" style={{ color: theme.text }}>
                Ask Cadence Agent
              </ThemedText>
            </ThemedText>
            <Icon name="arrow-forward" size={18} color={theme.accent} />
          </GlassCard>
        </Pressable>

        {/* Daily workout cards */}
        {sortedDays.map((day, index) => {
          const sortedItems = [...(day.program_day_items || [])].sort(
            (a, b) => a.order_index - b.order_index
          );
          const isFeatured = index === 0;

          return (
            <Pressable
              key={day.id}
              onPress={() => router.push(`/(tabs)/program/${day.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`View Day ${day.day_number}: ${day.name}`}
            >
              <GlassCard elevation="low" active={isFeatured} style={styles.dayCard}>
                <View style={styles.dayHeader}>
                  <View style={styles.dayTitleWrap}>
                    <ThemedText type="headlineSmall" numberOfLines={1}>
                      Day {day.day_number}: {day.name}
                    </ThemedText>
                    <ThemedText type="bodySmall" themeColor="textSecondary">
                      {sortedItems.length} exercise{sortedItems.length !== 1 ? 's' : ''}
                    </ThemedText>
                  </View>
                  {isFeatured ? <Badge label="Ready" variant="success" /> : null}
                </View>

                <View style={styles.exerciseList}>
                  {sortedItems.slice(0, 4).map((item, i) => (
                    <View key={item.id} style={styles.exerciseRow}>
                      <View style={[styles.exerciseNum, { backgroundColor: theme.backgroundHighest }]}>
                        <ThemedText type="labelMedium" style={{ color: theme.accent }}>
                          {i + 1}
                        </ThemedText>
                      </View>
                      <View style={styles.flexMin}>
                        <ThemedText type="titleMedium" numberOfLines={1}>
                          {item.exercises?.name || 'Unknown Exercise'}
                        </ThemedText>
                        <ThemedText type="bodySmall" themeColor="textSecondary">
                          {formatPrescription(item)}
                        </ThemedText>
                      </View>
                    </View>
                  ))}
                  {sortedItems.length > 4 && (
                    <ThemedText type="labelMedium" style={{ color: theme.accent, paddingLeft: 44 }}>
                      +{sortedItems.length - 4} more
                    </ThemedText>
                  )}
                </View>

                <LastSessionCard programDayId={day.id} />
              </GlassCard>
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
    padding: Spacing.three,
    gap: Spacing.three,
  },
  flexMin: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  // Phase card
  phaseCard: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  phaseTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  phaseTitle: {
    marginTop: -Spacing.one,
  },
  phaseStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  phaseStat: {
    gap: 2,
  },
  phaseDivider: {
    width: 1,
    height: 36,
  },
  phaseActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  phaseActionBtn: {
    flex: 1,
  },
  // Agent banner
  agentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.twoHalf,
  },
  agentIcon: {
    width: 32,
    height: 32,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentText: {
    flex: 1,
  },
  // Day cards
  dayCard: {
    padding: Spacing.three,
    gap: Spacing.twoHalf,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dayTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  exerciseList: {
    gap: Spacing.two,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoHalf,
  },
  exerciseNum: {
    width: 28,
    height: 28,
    borderRadius: Radii.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginBottom: Spacing.two,
  },
  emptyText: {
    textAlign: 'center',
  },
  libraryLink: {
    marginTop: Spacing.three,
  },
  createProgramButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.twoHalf,
    borderRadius: Radii.medium,
    minHeight: 48,
  },
});
