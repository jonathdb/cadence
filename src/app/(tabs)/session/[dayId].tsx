/**
 * Active session logging screen.
 * Loads a program day's exercises, allows logging sets with auto-fill,
 * detects PRs in real-time, and displays active timer UI.
 *
 * Requirements: 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 18.1, 20.3
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
    AutoFillSource,
    getAutoFillValues,
    getIntraSessionFill,
} from '@/services/auto-fill';
import { detectPR, ExerciseHistory, PRResult } from '@/services/pr-detection';
import {
    startTimer,
    TimerController,
    TimerState,
} from '@/services/timer';
import type { ProgramDayItem, TimerConfig } from '@/types/program';
import type { LoggedSet, Session } from '@/types/session';
import { supabase } from '@/utils/supabase';

// --- Local types ---

interface ExerciseData {
  id: string;
  name: string;
  primary_muscle_group: string;
}

interface DayItemData {
  id: string;
  order_index: number;
  type: 'exercise' | 'block';
  exercise_id: string | null;
  target_sets: number;
  target_reps: string;
  target_weight: number | null;
  target_rpe: number | null;
  timer_config: TimerConfig | null;
  notes: string | null;
  exercises: ExerciseData | null;
}

interface DayData {
  id: string;
  day_number: number;
  name: string;
  program_id: string;
  program_day_items: DayItemData[];
}

interface SetEntry {
  id: string;
  exercise_id: string;
  set_number: number;
  reps: number;
  weight: number;
  rpe: number | undefined;
  notes: string;
  is_pr: boolean;
  pr_type: string | null;
  isManualOverride: boolean;
}

interface SetFormState {
  reps: string;
  weight: string;
  rpe: string;
  notes: string;
}

// --- Timer Display Component ---

function TimerDisplay({ timerState }: { timerState: TimerState }) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.timerContainer}>
      <View style={styles.timerHeader}>
        <ThemedText style={styles.timerPhaseLabel}>
          {timerState.phase.toUpperCase()}
        </ThemedText>
        {timerState.total_rounds > 1 && (
          <ThemedText style={styles.timerRound}>
            Round {timerState.current_round}/{timerState.total_rounds}
          </ThemedText>
        )}
      </View>
      <View style={styles.timerTimeRow}>
        {timerState.type !== 'duration' ? (
          <ThemedText style={styles.timerCountdown}>
            {formatTime(timerState.remaining_seconds)}
          </ThemedText>
        ) : (
          <ThemedText style={styles.timerCountdown}>
            {formatTime(timerState.elapsed_seconds)}
          </ThemedText>
        )}
      </View>
      <ThemedText style={styles.timerElapsed}>
        Elapsed: {formatTime(timerState.elapsed_seconds)}
      </ThemedText>
    </View>
  );
}

// --- Main Screen Component ---

export default function SessionLoggingScreen() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const router = useRouter();

  // Core state
  const [day, setDay] = useState<DayData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);

  // Sets state: keyed by exercise_id
  const [loggedSets, setLoggedSets] = useState<Record<string, SetEntry[]>>({});
  const [prResults, setPrResults] = useState<Record<string, PRResult>>({});

  // Form state for the "add set" input per exercise
  const [formStates, setFormStates] = useState<Record<string, SetFormState>>({});

  // Auto-fill initial values per exercise
  const [autoFillValues, setAutoFillValues] = useState<Record<string, AutoFillSource>>({});

  // Exercise history for PR detection
  const [exerciseHistories, setExerciseHistories] = useState<
    Record<string, ExerciseHistory>
  >({});

  // Timer state
  const [activeTimerExercise, setActiveTimerExercise] = useState<string | null>(null);
  const [timerState, setTimerState] = useState<TimerState | null>(null);
  const timerControllerRef = useRef<TimerController | null>(null);

  // Previous sessions for auto-fill
  const [previousSessions, setPreviousSessions] = useState<Session[]>([]);

  // --- Data fetching ---

  const fetchDayData = useCallback(async () => {
    if (!dayId) return;
    try {
      const { data, error } = await supabase
        .from('program_days')
        .select(`
          id,
          day_number,
          name,
          program_id,
          program_day_items (
            id,
            order_index,
            type,
            exercise_id,
            target_sets,
            target_reps,
            target_weight,
            target_rpe,
            timer_config,
            notes,
            exercises (id, name, primary_muscle_group)
          )
        `)
        .eq('id', dayId)
        .single();

      if (error) {
        console.error('Failed to fetch day:', error.message);
        return;
      }

      setDay(data as unknown as DayData);
    } catch (err) {
      console.error('Error fetching day data:', err);
    }
  }, [dayId]);

  const fetchSessionHistory = useCallback(async () => {
    if (!dayId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch previous sessions for this program day (for auto-fill)
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, program_day_id, status, started_at, completed_at, logged_sets(*)')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(10);

      if (sessions) {
        setPreviousSessions(sessions as unknown as Session[]);
      }
    } catch (err) {
      console.error('Error fetching session history:', err);
    }
  }, [dayId]);

  const fetchExerciseHistories = useCallback(async (items: DayItemData[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const exerciseIds = items
        .filter((item) => item.exercise_id)
        .map((item) => item.exercise_id!);

      if (exerciseIds.length === 0) return;

      const { data: allSets } = await supabase
        .from('logged_sets')
        .select('exercise_id, reps, weight')
        .in('exercise_id', exerciseIds);

      const typedSets = (allSets ?? []) as unknown as Array<{
        exercise_id: string;
        reps: number;
        weight: number;
      }>;

      if (typedSets.length === 0) return;

      const histories: Record<string, ExerciseHistory> = {};
      for (const exId of exerciseIds) {
        const sets = typedSets
          .filter((s) => s.exercise_id === exId)
          .map((s) => ({ reps: s.reps, weight: s.weight }));
        histories[exId] = { exercise_id: exId, sets };
      }

      setExerciseHistories(histories);
    } catch (err) {
      console.error('Error fetching exercise histories:', err);
    }
  }, []);

  // Initialize session in database
  const initializeSession = useCallback(async () => {
    if (!dayId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const startedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          user_id: user.id,
          program_day_id: dayId,
          status: 'in_progress',
          started_at: startedAt,
        } as never)
        .select('id')
        .single();

      if (error) {
        console.error('Failed to create session:', error.message);
        return;
      }

      setSessionId((data as unknown as { id: string }).id);
      setSessionStartedAt(startedAt);
    } catch (err) {
      console.error('Error initializing session:', err);
    }
  }, [dayId]);

  // --- Effects ---

  useEffect(() => {
    async function init() {
      await fetchDayData();
      await fetchSessionHistory();
      setIsLoading(false);
    }
    init();
  }, [fetchDayData, fetchSessionHistory]);

  // Once day data is loaded, initialize auto-fill values and session
  useEffect(() => {
    if (!day) return;

    const items = [...day.program_day_items].sort(
      (a, b) => a.order_index - b.order_index
    );

    // Fetch exercise histories for PR detection
    fetchExerciseHistories(items);

    // Compute auto-fill values for each exercise
    const fills: Record<string, AutoFillSource> = {};
    const forms: Record<string, SetFormState> = {};

    for (const item of items) {
      if (!item.exercise_id) continue;

      // Collect exercise history from previous sessions
      const exerciseHistory: LoggedSet[] = previousSessions
        .flatMap((s) => s.logged_sets || [])
        .filter((set) => set.exercise_id === item.exercise_id);

      const fill = getAutoFillValues(
        item.exercise_id,
        day.id,
        previousSessions,
        exerciseHistory,
        item as unknown as ProgramDayItem
      );

      fills[item.exercise_id] = fill;
      forms[item.exercise_id] = {
        reps: fill.reps.toString(),
        weight: fill.weight.toString(),
        rpe: fill.rpe?.toString() ?? '',
        notes: '',
      };
    }

    setAutoFillValues(fills);
    setFormStates(forms);

    // Initialize session in the database
    initializeSession();
  }, [day, previousSessions, fetchExerciseHistories, initializeSession]);

  // --- Handlers ---

  const handleAddSet = useCallback(
    (exerciseId: string) => {
      const form = formStates[exerciseId];
      if (!form) return;

      const reps = parseInt(form.reps, 10) || 0;
      const weight = parseFloat(form.weight) || 0;
      const rpe = form.rpe ? parseFloat(form.rpe) : undefined;

      if (reps <= 0 || weight <= 0) {
        Alert.alert('Invalid Set', 'Reps and weight must be greater than zero.');
        return;
      }

      // Check for PR
      const history = exerciseHistories[exerciseId] || {
        exercise_id: exerciseId,
        sets: [],
      };
      const prResult = detectPR({ reps, weight }, history);

      // Create the set entry
      const existingSets = loggedSets[exerciseId] || [];
      const setNumber = existingSets.length + 1;
      const newSet: SetEntry = {
        id: `${exerciseId}-set-${setNumber}`,
        exercise_id: exerciseId,
        set_number: setNumber,
        reps,
        weight,
        rpe,
        notes: form.notes,
        is_pr: prResult.is_pr,
        pr_type: prResult.pr_type,
        isManualOverride: false,
      };

      // Update logged sets
      const updatedSets = [...existingSets, newSet];
      setLoggedSets((prev) => ({ ...prev, [exerciseId]: updatedSets }));

      // Store PR result for display
      if (prResult.is_pr) {
        setPrResults((prev) => ({
          ...prev,
          [`${exerciseId}-${setNumber}`]: prResult,
        }));
      }

      // Update exercise history for subsequent PR detection
      setExerciseHistories((prev) => ({
        ...prev,
        [exerciseId]: {
          exercise_id: exerciseId,
          sets: [...(prev[exerciseId]?.sets || []), { reps, weight }],
        },
      }));

      // Intra-session auto-fill for next set
      const setsForFill = updatedSets.map((s) => ({
        reps: s.reps,
        weight: s.weight,
        rpe: s.rpe,
        isManualOverride: s.isManualOverride,
      }));

      const intraFill = getIntraSessionFill(setsForFill);
      if (intraFill) {
        setFormStates((prev) => ({
          ...prev,
          [exerciseId]: {
            reps: intraFill.reps.toString(),
            weight: intraFill.weight.toString(),
            rpe: intraFill.rpe?.toString() ?? '',
            notes: '',
          },
        }));
      }

      // Persist set to database
      if (sessionId) {
        supabase
          .from('logged_sets')
          .insert({
            session_id: sessionId,
            exercise_id: exerciseId,
            set_number: setNumber,
            reps,
            weight,
            rpe,
            notes: form.notes || null,
            is_pr: prResult.is_pr,
            pr_type: prResult.pr_type || null,
            logged_at: new Date().toISOString(),
          } as never)
          .then(({ error }) => {
            if (error) {
              console.error('Failed to persist set:', error.message);
            }
          });
      }
    },
    [formStates, loggedSets, exerciseHistories, sessionId]
  );

  const handleFormChange = useCallback(
    (exerciseId: string, field: keyof SetFormState, value: string) => {
      setFormStates((prev) => ({
        ...prev,
        [exerciseId]: {
          ...prev[exerciseId],
          [field]: value,
        },
      }));
    },
    []
  );

  const handleStartTimer = useCallback(
    (exerciseId: string, config: TimerConfig) => {
      // Stop any existing timer
      if (timerControllerRef.current) {
        timerControllerRef.current.stop();
        timerControllerRef.current = null;
      }

      setActiveTimerExercise(exerciseId);

      const controller = startTimer(
        config,
        (state) => setTimerState(state),
        (_result) => {
          setActiveTimerExercise(null);
          setTimerState(null);
        }
      );

      timerControllerRef.current = controller;
    },
    []
  );

  const handleStopTimer = useCallback(() => {
    if (timerControllerRef.current) {
      timerControllerRef.current.stop();
      timerControllerRef.current = null;
    }
    setActiveTimerExercise(null);
    setTimerState(null);
  }, []);

  const handleCompleteSession = useCallback(async () => {
    if (!sessionId || !sessionStartedAt) return;

    const completedAt = new Date().toISOString();
    const durationSeconds = Math.round(
      (new Date(completedAt).getTime() - new Date(sessionStartedAt).getTime()) / 1000
    );

    // Stop any running timer
    if (timerControllerRef.current) {
      timerControllerRef.current.stop();
      timerControllerRef.current = null;
      setActiveTimerExercise(null);
      setTimerState(null);
    }

    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          status: 'completed',
          completed_at: completedAt,
          total_duration_seconds: durationSeconds,
        } as never)
        .eq('id', sessionId);

      if (error) {
        console.error('Failed to complete session:', error.message);
        Alert.alert('Error', 'Failed to complete session. Please try again.');
        return;
      }

      // Navigate to summary (or back to session index for now)
      router.back();
    } catch (err) {
      console.error('Error completing session:', err);
    }
  }, [sessionId, sessionStartedAt, router]);

  // --- Render ---

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

  const sortedItems = [...day.program_day_items].sort(
    (a, b) => a.order_index - b.order_index
  );

  const totalSetsLogged = Object.values(loggedSets).reduce(
    (sum, sets) => sum + sets.length,
    0
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Session header */}
        <View style={styles.sessionHeader}>
          <ThemedText type="subtitle" style={styles.dayTitle}>
            Day {day.day_number}: {day.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {totalSetsLogged} sets logged
          </ThemedText>
        </View>

        {/* Active timer display */}
        {timerState && timerState.is_running && (
          <View style={styles.activeTimerSection}>
            <TimerDisplay timerState={timerState} />
            <Pressable
              style={styles.stopTimerButton}
              onPress={handleStopTimer}
              accessibilityRole="button"
              accessibilityLabel="Stop timer"
            >
              <ThemedText style={styles.stopTimerText}>Stop Timer</ThemedText>
            </Pressable>
          </View>
        )}

        {/* Exercise cards */}
        {sortedItems.map((item, index) => {
          if (!item.exercise_id || !item.exercises) return null;

          const exerciseId = item.exercise_id;
          const sets = loggedSets[exerciseId] || [];
          const form = formStates[exerciseId] || {
            reps: '0',
            weight: '0',
            rpe: '',
            notes: '',
          };
          const hasTimer =
            item.timer_config && item.timer_config.type !== 'none';
          const isTimerActive = activeTimerExercise === exerciseId;

          return (
            <View key={item.id} style={styles.exerciseCard}>
              {/* Exercise header */}
              <View style={styles.exerciseHeader}>
                <View style={styles.orderBadge}>
                  <ThemedText style={styles.orderText}>
                    {index + 1}
                  </ThemedText>
                </View>
                <View style={styles.exerciseInfo}>
                  <ThemedText style={styles.exerciseName}>
                    {item.exercises.name}
                  </ThemedText>
                  <ThemedText style={styles.targetInfo}>
                    Target: {item.target_sets}×{item.target_reps}
                    {item.target_weight
                      ? ` @ ${item.target_weight}kg`
                      : ''}
                    {item.target_rpe ? ` RPE ${item.target_rpe}` : ''}
                  </ThemedText>
                </View>
              </View>

              {/* Logged sets list */}
              {sets.length > 0 && (
                <View style={styles.setsListContainer}>
                  <View style={styles.setsHeader}>
                    <ThemedText style={styles.setsHeaderLabel}>Set</ThemedText>
                    <ThemedText style={styles.setsHeaderLabel}>Reps</ThemedText>
                    <ThemedText style={styles.setsHeaderLabel}>Weight</ThemedText>
                    <ThemedText style={styles.setsHeaderLabel}>RPE</ThemedText>
                    <ThemedText style={styles.setsHeaderLabel}>PR</ThemedText>
                  </View>
                  {sets.map((set) => (
                    <View key={set.id} style={styles.setRow}>
                      <ThemedText style={styles.setCell}>
                        {set.set_number}
                      </ThemedText>
                      <ThemedText style={styles.setCell}>
                        {set.reps}
                      </ThemedText>
                      <ThemedText style={styles.setCell}>
                        {set.weight}kg
                      </ThemedText>
                      <ThemedText style={styles.setCell}>
                        {set.rpe ?? '-'}
                      </ThemedText>
                      <ThemedText style={styles.setCellPr}>
                        {set.is_pr ? '🏆' : ''}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              )}

              {/* Set input form */}
              <View style={styles.setForm}>
                <View style={styles.formRow}>
                  <View style={styles.formField}>
                    <ThemedText style={styles.formLabel}>Reps</ThemedText>
                    <TextInput
                      style={styles.formInput}
                      value={form.reps}
                      onChangeText={(v) =>
                        handleFormChange(exerciseId, 'reps', v)
                      }
                      keyboardType="numeric"
                      accessibilityLabel="Reps"
                    />
                  </View>
                  <View style={styles.formField}>
                    <ThemedText style={styles.formLabel}>Weight</ThemedText>
                    <TextInput
                      style={styles.formInput}
                      value={form.weight}
                      onChangeText={(v) =>
                        handleFormChange(exerciseId, 'weight', v)
                      }
                      keyboardType="numeric"
                      accessibilityLabel="Weight"
                    />
                  </View>
                  <View style={styles.formField}>
                    <ThemedText style={styles.formLabel}>RPE</ThemedText>
                    <TextInput
                      style={styles.formInput}
                      value={form.rpe}
                      onChangeText={(v) =>
                        handleFormChange(exerciseId, 'rpe', v)
                      }
                      keyboardType="numeric"
                      accessibilityLabel="RPE"
                      placeholder="—"
                    />
                  </View>
                </View>
                <View style={styles.notesRow}>
                  <TextInput
                    style={styles.notesInput}
                    value={form.notes}
                    onChangeText={(v) =>
                      handleFormChange(exerciseId, 'notes', v)
                    }
                    placeholder="Notes (optional)"
                    accessibilityLabel="Set notes"
                  />
                </View>

                <View style={styles.formActions}>
                  <Pressable
                    style={styles.addSetButton}
                    onPress={() => handleAddSet(exerciseId)}
                    accessibilityRole="button"
                    accessibilityLabel={`Log set for ${item.exercises.name}`}
                  >
                    <ThemedText style={styles.addSetButtonText}>
                      + Log Set {sets.length + 1}
                    </ThemedText>
                  </Pressable>

                  {hasTimer && !isTimerActive && (
                    <Pressable
                      style={styles.timerButton}
                      onPress={() =>
                        handleStartTimer(exerciseId, item.timer_config!)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Start timer for ${item.exercises.name}`}
                    >
                      <ThemedText style={styles.timerButtonText}>
                        ⏱ Start Timer
                      </ThemedText>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          );
        })}

        {/* Complete session button */}
        {totalSetsLogged > 0 && (
          <Pressable
            style={styles.completeButton}
            onPress={handleCompleteSession}
            accessibilityRole="button"
            accessibilityLabel="Complete session"
          >
            <ThemedText style={styles.completeButtonText}>
              Complete Session
            </ThemedText>
          </Pressable>
        )}
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
    paddingBottom: 100,
  },
  sessionHeader: {
    gap: Spacing.one,
  },
  dayTitle: {
    fontSize: 22,
  },
  errorTitle: {
    fontSize: 22,
    marginBottom: Spacing.two,
  },
  // Timer display
  activeTimerSection: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  timerContainer: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  timerHeader: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  timerPhaseLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369a1',
    letterSpacing: 1,
  },
  timerRound: {
    fontSize: 12,
    color: '#0369a1',
    fontWeight: '500',
  },
  timerTimeRow: {
    alignItems: 'center',
  },
  timerCountdown: {
    fontSize: 36,
    fontWeight: '700',
    color: '#0c4a6e',
  },
  timerElapsed: {
    fontSize: 12,
    color: '#6b7280',
  },
  stopTimerButton: {
    backgroundColor: '#ef4444',
    paddingVertical: Spacing.two,
    borderRadius: 8,
    alignItems: 'center',
  },
  stopTimerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Exercise card
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
  targetInfo: {
    fontSize: 12,
    color: '#6b7280',
  },
  // Logged sets list
  setsListContainer: {
    gap: Spacing.one,
  },
  setsHeader: {
    flexDirection: 'row',
    paddingVertical: Spacing.one,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  setsHeaderLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  setRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.one,
  },
  setCell: {
    flex: 1,
    fontSize: 14,
    textAlign: 'center',
    color: '#374151',
  },
  setCellPr: {
    flex: 1,
    fontSize: 14,
    textAlign: 'center',
  },
  // Set input form
  setForm: {
    gap: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: Spacing.two,
  },
  formRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  formField: {
    flex: 1,
    gap: 2,
  },
  formLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
  },
  notesRow: {
    gap: 2,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 14,
    color: '#374151',
  },
  formActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  addSetButton: {
    flex: 1,
    backgroundColor: '#3c87f7',
    paddingVertical: Spacing.two,
    borderRadius: 8,
    alignItems: 'center',
  },
  addSetButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  timerButton: {
    backgroundColor: '#f0f9ff',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
    alignItems: 'center',
  },
  timerButtonText: {
    color: '#0369a1',
    fontSize: 14,
    fontWeight: '600',
  },
  // Complete session
  completeButton: {
    backgroundColor: '#10b981',
    paddingVertical: Spacing.three,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
