/**
 * Session tab entry point.
 * Displays session history list (last 20 sessions sorted by date descending)
 * and a "Continue Session" card when an in-progress session exists.
 * Users can also start a new session from their active program days.
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
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
        style={[styles.sessionCard, { backgroundColor: theme.backgroundElevated, borderColor: theme.border }]}
        onPress={() => handleSessionTap(item)}
        accessibilityRole="button"
        accessibilityLabel={`${dayName} session on ${date}, ${duration}, ${totalSets} sets. Tap to view summary.`}
      >
        <View style={styles.sessionCardContent}>
          <View style={styles.sessionCardLeft}>
            <ThemedText style={[styles.sessionDayName, { color: theme.text }]}>
              {dayName}
            </ThemedText>
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

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={sortedSessions}
        keyExtractor={(item) => item.id}
        renderItem={renderSessionItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* Continue Session Card (Req 16.4) */}
            {activeSession && (
              <Pressable
                style={[styles.continueCard, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}
                onPress={handleContinueSession}
                accessibilityRole="button"
                accessibilityLabel={`Continue session: ${activeSession.programDayId ? programDayNames.get(activeSession.programDayId) || 'Workout' : 'Freestyle'}. ${formatElapsed(activeSession.startedAt)}`}
              >
                <View style={styles.continueCardContent}>
                  <View style={styles.continueCardLeft}>
                    <ThemedText style={[styles.continueLabel, { color: theme.accent }]}>
                      Continue Session
                    </ThemedText>
                    <ThemedText style={[styles.continueSessionName, { color: theme.text }]}>
                      {activeSession.programDayId
                        ? programDayNames.get(activeSession.programDayId) || 'Workout'
                        : 'Freestyle'}
                    </ThemedText>
                  </View>
                  <View style={styles.continueCardRight}>
                    <ThemedText type="bodySmall" themeColor="textSecondary">
                      {formatElapsed(activeSession.startedAt)}
                    </ThemedText>
                    <ThemedText style={[styles.continueArrow, { color: theme.accent }]}>
                      →
                    </ThemedText>
                  </View>
                </View>
              </Pressable>
            )}

            {/* Start New Session Section */}
            {days.length > 0 && (
              <View style={styles.startSection}>
                <ThemedText type="headlineSmall" style={styles.sectionTitle}>
                  Start Session
                </ThemedText>
                <ThemedText type="bodySmall" themeColor="textSecondary">
                  {programName}
                </ThemedText>

                {/* Freestyle Session button (Req 8.1) */}
                <Pressable
                  style={[styles.dayCard, { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}
                  onPress={() => router.push('/(tabs)/session/freestyle')}
                  accessibilityRole="button"
                  accessibilityLabel="Start a freestyle session without a program day"
                >
                  <View style={[styles.dayBadge, { backgroundColor: theme.accent }]}>
                    <ThemedText style={styles.dayBadgeText}>🏋️</ThemedText>
                  </View>
                  <ThemedText style={[styles.dayName, { color: theme.text }]}>Freestyle Session</ThemedText>
                </Pressable>

                {/* Track Route button */}
                <Pressable
                  style={[styles.dayCard, { borderColor: theme.success, backgroundColor: theme.successSoft }]}
                  onPress={() => router.push('/(tabs)/session/route')}
                  accessibilityRole="button"
                  accessibilityLabel="Track a running or walking route"
                >
                  <View style={[styles.dayBadge, { backgroundColor: theme.success }]}>
                    <ThemedText style={styles.dayBadgeText}>🏃</ThemedText>
                  </View>
                  <ThemedText style={[styles.dayName, { color: theme.text }]}>Track Route</ThemedText>
                </Pressable>

                {days.map((day) => (
                  <Pressable
                    key={day.id}
                    style={[styles.dayCard, { borderColor: theme.border, backgroundColor: theme.backgroundElevated }]}
                    onPress={() => handleStartDay(day.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Start session for Day ${day.day_number}: ${day.name}`}
                  >
                    <View style={[styles.dayBadge, { backgroundColor: theme.accent }]}>
                      <ThemedText style={styles.dayBadgeText}>{day.day_number}</ThemedText>
                    </View>
                    <ThemedText style={[styles.dayName, { color: theme.text }]}>{day.name}</ThemedText>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Recent Sessions Header */}
            {sortedSessions.length > 0 && (
              <ThemedText type="headlineSmall" style={styles.sectionTitle}>
                Recent Sessions
              </ThemedText>
            )}
          </>
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
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
  // Continue Session Card
  continueCard: {
    borderWidth: 1,
    borderRadius: Radii.large,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  continueCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  continueCardLeft: {
    flex: 1,
    gap: 2,
  },
  continueCardRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  continueLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  continueSessionName: {
    fontSize: 16,
    fontWeight: '600',
  },
  continueArrow: {
    fontSize: 20,
    fontWeight: '600',
  },
  // Start Session Section
  startSection: {
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
  sectionTitle: {
    marginBottom: Spacing.one,
  },
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radii.large,
    padding: Spacing.three,
    minHeight: 48,
  },
  dayBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayBadgeText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  dayName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  // Session History Cards
  sessionCard: {
    borderWidth: 1,
    borderRadius: Radii.large,
    padding: Spacing.three,
  },
  sessionCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionCardLeft: {
    flex: 1,
    gap: 2,
  },
  sessionCardRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  sessionDayName: {
    fontSize: 15,
    fontWeight: '600',
  },
  // Empty State
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
