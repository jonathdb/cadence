/**
 * Session Summary Screen
 *
 * Displays post-workout summary including total volume, duration, PR count,
 * and exercise breakdown. Supports PR tap-to-highlight with scroll and flash.
 *
 * Route: /session/summary/[sessionId]
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTabBarClearance } from '@/hooks/useTabBarClearance';
import { useAuth } from '@/providers/AuthProvider';
import { deleteSession, updateSession } from '@/services/session-manager';
import { useCadenceStore } from '@/store';
import type { LoggedSet } from '@/types/session';
import { supabase } from '@/utils/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Source-agnostic session shape the summary renders from. Populated either
 * from the local store (native, when the session ran through store actions)
 * or from a direct Supabase fetch (the program-day logging flow, which writes
 * straight to Supabase).
 */
interface SessionView {
  id: string;
  notes: string | null;
  startedAt: string;
  completedAt?: string | null;
  sets: {
    id: string;
    exerciseId: string;
    setNumber: number;
    reps: number;
    weight: number;
    isPr: boolean;
  }[];
}

interface ExerciseBreakdown {
  exerciseId: string;
  exerciseName: string;
  setsCount: number;
  totalVolume: number;
  bestSet: { reps: number; weight: number };
  sets: SetInfo[];
}

interface SetInfo {
  id: string;
  setNumber: number;
  reps: number;
  weight: number;
  isPr: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format duration in seconds to HH:MM:SS format.
 */
function formatDurationHHMMSS(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return `${hh}:${mm}:${ss}`;
}

/**
 * Format volume with appropriate units and locale formatting.
 */
function formatVolume(volume: number): string {
  if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}k kg`;
  }
  return `${volume.toLocaleString()} kg`;
}

// ─── PR Highlight Set Row ────────────────────────────────────────────────────

function HighlightableSetRow({
  set,
  highlightedSetId,
  theme,
  onLayout,
}: {
  set: SetInfo;
  highlightedSetId: string | null;
  theme: ReturnType<typeof useTheme>;
  onLayout: (id: string, y: number) => void;
}) {
  const flashOpacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor:
      flashOpacity.value > 0
        ? `rgba(245, 158, 11, ${flashOpacity.value * 0.3})`
        : 'transparent',
  }));

  // Trigger flash when this set becomes highlighted
  if (highlightedSetId === set.id) {
    flashOpacity.value = withSequence(
      withTiming(1, { duration: 200 }),
      withTiming(0.6, { duration: 200 }),
      withTiming(1, { duration: 200 }),
      withTiming(0, { duration: 400 })
    );
  }

  return (
    <Animated.View
      style={[styles.setRow, animatedStyle]}
      onLayout={(e) => onLayout(set.id, e.nativeEvent.layout.y)}
    >
      <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.setNumber}>
        {set.setNumber}
      </ThemedText>
      <ThemedText type="bodyMedium" style={{ color: theme.text }}>
        {set.reps} × {set.weight} kg
      </ThemedText>
      {set.isPr && (
        <View
          style={[styles.prBadge, { backgroundColor: theme.prBackground, borderColor: theme.prBorder }]}
          accessibilityLabel="Personal record"
        >
          <ThemedText type="labelSmall" style={{ color: theme.prText }}>
            PR
          </ThemedText>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Main Screen Component ───────────────────────────────────────────────────

export default function SessionSummaryScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const dockClearance = useTabBarClearance();
  const scrollRef = useRef<ScrollView>(null);
  const { session: authSession } = useAuth();
  const updateSessionNotes = useCadenceStore((state) => state.updateSessionNotes);
  const removeSession = useCadenceStore((state) => state.removeSession);

  // State for PR highlight
  const [highlightedSetId, setHighlightedSetId] = useState<string | null>(null);

  // Notes edit state — mirrors the archive-first program delete pattern:
  // optimistic local update immediately, then a direct Supabase write when
  // the offline WAL isn't in play (native uses the store action's own WAL
  // enqueue; this direct write covers web, where WAL is unavailable).
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Track set positions for scroll-to on PR tap
  const setPositionsRef = useRef<Map<string, number>>(new Map());
  // Track exercise section positions (Y offset of each exercise breakdown section)
  const exerciseSectionPositionsRef = useRef<Map<string, number>>(new Map());

  // Find session in store (fast path — populated only when the session was
  // created through the store's startSession/logSet actions).
  const storeSession = useCadenceStore((state) =>
    state.recentSessions.find((s) => s.id === sessionId)
  );

  // The program-day logging flow (session/[dayId].tsx) writes the session and
  // its sets straight to Supabase, NOT through the store, so the store lookup
  // above misses them. Fetch the session + logged sets from Supabase by id as
  // the source of truth, and fall back to the store only if the fetch is empty.
  const [fetchedSession, setFetchedSession] = useState<SessionView | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [fetchedExerciseNames, setFetchedExerciseNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!sessionId) {
      setIsLoadingSession(false);
      return;
    }
    let cancelled = false;

    async function load() {
      setIsLoadingSession(true);
      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('id, notes, started_at, completed_at, logged_sets(*)')
          .eq('id', sessionId)
          .is('deleted_at', null)
          .single();

        if (cancelled) return;

        if (error || !data) {
          setFetchedSession(null);
          return;
        }

        const row = data as unknown as {
          id: string;
          notes: string | null;
          started_at: string;
          completed_at: string | null;
          logged_sets: LoggedSet[];
        };

        const view: SessionView = {
          id: row.id,
          notes: row.notes ?? null,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          sets: (row.logged_sets ?? []).map((s) => ({
            id: s.id,
            exerciseId: s.exercise_id,
            setNumber: s.set_number,
            reps: s.reps,
            weight: s.weight,
            isPr: s.is_pr === true,
          })),
        };
        setFetchedSession(view);

        // Resolve exercise names for the sets in this session.
        const exerciseIds = [...new Set(view.sets.map((s) => s.exerciseId))];
        if (exerciseIds.length > 0) {
          const { data: exRows } = await supabase
            .from('exercises')
            .select('id, name')
            .in('id', exerciseIds);
          if (!cancelled && exRows) {
            const names: Record<string, string> = {};
            for (const e of exRows as { id: string; name: string }[]) {
              names[e.id] = e.name;
            }
            setFetchedExerciseNames(names);
          }
        }
      } catch {
        if (!cancelled) setFetchedSession(null);
      } finally {
        if (!cancelled) setIsLoadingSession(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Unified session view: prefer the store (has richer local state), else the
  // Supabase fetch. Normalized to a common shape so the summary math below
  // doesn't care which source it came from.
  const session: SessionView | null = useMemo(() => {
    if (storeSession) {
      return {
        id: storeSession.id,
        notes: storeSession.notes ?? null,
        startedAt: storeSession.startedAt,
        completedAt: storeSession.completedAt,
        sets: storeSession.sets.map((s) => ({
          id: s.id,
          exerciseId: s.exerciseId,
          setNumber: s.setNumber,
          reps: s.reps,
          weight: s.weight,
          isPr: s.isPr === true,
        })),
      };
    }
    return fetchedSession;
  }, [storeSession, fetchedSession]);

  // Compute summary data from the session
  const summaryData = useMemo(() => {
    if (!session) return null;

    const sets = session.sets;

    // Total volume: sum(reps × weight)
    const totalVolume = sets.reduce((sum, s) => sum + s.reps * s.weight, 0);

    // Duration: startedAt to completedAt
    let durationSeconds = 0;
    if (session.startedAt && session.completedAt) {
      const start = new Date(session.startedAt).getTime();
      const end = new Date(session.completedAt).getTime();
      durationSeconds = Math.max(0, Math.round((end - start) / 1000));
    }

    // PR count: sets with isPr === true
    const prCount = sets.filter((s) => s.isPr === true).length;

    // Exercise breakdown: group sets by exerciseId
    const exerciseMap = new Map<string, ExerciseBreakdown>();

    for (const s of sets) {
      if (!exerciseMap.has(s.exerciseId)) {
        exerciseMap.set(s.exerciseId, {
          exerciseId: s.exerciseId,
          exerciseName: s.exerciseId, // Will be resolved below
          setsCount: 0,
          totalVolume: 0,
          bestSet: { reps: s.reps, weight: s.weight },
          sets: [],
        });
      }
      const entry = exerciseMap.get(s.exerciseId)!;
      entry.setsCount += 1;
      entry.totalVolume += s.reps * s.weight;
      entry.sets.push({
        id: s.id,
        setNumber: s.setNumber,
        reps: s.reps,
        weight: s.weight,
        isPr: s.isPr === true,
      });

      // Best set by volume (reps × weight)
      if (s.reps * s.weight > entry.bestSet.reps * entry.bestSet.weight) {
        entry.bestSet = { reps: s.reps, weight: s.weight };
      }
    }

    const exerciseBreakdown = Array.from(exerciseMap.values());

    return { totalVolume, durationSeconds, prCount, exerciseBreakdown };
  }, [session]);

  // Resolve exercise names from the store's exercises cache
  const exercises = useCadenceStore((state) => state.exercises);

  const resolvedBreakdown = useMemo(() => {
    if (!summaryData) return [];
    return summaryData.exerciseBreakdown.map((eb) => {
      const exercise = exercises.find((e) => e.id === eb.exerciseId);
      return {
        ...eb,
        exerciseName:
          exercise?.name ??
          fetchedExerciseNames[eb.exerciseId] ??
          `Exercise ${eb.exerciseId.slice(0, 8)}`,
      };
    });
  }, [summaryData, exercises, fetchedExerciseNames]);

  // Handle PR tap: scroll to the specific set and flash it
  const handlePrTap = useCallback((setId: string, exerciseId: string) => {
    setHighlightedSetId(setId);

    // Calculate scroll position: exercise section Y + set row Y within section
    const exerciseY = exerciseSectionPositionsRef.current.get(exerciseId) ?? 0;
    const setY = setPositionsRef.current.get(setId) ?? 0;
    const targetY = exerciseY + setY;

    scrollRef.current?.scrollTo({ y: Math.max(0, targetY - 100), animated: true });

    // Clear highlight after animation completes
    setTimeout(() => setHighlightedSetId(null), 1200);
  }, []);

  const handleSetLayout = useCallback((id: string, y: number) => {
    setPositionsRef.current.set(id, y);
  }, []);

  const handleExerciseSectionLayout = useCallback((exerciseId: string, y: number) => {
    exerciseSectionPositionsRef.current.set(exerciseId, y);
  }, []);

  const handleBackToSessions = useCallback(() => {
    router.replace('/(tabs)/session');
  }, [router]);

  // ─── Session edit/delete affordances (Requirements 4.1, 4.2, 4.6, 4.7, 4.8) ─
  // Optimistic-first via the store action (which enqueues a WAL op natively);
  // on failure, fall back to a direct Supabase write (covers web, where the
  // WAL is unavailable) and re-throw only if that also fails.

  const startEditingNotes = useCallback(() => {
    setNotesDraft(session?.notes ?? '');
    setIsEditingNotes(true);
  }, [session?.notes]);

  const cancelEditingNotes = useCallback(() => {
    setIsEditingNotes(false);
  }, []);

  const saveNotes = useCallback(async () => {
    if (!sessionId || !authSession?.user.id) return;
    setIsSavingNotes(true);
    try {
      // Authoritative write to Supabase (works regardless of whether the
      // session is in the local store — the program-day flow writes sessions
      // straight to the DB, so it usually isn't).
      await updateSession(supabase, authSession.user.id, sessionId, { notes: notesDraft });
      // Reconcile local store/fetched state for immediate UI consistency.
      updateSessionNotes(sessionId, notesDraft);
      setFetchedSession((prev) => (prev ? { ...prev, notes: notesDraft } : prev));
      setIsEditingNotes(false);
    } catch (err) {
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : 'Could not save notes. Please try again.'
      );
    } finally {
      setIsSavingNotes(false);
    }
  }, [sessionId, authSession?.user.id, notesDraft, updateSessionNotes]);

  const runDeleteSession = useCallback(async () => {
    if (!sessionId || !authSession?.user.id) return;
    setIsDeleting(true);
    try {
      // Authoritative soft-delete in Supabase, then reconcile local store.
      await deleteSession(supabase, authSession.user.id, sessionId);
      removeSession(sessionId);
      router.replace('/(tabs)/session');
    } catch (err) {
      setIsDeleting(false);
      Alert.alert(
        'Delete failed',
        err instanceof Error
          ? err.message
          : 'Could not delete the session. It remains in your history.'
      );
    }
  }, [sessionId, authSession?.user.id, removeSession, router]);

  const handleDeleteSession = useCallback(() => {
    // Non-destructive framing: logged sets are preserved regardless
    // (Requirement 4.12), so a single confirmation is sufficient here.
    Alert.alert(
      'Delete this session?',
      'This session will be removed from your history. Your logged sets are kept as a record of past activity.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: runDeleteSession },
      ]
    );
  }, [runDeleteSession]);

  // ─── Loading State ─────────────────────────────────────────────────────────
  // The session is fetched from Supabase asynchronously; show a spinner until
  // that resolves so we don't flash "Session Not Found" before it loads.

  if (isLoadingSession && !session) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </ThemedView>
    );
  }

  // ─── Error State (Req 2.3) ─────────────────────────────────────────────────

  if (!session || !summaryData) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText
          type="headlineMedium"
          accessibilityRole="header"
        >
          Session Not Found
        </ThemedText>
        <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.errorMessage}>
          The session could not be loaded. It may have been deleted or the ID is invalid.
        </ThemedText>
        <Pressable
          style={[styles.backButton, { borderColor: theme.border }]}
          onPress={handleBackToSessions}
          accessibilityRole="button"
          accessibilityLabel="Back to Sessions"
        >
          <ThemedText style={[styles.backButtonText, { color: theme.text }]}>
            Back to Sessions
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const { totalVolume, durationSeconds, prCount } = summaryData;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: dockClearance }]}
        accessibilityLabel="Session summary"
      >
        {/* Header */}
        <View style={styles.header} accessibilityRole="header">
          <ThemedText type="headlineMedium">Session Complete 🎉</ThemedText>
          <ThemedText type="bodyMedium" themeColor="textSecondary">
            Here&apos;s how your workout went.
          </ThemedText>
        </View>

        {/* Stats Grid */}
        <View
          style={styles.statsGrid}
          accessibilityLabel={`Total volume ${formatVolume(totalVolume)}, Duration ${formatDurationHHMMSS(durationSeconds)}, ${prCount} personal records`}
          accessible={true}
        >
          <View style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="bodySmall" themeColor="textSecondary">
              Total Volume
            </ThemedText>
            <ThemedText type="monoMedium">{formatVolume(totalVolume)}</ThemedText>
          </View>

          <View style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="bodySmall" themeColor="textSecondary">
              Duration
            </ThemedText>
            <ThemedText type="monoMedium">{formatDurationHHMMSS(durationSeconds)}</ThemedText>
          </View>

          <View style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="bodySmall" themeColor="textSecondary">
              PRs
            </ThemedText>
            <ThemedText type="monoMedium" style={{ color: prCount > 0 ? theme.prText : theme.text }}>
              {prCount}
            </ThemedText>
          </View>
        </View>

        {/* Session notes — edit affordance (Requirements 4.1, 4.2, 4.6) */}
        <View style={styles.notesSection}>
          <View style={styles.notesHeader}>
            <ThemedText type="headlineSmall" accessibilityRole="header">
              Notes
            </ThemedText>
            {!isEditingNotes && (
              <Pressable
                onPress={startEditingNotes}
                accessibilityRole="button"
                accessibilityLabel={session.notes ? 'Edit session notes' : 'Add session notes'}
                hitSlop={8}
              >
                <ThemedText type="linkPrimary">{session.notes ? 'Edit' : 'Add'}</ThemedText>
              </Pressable>
            )}
          </View>

          {isEditingNotes ? (
            <View style={styles.notesEditRow}>
              <TextInput
                value={notesDraft}
                onChangeText={setNotesDraft}
                multiline
                placeholder="Anything worth remembering about this session"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.notesInput,
                  { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}
                accessibilityLabel="Session notes"
                autoFocus
              />
              <View style={styles.notesActions}>
                <Pressable
                  style={[styles.notesActionButton, { backgroundColor: theme.backgroundElement }]}
                  onPress={cancelEditingNotes}
                  disabled={isSavingNotes}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel editing notes"
                >
                  <ThemedText style={{ color: theme.text, fontWeight: '600' }}>Cancel</ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.notesActionButton, { backgroundColor: theme.accent }]}
                  onPress={saveNotes}
                  disabled={isSavingNotes}
                  accessibilityRole="button"
                  accessibilityLabel="Save notes"
                >
                  {isSavingNotes ? (
                    <ActivityIndicator size="small" color={theme.accentText} />
                  ) : (
                    <ThemedText style={{ color: theme.accentText, fontWeight: '600' }}>Save</ThemedText>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <ThemedText type="bodyMedium" themeColor={session.notes ? 'text' : 'textSecondary'}>
              {session.notes || 'No notes for this session yet.'}
            </ThemedText>
          )}
        </View>

        {/* PR Summary Section (tappable PRs) */}
        {prCount > 0 && (
          <View style={styles.prSection}>
            <ThemedText type="headlineSmall" accessibilityRole="header">
              🏆 Personal Records
            </ThemedText>
            {resolvedBreakdown
              .flatMap((eb) =>
                eb.sets
                  .filter((s) => s.isPr)
                  .map((s) => ({ ...s, exerciseName: eb.exerciseName, exerciseId: eb.exerciseId }))
              )
              .map((pr) => (
                <Pressable
                  key={pr.id}
                  style={[styles.prRow, { borderBottomColor: theme.border }]}
                  onPress={() => handlePrTap(pr.id, pr.exerciseId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Personal record: ${pr.exerciseName}, ${pr.reps} reps at ${pr.weight} kg. Tap to highlight.`}
                  accessibilityHint="Scrolls to and highlights the set that achieved this record"
                >
                  <View style={styles.prInfo}>
                    <ThemedText style={{ fontSize: 15, fontWeight: '600', color: theme.text }}>
                      {pr.exerciseName}
                    </ThemedText>
                    <ThemedText type="bodySmall" themeColor="textSecondary">
                      Set {pr.setNumber}
                    </ThemedText>
                  </View>
                  <ThemedText style={{ fontSize: 15, fontWeight: '700', color: theme.prText }}>
                    {pr.reps} × {pr.weight} kg
                  </ThemedText>
                </Pressable>
              ))}
          </View>
        )}

        {/* Exercise Breakdown */}
        <View style={styles.breakdownSection}>
          <ThemedText type="headlineSmall" accessibilityRole="header">
            Exercise Breakdown
          </ThemedText>
          {resolvedBreakdown.map((eb) => (
            <View
              key={eb.exerciseId}
              style={[styles.exerciseCard, { backgroundColor: theme.backgroundElevated, borderColor: theme.border }]}
              onLayout={(e) => handleExerciseSectionLayout(eb.exerciseId, e.nativeEvent.layout.y)}
              accessibilityLabel={`${eb.exerciseName}: ${eb.setsCount} sets, ${formatVolume(eb.totalVolume)} volume, best set ${eb.bestSet.reps} reps at ${eb.bestSet.weight} kg`}
              accessible={true}
            >
              {/* Exercise Header */}
              <View style={styles.exerciseHeader}>
                <ThemedText type="labelLarge" style={{ color: theme.text, flex: 1 }}>
                  {eb.exerciseName}
                </ThemedText>
                <ThemedText type="bodySmall" themeColor="textSecondary">
                  {eb.setsCount} sets · {formatVolume(eb.totalVolume)}
                </ThemedText>
              </View>

              {/* Best Set */}
              <View style={[styles.bestSetRow, { backgroundColor: theme.accentSoft }]}>
                <ThemedText type="labelSmall" style={{ color: theme.accent }}>
                  Best Set
                </ThemedText>
                <ThemedText type="bodyMedium" style={{ color: theme.accent }}>
                  {eb.bestSet.reps} × {eb.bestSet.weight} kg
                </ThemedText>
              </View>

              {/* Individual Sets */}
              <View style={styles.setsContainer}>
                {eb.sets.map((s) => (
                  <HighlightableSetRow
                    key={s.id}
                    set={s}
                    highlightedSetId={highlightedSetId}
                    theme={theme}
                    onLayout={handleSetLayout}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>

        {/* Done + Delete Buttons (Requirements 4.1, 4.6, 4.7, 4.8) */}
        <View style={styles.footerActions}>
          <Pressable
            style={[styles.doneButton, { borderColor: theme.border, flex: 1 }]}
            onPress={handleBackToSessions}
            accessibilityRole="button"
            accessibilityLabel="Return to session list"
          >
            <ThemedText style={[styles.doneButtonText, { color: theme.text }]}>Done</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.deleteSessionButton, { backgroundColor: theme.errorSoft }]}
            onPress={handleDeleteSession}
            disabled={isDeleting}
            accessibilityRole="button"
            accessibilityLabel="Delete this session"
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={theme.error} />
            ) : (
              <ThemedText style={{ color: theme.error, fontWeight: '600' }}>Delete</ThemedText>
            )}
          </Pressable>
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
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  errorMessage: {
    textAlign: 'center',
    lineHeight: 20,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one,
    alignItems: 'center',
    paddingTop: Spacing.three,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  statCard: {
    flex: 1,
    borderRadius: Radii.large,
    padding: Spacing.three,
    alignItems: 'center',
    gap: Spacing.one,
  },
  prSection: {
    gap: Spacing.two,
  },
  prRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  prInfo: {
    flex: 1,
    gap: 2,
  },
  breakdownSection: {
    gap: Spacing.three,
  },
  exerciseCard: {
    borderRadius: Radii.large,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bestSetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radii.small,
  },
  setsContainer: {
    gap: Spacing.one,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.small,
    gap: Spacing.two,
  },
  setNumber: {
    width: 24,
  },
  prBadge: {
    borderRadius: Radii.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    marginLeft: 'auto',
  },
  backButton: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    paddingVertical: 14,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  doneButton: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  footerActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  deleteSessionButton: {
    borderRadius: Radii.medium,
    paddingVertical: 14,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 88,
  },
  notesSection: {
    gap: Spacing.two,
  },
  notesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notesEditRow: {
    gap: Spacing.two,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: Spacing.two,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  notesActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  notesActionButton: {
    flex: 1,
    borderRadius: Radii.medium,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
});
