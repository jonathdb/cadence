/**
 * Session tab — Active Session Hub (Kinetic Obsidian).
 *
 * Preserves all existing behavior: continue an in-progress session, launch
 * Freestyle / Track Route, start a scheduled program day, and browse recent
 * completed sessions. Re-skinned with the Kinetic Obsidian design system.
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/Badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { Icon } from '@/components/ui/Icon';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTabBarClearance } from '@/hooks/useTabBarClearance';
import { useCadenceStore, type Session } from '@/store';
import { supabase } from '@/utils/supabase';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format an ISO date string to a short readable format (e.g., "Mon, Jun 1").
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Calculate duration between two ISO timestamps and format as human-readable string.
 */
function formatDuration(startedAt: string, completedAt?: string | null): string {
  if (!completedAt) return 'In progress';
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const totalSeconds = Math.max(0, Math.round((end - start) / 1000));

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `<1m`;
}

/**
 * Calculate elapsed time from session start to now.
 */
function formatElapsed(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const totalSeconds = Math.max(0, Math.round((now - start) / 1000));

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m elapsed`;
  if (minutes > 0) return `${minutes}m elapsed`;
  return 'Just started';
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProgramDayListItem {
  id: string;
  day_number: number;
  name: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SessionIndexScreen() {
  const router = useRouter();
  const theme = useTheme();
  const dockClearance = useTabBarClearance();

  // Store data
  const activeSession = useCadenceStore((s) => s.activeSession);
  const recentSessions = useCadenceStore((s) => s.recentSessions);
  const activeProgram = useCadenceStore((s) => s.activeProgram);

  // Local state for program days (start new session)
  const [days, setDays] = useState<ProgramDayListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [programName, setProgramName] = useState<string | null>(null);

  // Build a lookup map for program day names from the active program
  const programDayNames = useMemo(() => {
    const map = new Map<string, string>();
    if (activeProgram?.days) {
      for (const day of activeProgram.days) {
        map.set(day.id, day.name);
      }
    }
    return map;
  }, [activeProgram]);

  // Sort sessions by startedAt descending
  const sortedSessions = useMemo(() => {
    return [...recentSessions]
      .filter((s) => s.status === 'completed')
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }, [recentSessions]);

  // Fetch active program days for "Start Session" section
  const fetchActiveProgramDays = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: program, error: programError } = await supabase
        .from('programs')
        .select('id, name')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (programError || !program) {
        setIsLoading(false);
        return;
      }

      setProgramName(program.name);

      const { data: programDays, error: daysError } = await supabase
        .from('program_days')
        .select('id, day_number, name')
        .eq('program_id', program.id)
        .order('day_number', { ascending: true });

      if (daysError) {
        console.error('Failed to fetch program days:', daysError.message);
      } else {
        setDays(programDays || []);
      }
    } catch (err) {
      console.error('Error fetching active program:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveProgramDays();
  }, [fetchActiveProgramDays]);

  // ─── Navigation Handlers ────────────────────────────────────────────────────

  const handleContinueSession = useCallback(() => {
    if (!activeSession) return;
    if (activeSession.programDayId) {
      router.push(`/(tabs)/session/${activeSession.programDayId}`);
    } else {
      // Freestyle session — navigate to the dayId screen with the session ID
      // The [dayId] route handles both program days and active sessions
      router.push(`/(tabs)/session/${activeSession.id}`);
    }
  }, [activeSession, router]);

  const handleSessionTap = useCallback((session: Session) => {
    if (session.status === 'completed') {
      router.push({ pathname: '/(tabs)/session/summary', params: { sessionId: session.id } });
    }
  }, [router]);

  const handleStartDay = useCallback((dayId: string) => {
    router.push(`/(tabs)/session/${dayId}`);
  }, [router]);

  // ─── Render Helpers ─────────────────────────────────────────────────────────

  const getDayName = useCallback((session: Session): string => {
    if (!session.programDayId) return 'Freestyle';
    return programDayNames.get(session.programDayId) || 'Workout';
  }, [programDayNames]);

  const renderSessionItem = useCallback(({ item }: { item: Session }) => {
    const dayName = getDayName(item);
    const date = formatDate(item.startedAt);
    const duration = formatDuration(item.startedAt, item.completedAt);
    const totalSets = item.sets.length;

    return (
      <Pressable
        onPress={() => handleSessionTap(item)}
        accessibilityRole="button"
        accessibilityLabel={`${dayName} session on ${date}, ${duration}, ${totalSets} sets. Tap to view summary.`}
      >
        <GlassCard elevation="low" style={styles.sessionCard}>
          <View style={styles.rowBetween}>
            <View style={styles.flexMin}>
              <ThemedText type="titleMedium">{dayName}</ThemedText>
              <ThemedText type="bodySmall" themeColor="textSecondary">
                {date}
              </ThemedText>
            </View>
            <View style={styles.sessionCardRight}>
              <ThemedText type="labelMedium" themeColor="textSecondary">
                {duration}
              </ThemedText>
              <ThemedText type="labelMedium" style={{ color: theme.accent }}>
                {totalSets} {totalSets === 1 ? 'set' : 'sets'}
              </ThemedText>
            </View>
          </View>
        </GlassCard>
      </Pressable>
    );
  }, [theme, getDayName, handleSessionTap]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </ThemedView>
    );
  }

  const sessionCount = sortedSessions.length;

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={sortedSessions}
        keyExtractor={(item) => item.id}
        renderItem={renderSessionItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: dockClearance },
        ]}
        ListHeaderComponent={
          <View style={styles.headerStack}>
            {/* Phase status hero — driven by the active program when present */}
            {activeProgram ? (
              <GlassCard elevation="mid" radius="xl" style={styles.hero}>
                <View style={styles.rowBetween}>
                  <View style={styles.flexMin}>
                    <View style={styles.heroTagRow}>
                      <Badge label="Active Cycle" variant="success" dot />
                    </View>
                    <ThemedText type="headlineMedium" style={styles.heroTitle}>
                      {activeProgram.name}
                    </ThemedText>
                    {programName ? (
                      <ThemedText type="bodySmall" themeColor="textSecondary" numberOfLines={1}>
                        {programName}
                      </ThemedText>
                    ) : null}
                  </View>
                </View>

                {/* Telemetry micro-bar */}
                <View style={[styles.microBar, { backgroundColor: theme.backgroundElement }]}>
                  <View style={styles.microMetric}>
                    <ThemedText type="labelCaps" themeColor="textSecondary">
                      Scheduled
                    </ThemedText>
                    <ThemedText type="titleMedium" style={{ color: theme.accent }}>
                      {days.length}
                    </ThemedText>
                  </View>
                  <View style={styles.microMetric}>
                    <ThemedText type="labelCaps" themeColor="textSecondary">
                      Logged
                    </ThemedText>
                    <ThemedText type="titleMedium" style={{ color: theme.success }}>
                      {sessionCount}
                    </ThemedText>
                  </View>
                  <View style={styles.microMetric}>
                    <ThemedText type="labelCaps" themeColor="textSecondary">
                      Status
                    </ThemedText>
                    <ThemedText type="titleMedium" style={{ color: theme.tertiary }}>
                      {activeSession ? 'Live' : 'Ready'}
                    </ThemedText>
                  </View>
                </View>
              </GlassCard>
            ) : null}

            {/* Continue Session Card (Req 16.4) */}
            {activeSession && (
              <Pressable
                onPress={handleContinueSession}
                accessibilityRole="button"
                accessibilityLabel={`Continue session: ${activeSession.programDayId ? programDayNames.get(activeSession.programDayId) || 'Workout' : 'Freestyle'}. ${formatElapsed(activeSession.startedAt)}`}
              >
                <GlassCard active elevation="mid" style={styles.continueCard}>
                  <View style={styles.rowBetween}>
                    <View style={styles.flexMin}>
                      <ThemedText type="labelCaps" style={{ color: theme.accent }}>
                        Continue Session
                      </ThemedText>
                      <ThemedText type="headlineSmall">
                        {activeSession.programDayId
                          ? programDayNames.get(activeSession.programDayId) || 'Workout'
                          : 'Freestyle'}
                      </ThemedText>
                      <ThemedText type="bodySmall" themeColor="textSecondary">
                        {formatElapsed(activeSession.startedAt)}
                      </ThemedText>
                    </View>
                    <View style={[styles.continueArrow, { backgroundColor: theme.accent }]}>
                      <Icon name="arrow-forward" size={20} color={theme.accentText} />
                    </View>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {/* Quick Dispatch */}
            {days.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <ThemedText type="labelCaps" themeColor="textSecondary">
                    Quick Dispatch
                  </ThemedText>
                  <Icon name="bolt" size={16} color={theme.textSecondary} />
                </View>

                <DispatchTile
                  icon="dumbbell"
                  iconColor={theme.accent}
                  title="Freestyle Workout"
                  subtitle="Weight & rep telemetry • Manual mode"
                  onPress={() => router.push('/(tabs)/session/freestyle')}
                  accessibilityLabel="Start a freestyle session without a program day"
                />
                <DispatchTile
                  icon="run"
                  iconColor={theme.success}
                  title="Track Outdoor Route"
                  subtitle="Live stride cadence & pace telemetry"
                  badge={<Badge label="GPS Ready" variant="success" />}
                  onPress={() => router.push('/(tabs)/session/route')}
                  accessibilityLabel="Track a running or walking route"
                />
              </View>
            )}

            {/* Scheduled Workouts */}
            {days.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.rowInline}>
                    <ThemedText type="labelCaps" themeColor="textSecondary">
                      Scheduled Workouts
                    </ThemedText>
                    <View style={[styles.pip, { backgroundColor: theme.accent }]} />
                  </View>
                  {programName ? (
                    <ThemedText type="labelCaps" style={{ color: theme.accent }} numberOfLines={1}>
                      {programName}
                    </ThemedText>
                  ) : null}
                </View>

                {days.map((day, index) => {
                  const isFeatured = index === 0;
                  return (
                    <Pressable
                      key={day.id}
                      onPress={() => handleStartDay(day.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Start session for Day ${day.day_number}: ${day.name}`}
                    >
                      <GlassCard
                        elevation={isFeatured ? 'high' : 'low'}
                        active={isFeatured}
                        style={styles.dayCard}
                      >
                        <View style={styles.dayRow}>
                          <View
                            style={[
                              styles.dayBadge,
                              isFeatured
                                ? { backgroundColor: theme.accent }
                                : { backgroundColor: theme.backgroundHighest },
                            ]}
                          >
                            <ThemedText
                              type="titleMedium"
                              style={{ color: isFeatured ? theme.accentText : theme.textSecondary }}
                            >
                              {day.day_number}
                            </ThemedText>
                          </View>
                          <View style={styles.flexMin}>
                            <View style={styles.dayTitleRow}>
                              <ThemedText type="titleMedium" numberOfLines={1}>
                                {day.name}
                              </ThemedText>
                              {isFeatured ? <Badge label="Today" variant="accent" /> : null}
                            </View>
                            <ThemedText type="bodySmall" themeColor="textSecondary">
                              {isFeatured ? 'Recommended next session' : 'Scheduled'}
                            </ThemedText>
                          </View>
                          <Icon
                            name={isFeatured ? 'play' : 'chevron-right'}
                            size={isFeatured ? 22 : 18}
                            color={isFeatured ? theme.accent : theme.textSecondary}
                          />
                        </View>
                      </GlassCard>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Recent Sessions Header */}
            {sessionCount > 0 && (
              <View style={styles.sectionHeaderRow}>
                <ThemedText type="labelCaps" themeColor="textSecondary">
                  Recent Sessions
                </ThemedText>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          days.length === 0 ? (
            <View style={styles.emptyState}>
              <ThemedText type="headlineMedium">Session</ThemedText>
              <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.emptyDescription}>
                No active program found. Create or activate a program from the Program tab to start logging sessions.
              </ThemedText>
            </View>
          ) : null
        }
      />
    </ThemedView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DispatchTile({
  icon,
  iconColor,
  title,
  subtitle,
  badge,
  onPress,
  accessibilityLabel,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  iconColor: string;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      <GlassCard elevation="low" style={styles.dispatchTile}>
        <View style={styles.dispatchLeft}>
          <View style={[styles.dispatchIcon, { backgroundColor: theme.backgroundHighest }]}>
            <Icon name={icon} size={22} color={iconColor} />
          </View>
          <View style={styles.flexMin}>
            <View style={styles.dayTitleRow}>
              <ThemedText type="headlineSmall" numberOfLines={1}>
                {title}
              </ThemedText>
              {badge}
            </View>
            <ThemedText type="bodySmall" themeColor="textSecondary" numberOfLines={1}>
              {subtitle}
            </ThemedText>
          </View>
        </View>
        <Icon name="arrow-forward" size={20} color={theme.textSecondary} />
      </GlassCard>
    </Pressable>
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
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  listContent: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  headerStack: {
    gap: Spacing.four,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flexMin: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  section: {
    gap: Spacing.two,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.half,
  },
  pip: {
    width: 8,
    height: 8,
    borderRadius: Radii.full,
  },
  // Hero
  hero: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  heroTagRow: {
    flexDirection: 'row',
    marginBottom: Spacing.one,
  },
  heroTitle: {
    marginBottom: 2,
  },
  microBar: {
    flexDirection: 'row',
    borderRadius: Radii.large,
    paddingVertical: Spacing.two,
  },
  microMetric: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  // Continue card
  continueCard: {
    padding: Spacing.three,
  },
  continueArrow: {
    width: 40,
    height: 40,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Dispatch tiles
  dispatchTile: {
    padding: Spacing.twoHalf,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  dispatchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoHalf,
    flex: 1,
    minWidth: 0,
  },
  dispatchIcon: {
    width: 44,
    height: 44,
    borderRadius: Radii.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Day cards
  dayCard: {
    padding: Spacing.twoHalf,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoHalf,
  },
  dayBadge: {
    width: 36,
    height: 36,
    borderRadius: Radii.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  // Session history
  sessionCard: {
    padding: Spacing.three,
  },
  sessionCardRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.seven,
    gap: Spacing.two,
  },
  emptyDescription: {
    textAlign: 'center',
  },
});
