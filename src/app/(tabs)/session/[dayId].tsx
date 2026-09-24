/**
 * Active session logging screen.
 * Loads a program day's exercises, allows logging sets with auto-fill,
 * detects PRs in real-time, and displays active timer UI.
 * Supports tap-to-edit, swipe-to-delete with undo, and haptic feedback.
 * Auto-starts rest timer after set logging when configured (Req 15.1, 15.2, 15.3).
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3, 14.1, 14.2, 14.3, 15.1, 15.2, 15.3, 18.1, 20.3
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
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LoggedSetRow, type LoggedSetRowData } from '@/components/LoggedSetRow';
import { SetEditModal, type SetEditData } from '@/components/SetEditModal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { UndoToast } from '@/components/UndoToast';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useAuth } from '@/providers/AuthProvider';
import {
    AutoFillSource,
    getAutoFillValues,
    getIntraSessionFill,
} from '@/services/auto-fill';
import * as haptics from '@/services/haptics';
import { detectPR, ExerciseHistory, PRResult } from '@/services/pr-detection';
import { removeProgramDayItem, updateProgramDayItem } from '@/services/program-day-item-manager';
import { triggerSessionInsight } from '@/services/session-insight';
import {
    startTimer,
    TimerController,
    TimerState
} from '@/services/timer';
import { useCadenceStore } from '@/store';
import type { ProgramDayItem, TimerConfig } from '@/types/program';
import type { LoggedSet, Session } from '@/types/session';
import { supabase } from '@/utils/supabase';

// --- Local types ---

interface ExerciseData {
  id: string;
  name: string;
  primary_muscle_group: string;
  category: string | null;
  equipment: string | null;
  force: string | null;
}

/**
 * How an exercise is logged, derived from its catalog metadata:
 *  - 'cardio'     → distance + duration (running, rowing, ...). category = 'cardio'.
 *  - 'timed'      → a single duration in seconds, no reps/weight (planks,
 *                   wall sits, stretches). force = 'static'.
 *  - 'bodyweight' → reps only, no external weight (pushups, pull-ups, ...).
 *                   equipment = 'bodyweight' (and not static/cardio).
 *  - 'weighted'   → reps + weight (the default for barbell/dumbbell/machine work).
 */
type LoggingMode = 'cardio' | 'timed' | 'bodyweight' | 'weighted';

function getLoggingMode(exercise: ExerciseData | null): LoggingMode {
  if (!exercise) return 'weighted';
  if (exercise.category === 'cardio') return 'cardio';
  if (exercise.force === 'static') return 'timed';
  if (exercise.equipment === 'bodyweight') return 'bodyweight';
  return 'weighted';
}

/** True when an exercise is logged by distance + duration (running, etc.). */
function isCardio(exercise: ExerciseData | null): boolean {
  return getLoggingMode(exercise) === 'cardio';
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
  /** Cardio only: distance covered, in meters. */
  distanceMeters?: number | null;
  /** Cardio only: duration, in seconds. */
  durationSeconds?: number | null;
}

interface SetFormState {
  reps: string;
  weight: string;
  rpe: string;
  notes: string;
  /** Cardio only: distance in km, as entered. */
  distanceKm: string;
  /** Cardio only: duration in minutes, as entered. */
  durationMin: string;
  /** Timed/static only: hold duration in seconds, as entered. */
  durationSec: string;
}

// --- Timer Display Component ---

function TimerDisplay({ timerState }: { timerState: TimerState }) {
  const theme = useTheme();
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.timerContainer}>
      <View style={styles.timerHeader}>
        <ThemedText style={[styles.timerPhaseLabel, { color: theme.timerText }]}>
          {timerState.phase.toUpperCase()}
        </ThemedText>
        {timerState.total_rounds > 1 && (
          <ThemedText style={[styles.timerRound, { color: theme.timerText }]}>
            Round {timerState.current_round}/{timerState.total_rounds}
          </ThemedText>
        )}
      </View>
      <View style={styles.timerTimeRow}>
        {timerState.type !== 'duration' ? (
          <ThemedText type="monoLarge" style={{ color: theme.timerText }}>
            {formatTime(timerState.remaining_seconds)}
          </ThemedText>
        ) : (
          <ThemedText type="monoLarge" style={{ color: theme.timerText }}>
            {formatTime(timerState.elapsed_seconds)}
          </ThemedText>
        )}
      </View>
      <ThemedText style={{ fontSize: 12, color: theme.textSecondary }}>
        Elapsed: {formatTime(timerState.elapsed_seconds)}
      </ThemedText>
    </View>
  );
}

// --- Cardio Set Row ---

/** Format a duration in seconds as mm:ss. */
function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Render a single logged cardio set: number, distance, duration, derived pace. */
function CardioSetRow({
  set,
  theme,
}: {
  set: SetEntry;
  theme: ReturnType<typeof useTheme>;
}) {
  const distanceMeters = set.distanceMeters ?? null;
  const durationSeconds = set.durationSeconds ?? null;

  const distanceLabel =
    distanceMeters != null && distanceMeters > 0
      ? `${(distanceMeters / 1000).toFixed(2)} km`
      : '—';

  const durationLabel =
    durationSeconds != null && durationSeconds > 0
      ? formatDuration(durationSeconds)
      : '—';

  // Pace = minutes per km, only meaningful when both are present.
  let paceLabel = '—';
  if (
    distanceMeters != null &&
    distanceMeters > 0 &&
    durationSeconds != null &&
    durationSeconds > 0
  ) {
    const distanceKm = distanceMeters / 1000;
    const paceMinPerKm = durationSeconds / 60 / distanceKm;
    const paceMin = Math.floor(paceMinPerKm);
    const paceSec = Math.round((paceMinPerKm - paceMin) * 60);
    paceLabel = `${paceMin}:${paceSec.toString().padStart(2, '0')}/km`;
  }

  return (
    <View style={styles.cardioSetRow}>
      <ThemedText style={[styles.cardioSetCell, { color: theme.textSecondary }]}>
        {set.set_number}
      </ThemedText>
      <ThemedText style={[styles.cardioSetCell, { color: theme.text }]}>
        {distanceLabel}
      </ThemedText>
      <ThemedText style={[styles.cardioSetCell, { color: theme.text }]}>
        {durationLabel}
      </ThemedText>
      <ThemedText style={[styles.cardioSetCell, { color: theme.textSecondary }]}>
        {paceLabel}
      </ThemedText>
    </View>
  );
}

// --- Timed Set Row ---

/** Render a single logged timed/static set: set number + hold duration (mm:ss). */
function TimedSetRow({
  set,
  theme,
}: {
  set: SetEntry;
  theme: ReturnType<typeof useTheme>;
}) {
  const durationSeconds = set.durationSeconds ?? null;
  const durationLabel =
    durationSeconds != null && durationSeconds > 0
      ? formatDuration(durationSeconds)
      : '—';

  return (
    <View style={styles.cardioSetRow}>
      <ThemedText style={[styles.cardioSetCell, { color: theme.textSecondary }]}>
        {set.set_number}
      </ThemedText>
      <ThemedText style={[styles.cardioSetCell, { color: theme.text }]}>
        {durationLabel}
      </ThemedText>
    </View>
  );
}

// --- Main Screen Component ---

export default function SessionLoggingScreen() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const router = useRouter();

  // User settings (rest timer auto-start preference) — Req 15.2
  const { settings: userSettings } = useUserSettings();

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
  // Per-exercise inline validation error (web-safe — Alert.alert is a no-op on
  // web, so failed validation is surfaced inline under the form instead).
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

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

  // Edit modal state
  const [editingSet, setEditingSet] = useState<{
    set: SetEntry;
    exerciseId: string;
    exerciseName: string;
  } | null>(null);

  // Undo toast state
  const [undoState, setUndoState] = useState<{
    visible: boolean;
    deletedSet: SetEntry | null;
    exerciseId: string;
    exerciseName: string;
  }>({ visible: false, deletedSet: null, exerciseId: '', exerciseName: '' });

  // Exercise instance edit state (Requirements 4.3, 4.4, 4.6, 4.7, 4.8) — the
  // planned target_sets/target_reps for a program_day_items row, distinct
  // from the per-set logging above. Editing here never touches the shared
  // catalog exercise (item.exercises).
  const { session: authSession } = useAuth();
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEditDraft, setItemEditDraft] = useState({ targetSets: '', targetReps: '' });
  const [isSavingItemEdit, setIsSavingItemEdit] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);

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
            exercises (id, name, primary_muscle_group, category, equipment, force)
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
        distanceKm: '',
        durationMin: '',
        durationSec: '',
      };
    }

    setAutoFillValues(fills);
    setFormStates(forms);

    // Initialize session in the database
    initializeSession();
  }, [day, previousSessions, fetchExerciseHistories, initializeSession]);

  // --- Handlers ---

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

  const handleAddSet = useCallback(
    (exerciseId: string) => {
      const form = formStates[exerciseId];
      if (!form) return;

      const dayItem = day?.program_day_items.find((i) => i.exercise_id === exerciseId);
      const mode = getLoggingMode(dayItem?.exercises ?? null);

      const existingSets = loggedSets[exerciseId] || [];
      const setNumber = existingSets.length + 1;

      // ── Timed/static path: duration in seconds only, no reps/weight/PR ──────
      if (mode === 'timed') {
        const durationSeconds = parseInt(form.durationSec, 10) || 0;

        if (durationSeconds <= 0) {
          setFormErrors((prev) => ({
            ...prev,
            [exerciseId]: 'Enter a hold duration in seconds greater than zero.',
          }));
          return;
        }
        setFormErrors((prev) => ({ ...prev, [exerciseId]: '' }));

        const newSet: SetEntry = {
          id: `${exerciseId}-set-${setNumber}`,
          exercise_id: exerciseId,
          set_number: setNumber,
          reps: 0,
          weight: 0,
          rpe: undefined,
          notes: form.notes,
          is_pr: false,
          pr_type: null,
          isManualOverride: false,
          durationSeconds,
        };

        setLoggedSets((prev) => ({ ...prev, [exerciseId]: [...existingSets, newSet] }));
        haptics.setLogged();

        setFormStates((prev) => ({
          ...prev,
          [exerciseId]: { ...prev[exerciseId], durationSec: '', notes: '' },
        }));

        if (sessionId) {
          supabase
            .from('logged_sets')
            .insert({
              session_id: sessionId,
              exercise_id: exerciseId,
              set_number: setNumber,
              reps: 0,
              weight: 0,
              actual_duration_seconds: durationSeconds,
              notes: form.notes || null,
              is_pr: false,
              logged_at: new Date().toISOString(),
            } as never)
            .then(({ error }) => {
              if (error) {
                console.error('Failed to persist timed set:', error.message);
              }
            });
        }

        return;
      }

      // ── Bodyweight path: reps only, no external weight ──────────────────────
      if (mode === 'bodyweight') {
        const reps = parseInt(form.reps, 10) || 0;
        const rpe = form.rpe ? parseFloat(form.rpe) : undefined;

        if (reps <= 0) {
          setFormErrors((prev) => ({
            ...prev,
            [exerciseId]: 'Reps must be greater than zero.',
          }));
          return;
        }
        setFormErrors((prev) => ({ ...prev, [exerciseId]: '' }));

        // PR detection still applies to bodyweight reps (weight is 0, so rep PRs).
        const history = exerciseHistories[exerciseId] || {
          exercise_id: exerciseId,
          sets: [],
        };
        const prResult = detectPR({ reps, weight: 0 }, history);

        const newSet: SetEntry = {
          id: `${exerciseId}-set-${setNumber}`,
          exercise_id: exerciseId,
          set_number: setNumber,
          reps,
          weight: 0,
          rpe,
          notes: form.notes,
          is_pr: prResult.is_pr,
          pr_type: prResult.pr_type,
          isManualOverride: false,
        };

        const updatedSets = [...existingSets, newSet];
        setLoggedSets((prev) => ({ ...prev, [exerciseId]: updatedSets }));

        if (prResult.is_pr) {
          setPrResults((prev) => ({
            ...prev,
            [`${exerciseId}-${setNumber}`]: prResult,
          }));
          haptics.prAchieved();
        }
        haptics.setLogged();

        setExerciseHistories((prev) => ({
          ...prev,
          [exerciseId]: {
            exercise_id: exerciseId,
            sets: [...(prev[exerciseId]?.sets || []), { reps, weight: 0 }],
          },
        }));

        // Intra-session fill for the next set (reps only).
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
              ...prev[exerciseId],
              reps: intraFill.reps.toString(),
              rpe: intraFill.rpe?.toString() ?? '',
              notes: '',
            },
          }));
        }

        if (sessionId) {
          supabase
            .from('logged_sets')
            .insert({
              session_id: sessionId,
              exercise_id: exerciseId,
              set_number: setNumber,
              reps,
              weight: 0,
              rpe,
              notes: form.notes || null,
              is_pr: prResult.is_pr,
              pr_type: prResult.pr_type || null,
              logged_at: new Date().toISOString(),
            } as never)
            .then(({ error }) => {
              if (error) {
                console.error('Failed to persist bodyweight set:', error.message);
              }
            });
        }

        // Auto-start rest timer if configured.
        if (userSettings.rest_timer_auto_start && day) {
          const di = day.program_day_items.find((i) => i.exercise_id === exerciseId);
          if (
            di?.timer_config &&
            di.timer_config.type === 'rest' &&
            (di.timer_config.rest_seconds ?? 0) > 0
          ) {
            handleStartTimer(exerciseId, di.timer_config);
          }
        }

        return;
      }

      // ── Cardio path: distance + duration, no reps/weight/PR ─────────────────
      if (mode === 'cardio') {
        const distanceKm = parseFloat(form.distanceKm) || 0;
        const durationMin = parseFloat(form.durationMin) || 0;

        if (distanceKm <= 0 && durationMin <= 0) {
          setFormErrors((prev) => ({
            ...prev,
            [exerciseId]: 'Enter a distance and/or a duration greater than zero.',
          }));
          return;
        }
        setFormErrors((prev) => ({ ...prev, [exerciseId]: '' }));

        const distanceMeters = distanceKm > 0 ? Math.round(distanceKm * 1000) : null;
        const durationSeconds = durationMin > 0 ? Math.round(durationMin * 60) : null;

        const newSet: SetEntry = {
          id: `${exerciseId}-set-${setNumber}`,
          exercise_id: exerciseId,
          set_number: setNumber,
          reps: 0,
          weight: 0,
          rpe: undefined,
          notes: form.notes,
          is_pr: false,
          pr_type: null,
          isManualOverride: false,
          distanceMeters,
          durationSeconds,
        };

        setLoggedSets((prev) => ({ ...prev, [exerciseId]: [...existingSets, newSet] }));
        haptics.setLogged();

        // Reset the entry fields for the next interval (keep any notes cleared).
        setFormStates((prev) => ({
          ...prev,
          [exerciseId]: { ...prev[exerciseId], distanceKm: '', durationMin: '', notes: '' },
        }));

        if (sessionId) {
          supabase
            .from('logged_sets')
            .insert({
              session_id: sessionId,
              exercise_id: exerciseId,
              set_number: setNumber,
              reps: 0,
              weight: 0,
              distance_meters: distanceMeters,
              actual_duration_seconds: durationSeconds,
              notes: form.notes || null,
              is_pr: false,
              logged_at: new Date().toISOString(),
            } as never)
            .then(({ error }) => {
              if (error) {
                console.error('Failed to persist cardio set:', error.message);
              }
            });
        }

        return;
      }

      // ── Strength path: reps + weight, with PR detection ─────────────────────
      const reps = parseInt(form.reps, 10) || 0;
      const weight = parseFloat(form.weight) || 0;
      const rpe = form.rpe ? parseFloat(form.rpe) : undefined;

      if (reps <= 0 || weight <= 0) {
        setFormErrors((prev) => ({
          ...prev,
          [exerciseId]: 'Reps and weight must be greater than zero.',
        }));
        return;
      }
      setFormErrors((prev) => ({ ...prev, [exerciseId]: '' }));

      // Check for PR
      const history = exerciseHistories[exerciseId] || {
        exercise_id: exerciseId,
        sets: [],
      };
      const prResult = detectPR({ reps, weight }, history);

      // Create the set entry
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
        // Trigger PR haptic feedback (Req 14.1)
        haptics.prAchieved();
      }

      // Trigger set logged haptic feedback (Req 14.2)
      haptics.setLogged();

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
            ...prev[exerciseId],
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

      // Auto-start rest timer if enabled and exercise has a rest timer configured (Req 15.1, 15.2, 15.3)
      if (userSettings.rest_timer_auto_start && day) {
        const dayItem = day.program_day_items.find(
          (item) => item.exercise_id === exerciseId
        );
        if (
          dayItem?.timer_config &&
          dayItem.timer_config.type === 'rest' &&
          (dayItem.timer_config.rest_seconds ?? 0) > 0
        ) {
          handleStartTimer(exerciseId, dayItem.timer_config);
        }
      }
    },
    [formStates, loggedSets, exerciseHistories, sessionId, userSettings.rest_timer_auto_start, day, handleStartTimer]
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

  // --- Set Edit Handler (Req 9.1, 9.2) ---

  const handleEditSet = useCallback(
    (set: LoggedSetRowData, exerciseId: string, exerciseName: string) => {
      // Find the full set entry
      const exerciseSets = loggedSets[exerciseId] || [];
      const fullSet = exerciseSets.find((s) => s.id === set.id);
      if (!fullSet) return;

      setEditingSet({ set: fullSet, exerciseId, exerciseName });
    },
    [loggedSets]
  );

  const handleSaveEdit = useCallback(
    (data: SetEditData) => {
      if (!editingSet) return;

      const { set: editedSet, exerciseId } = editingSet;
      const repsChanged = data.reps !== editedSet.reps;
      const weightChanged = data.weight !== editedSet.weight;

      // Update the logged sets locally
      setLoggedSets((prev) => {
        const exerciseSets = prev[exerciseId] || [];
        return {
          ...prev,
          [exerciseId]: exerciseSets.map((s) =>
            s.id === editedSet.id
              ? {
                  ...s,
                  reps: data.reps,
                  weight: data.weight,
                  rpe: data.rpe ?? undefined,
                  notes: data.notes ?? '',
                }
              : s
          ),
        };
      });

      // Re-run PR detection if reps or weight changed (Req 9.2)
      if (repsChanged || weightChanged) {
        const history = exerciseHistories[exerciseId] || {
          exercise_id: exerciseId,
          sets: [],
        };

        // Rebuild history excluding the edited set's old values, add new values
        const updatedHistorySets = history.sets
          .filter(
            (s) => !(s.reps === editedSet.reps && s.weight === editedSet.weight)
          )
          .concat({ reps: data.reps, weight: data.weight });

        const updatedHistory: ExerciseHistory = {
          exercise_id: exerciseId,
          sets: updatedHistorySets,
        };

        // Re-detect PR for the edited set
        const prResult = detectPR({ reps: data.reps, weight: data.weight }, {
          exercise_id: exerciseId,
          sets: updatedHistorySets.filter(
            (s) => !(s.reps === data.reps && s.weight === data.weight)
          ),
        });

        // Update the set's PR status
        setLoggedSets((prev) => {
          const exerciseSets = prev[exerciseId] || [];
          return {
            ...prev,
            [exerciseId]: exerciseSets.map((s) =>
              s.id === editedSet.id
                ? { ...s, is_pr: prResult.is_pr, pr_type: prResult.pr_type }
                : s
            ),
          };
        });

        // Update exercise history
        setExerciseHistories((prev) => ({
          ...prev,
          [exerciseId]: updatedHistory,
        }));

        // If PR detected, trigger haptic (Req 14.1)
        if (prResult.is_pr) {
          haptics.prAchieved();
        }
      }

      // Persist edit to store and Supabase
      if (sessionId) {
        const storeUpdates: { reps?: number; weight?: number; rpe?: number | null; notes?: string | null } = {};
        if (repsChanged) storeUpdates.reps = data.reps;
        if (weightChanged) storeUpdates.weight = data.weight;
        if (data.rpe !== editedSet.rpe) storeUpdates.rpe = data.rpe;
        if (data.notes !== editedSet.notes) storeUpdates.notes = data.notes;

        useCadenceStore.getState().editSet(editedSet.id, sessionId, storeUpdates);

        supabase
          .from('logged_sets')
          .update({
            reps: data.reps,
            weight: data.weight,
            rpe: data.rpe,
            notes: data.notes,
            is_pr: false, // Will be recalculated
          } as never)
          .eq('id', editedSet.id)
          .then(({ error }) => {
            if (error) {
              console.error('Failed to persist set edit:', error.message);
            }
          });
      }

      setEditingSet(null);
    },
    [editingSet, exerciseHistories, sessionId]
  );

  // --- Set Delete Handler (Req 9.3, 9.4, 9.5) ---

  const handleDeleteSet = useCallback(
    (set: LoggedSetRowData, exerciseId: string, exerciseName: string) => {
      const exerciseSets = loggedSets[exerciseId] || [];
      const fullSet = exerciseSets.find((s) => s.id === set.id);
      if (!fullSet) return;

      // Trigger haptic feedback (Req 14.3)
      haptics.setDeleted();

      // Remove set and re-number (Req 9.4)
      const updatedSets = exerciseSets
        .filter((s) => s.id !== set.id)
        .map((s, idx) => ({ ...s, set_number: idx + 1 }));

      setLoggedSets((prev) => ({
        ...prev,
        [exerciseId]: updatedSets,
      }));

      // Persist deletion to store
      if (sessionId) {
        useCadenceStore.getState().deleteSet(set.id, sessionId, exerciseId);

        supabase
          .from('logged_sets')
          .delete()
          .eq('id', set.id)
          .then(({ error }) => {
            if (error) {
              console.error('Failed to persist set deletion:', error.message);
            }
          });
      }

      // Show undo toast (Req 9.5)
      setUndoState({
        visible: true,
        deletedSet: fullSet,
        exerciseId,
        exerciseName,
      });
    },
    [loggedSets, sessionId]
  );

  const handleUndoDelete = useCallback(() => {
    if (!undoState.deletedSet) return;

    const { deletedSet, exerciseId } = undoState;

    // Re-add the set at the correct position
    setLoggedSets((prev) => {
      const exerciseSets = prev[exerciseId] || [];
      // Insert at original set number position
      const newSets = [...exerciseSets];
      newSets.splice(deletedSet.set_number - 1, 0, deletedSet);
      // Re-number sequentially
      const renumbered = newSets.map((s, idx) => ({ ...s, set_number: idx + 1 }));
      return { ...prev, [exerciseId]: renumbered };
    });

    // Re-add to store via logSet
    if (sessionId) {
      useCadenceStore.getState().logSet(sessionId, exerciseId, {
        reps: deletedSet.reps,
        weight: deletedSet.weight,
        rpe: deletedSet.rpe,
        notes: deletedSet.notes,
      });

      // Re-persist to Supabase
      supabase
        .from('logged_sets')
        .insert({
          id: deletedSet.id,
          session_id: sessionId,
          exercise_id: exerciseId,
          set_number: deletedSet.set_number,
          reps: deletedSet.reps,
          weight: deletedSet.weight,
          rpe: deletedSet.rpe ?? null,
          notes: deletedSet.notes || null,
          is_pr: deletedSet.is_pr,
          pr_type: deletedSet.pr_type || null,
          logged_at: new Date().toISOString(),
        } as never)
        .then(({ error }) => {
          if (error) {
            console.error('Failed to restore deleted set:', error.message);
          }
        });
    }

    // Dismiss toast
    setUndoState({ visible: false, deletedSet: null, exerciseId: '', exerciseName: '' });
  }, [undoState, sessionId]);

  const handleDismissUndo = useCallback(() => {
    setUndoState({ visible: false, deletedSet: null, exerciseId: '', exerciseName: '' });
  }, []);

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

    // Stop any running timer
    if (timerControllerRef.current) {
      timerControllerRef.current.stop();
      timerControllerRef.current = null;
      setActiveTimerExercise(null);
      setTimerState(null);
    }

    try {
      // Persist to Local_WAL via the store (Req 2.1)
      const { completeSession } = useCadenceStore.getState();
      completeSession(sessionId);

      // Also update Supabase directly for immediate consistency
      const completedAt = new Date().toISOString();
      const durationSeconds = Math.round(
        (new Date(completedAt).getTime() - new Date(sessionStartedAt).getTime()) / 1000
      );

      await supabase
        .from('sessions')
        .update({
          status: 'completed',
          completed_at: completedAt,
          total_duration_seconds: durationSeconds,
        } as never)
        .eq('id', sessionId);

      // Fire-and-forget proactive coach insight (approval-gated; never blocks navigation).
      void triggerSessionInsight(sessionId);

      // Navigate to Summary Screen with session ID (Req 2.1)
      router.replace(`/(tabs)/session/summary/${sessionId}`);
    } catch (err) {
      console.error('Error completing session:', err);
      Alert.alert('Error', 'Failed to complete session. Please try again.');
    }
  }, [sessionId, sessionStartedAt, router]);

  // --- Exercise instance edit/remove handlers (Requirements 4.3, 4.4, 4.6, 4.7, 4.8) ---

  const startEditingItem = useCallback((item: DayItemData) => {
    setItemEditDraft({
      targetSets: String(item.target_sets),
      targetReps: item.target_reps,
    });
    setEditingItemId(item.id);
  }, []);

  const cancelEditingItem = useCallback(() => {
    setEditingItemId(null);
  }, []);

  const saveItemEdit = useCallback(async () => {
    if (!editingItemId || !authSession?.user.id) return;

    const targetSets = parseInt(itemEditDraft.targetSets, 10);
    if (!targetSets || targetSets <= 0) {
      Alert.alert('Invalid Target', 'Target sets must be a positive number.');
      return;
    }
    if (!itemEditDraft.targetReps.trim()) {
      Alert.alert('Invalid Target', 'Target reps is required.');
      return;
    }

    setIsSavingItemEdit(true);
    try {
      await updateProgramDayItem(supabase, authSession.user.id, editingItemId, {
        target_sets: targetSets,
        target_reps: itemEditDraft.targetReps.trim(),
      });

      // Reflect the change locally without a full re-fetch.
      setDay((prev) =>
        prev
          ? {
              ...prev,
              program_day_items: prev.program_day_items.map((i) =>
                i.id === editingItemId
                  ? { ...i, target_sets: targetSets, target_reps: itemEditDraft.targetReps.trim() }
                  : i
              ),
            }
          : prev
      );

      setEditingItemId(null);
    } catch (err) {
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : 'Could not update this exercise. Please try again.'
      );
    } finally {
      setIsSavingItemEdit(false);
    }
  }, [editingItemId, authSession?.user.id, itemEditDraft]);

  const runRemoveItem = useCallback(
    async (itemId: string) => {
      if (!authSession?.user.id) return;
      setRemovingItemId(itemId);
      try {
        await removeProgramDayItem(supabase, authSession.user.id, itemId);
        setDay((prev) =>
          prev
            ? { ...prev, program_day_items: prev.program_day_items.filter((i) => i.id !== itemId) }
            : prev
        );
      } catch (err) {
        Alert.alert(
          'Remove failed',
          err instanceof Error
            ? err.message
            : 'Could not remove this exercise. It remains in today\u2019s plan.'
        );
      } finally {
        setRemovingItemId(null);
      }
    },
    [authSession?.user.id]
  );

  const handleRemoveItem = useCallback(
    (item: DayItemData) => {
      Alert.alert(
        `Remove ${item.exercises?.name ?? 'this exercise'}?`,
        'This removes it from today\u2019s plan. Any sets already logged for it are kept.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => runRemoveItem(item.id) },
        ]
      );
    },
    [runRemoveItem]
  );

  // --- Render ---

  const theme = useTheme();

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
    <GestureHandlerRootView style={styles.container}>
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
          <View style={[styles.activeTimerSection, { backgroundColor: theme.timerBackground, borderColor: theme.timerBorder }]}>
            <TimerDisplay timerState={timerState} />
            <Pressable
              style={[styles.stopTimerButton, { backgroundColor: theme.error }]}
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
            distanceKm: '',
            durationMin: '',
            durationSec: '',
          };
          const mode = getLoggingMode(item.exercises);
          const cardio = mode === 'cardio';
          const formError = formErrors[exerciseId];
          const hasTimer =
            item.timer_config && item.timer_config.type !== 'none';
          const isTimerActive = activeTimerExercise === exerciseId;

          return (
            <View key={item.id} style={[styles.exerciseCard, { borderColor: theme.border, backgroundColor: theme.backgroundElevated }]}>
              {/* Exercise header */}
              <View style={styles.exerciseHeader}>
                <View style={[styles.orderBadge, { backgroundColor: theme.accent }]}>
                  <ThemedText style={[styles.orderText, { color: theme.accentText }]}>
                    {index + 1}
                  </ThemedText>
                </View>
                <View style={styles.exerciseInfo}>
                  <ThemedText style={[styles.exerciseName, { color: theme.text }]}>
                    {item.exercises.name}
                  </ThemedText>
                  {editingItemId === item.id ? (
                    <View style={styles.itemEditRow}>
                      <TextInput
                        value={itemEditDraft.targetSets}
                        onChangeText={(v) => setItemEditDraft((d) => ({ ...d, targetSets: v }))}
                        keyboardType="numeric"
                        placeholder="Sets"
                        placeholderTextColor={theme.textTertiary}
                        style={[styles.itemEditInput, { color: theme.text, borderColor: theme.border }]}
                        accessibilityLabel={`Target sets for ${item.exercises.name}`}
                      />
                      <ThemedText style={{ color: theme.textSecondary }}>×</ThemedText>
                      <TextInput
                        value={itemEditDraft.targetReps}
                        onChangeText={(v) => setItemEditDraft((d) => ({ ...d, targetReps: v }))}
                        placeholder="Reps"
                        placeholderTextColor={theme.textTertiary}
                        style={[styles.itemEditInput, { color: theme.text, borderColor: theme.border }]}
                        accessibilityLabel={`Target reps for ${item.exercises.name}`}
                      />
                      <Pressable
                        onPress={saveItemEdit}
                        disabled={isSavingItemEdit}
                        accessibilityRole="button"
                        accessibilityLabel="Save target"
                        style={[styles.itemEditSaveBtn, { backgroundColor: theme.accent }]}
                      >
                        {isSavingItemEdit ? (
                          <ActivityIndicator size="small" color={theme.accentText} />
                        ) : (
                          <ThemedText style={{ color: theme.accentText, fontSize: 12, fontWeight: '600' }}>
                            Save
                          </ThemedText>
                        )}
                      </Pressable>
                      <Pressable
                        onPress={cancelEditingItem}
                        disabled={isSavingItemEdit}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel editing target"
                      >
                        <ThemedText style={{ color: theme.textSecondary, fontSize: 12 }}>Cancel</ThemedText>
                      </Pressable>
                    </View>
                  ) : (
                    <ThemedText style={[styles.targetInfo, { color: theme.textSecondary }]}>
                      Target: {item.target_sets}×{item.target_reps}
                      {item.target_weight
                        ? ` @ ${item.target_weight}kg`
                        : ''}
                      {item.target_rpe ? ` RPE ${item.target_rpe}` : ''}
                    </ThemedText>
                  )}
                </View>
                {editingItemId !== item.id && (
                  <View style={styles.itemHeaderActions}>
                    <Pressable
                      onPress={() => startEditingItem(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit target for ${item.exercises.name}`}
                      hitSlop={8}
                      style={styles.itemHeaderActionBtn}
                    >
                      <ThemedText style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>
                        Edit
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => handleRemoveItem(item)}
                      disabled={removingItemId === item.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${item.exercises.name} from today's plan`}
                      hitSlop={8}
                      style={styles.itemHeaderActionBtn}
                    >
                      {removingItemId === item.id ? (
                        <ActivityIndicator size="small" color={theme.error} />
                      ) : (
                        <ThemedText style={{ color: theme.error, fontSize: 12, fontWeight: '600' }}>
                          Remove
                        </ThemedText>
                      )}
                    </Pressable>
                  </View>
                )}
              </View>

              {/* Logged sets list */}
              {sets.length > 0 && mode === 'cardio' && (
                <View style={styles.setsListContainer}>
                  <View style={[styles.setsHeader, { borderBottomColor: theme.border }]}>
                    <ThemedText style={[styles.setsHeaderLabel, { color: theme.textSecondary }]}>Rep</ThemedText>
                    <ThemedText style={[styles.setsHeaderLabel, { color: theme.textSecondary }]}>Distance</ThemedText>
                    <ThemedText style={[styles.setsHeaderLabel, { color: theme.textSecondary }]}>Duration</ThemedText>
                    <ThemedText style={[styles.setsHeaderLabel, { color: theme.textSecondary }]}>Pace</ThemedText>
                  </View>
                  {sets.map((set) => (
                    <CardioSetRow key={set.id} set={set} theme={theme} />
                  ))}
                </View>
              )}
              {sets.length > 0 && mode === 'timed' && (
                <View style={styles.setsListContainer}>
                  <View style={[styles.setsHeader, { borderBottomColor: theme.border }]}>
                    <ThemedText style={[styles.setsHeaderLabel, { color: theme.textSecondary }]}>Set</ThemedText>
                    <ThemedText style={[styles.setsHeaderLabel, { color: theme.textSecondary }]}>Duration</ThemedText>
                  </View>
                  {sets.map((set) => (
                    <TimedSetRow key={set.id} set={set} theme={theme} />
                  ))}
                </View>
              )}
              {sets.length > 0 && (mode === 'weighted' || mode === 'bodyweight') && (
                <View style={styles.setsListContainer}>
                  <View style={[styles.setsHeader, { borderBottomColor: theme.border }]}>
                    <ThemedText style={[styles.setsHeaderLabel, { color: theme.textSecondary }]}>Set</ThemedText>
                    <ThemedText style={[styles.setsHeaderLabel, { color: theme.textSecondary }]}>Reps</ThemedText>
                    {mode === 'weighted' && (
                      <ThemedText style={[styles.setsHeaderLabel, { color: theme.textSecondary }]}>Weight</ThemedText>
                    )}
                    <ThemedText style={[styles.setsHeaderLabel, { color: theme.textSecondary }]}>RPE</ThemedText>
                    <ThemedText style={[styles.setsHeaderLabel, { color: theme.textSecondary }]}>PR</ThemedText>
                  </View>
                  {sets.map((set) => (
                    <LoggedSetRow
                      key={set.id}
                      set={{
                        id: set.id,
                        setNumber: set.set_number,
                        reps: set.reps,
                        weight: set.weight,
                        rpe: set.rpe ?? null,
                        notes: set.notes ?? null,
                        isPr: set.is_pr,
                      }}
                      exerciseName={item.exercises!.name}
                      hideWeight={mode === 'bodyweight'}
                      onEdit={(s) => handleEditSet(s, exerciseId, item.exercises!.name)}
                      onDelete={(s) => handleDeleteSet(s, exerciseId, item.exercises!.name)}
                    />
                  ))}
                </View>
              )}

              {/* Set input form */}
              <View style={[styles.setForm, { borderTopColor: theme.borderSubtle }]}>
                {mode === 'cardio' ? (
                  <View style={styles.formRow}>
                    <View style={styles.formField}>
                      <ThemedText style={[styles.formLabel, { color: theme.textSecondary }]}>Distance (km)</ThemedText>
                      <TextInput
                        style={[styles.formInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement }]}
                        value={form.distanceKm}
                        onChangeText={(v) => handleFormChange(exerciseId, 'distanceKm', v)}
                        keyboardType="numeric"
                        accessibilityLabel="Distance in kilometers"
                        placeholder="0"
                        placeholderTextColor={theme.textTertiary}
                      />
                    </View>
                    <View style={styles.formField}>
                      <ThemedText style={[styles.formLabel, { color: theme.textSecondary }]}>Duration (min)</ThemedText>
                      <TextInput
                        style={[styles.formInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement }]}
                        value={form.durationMin}
                        onChangeText={(v) => handleFormChange(exerciseId, 'durationMin', v)}
                        keyboardType="numeric"
                        accessibilityLabel="Duration in minutes"
                        placeholder="0"
                        placeholderTextColor={theme.textTertiary}
                      />
                    </View>
                  </View>
                ) : mode === 'timed' ? (
                  <View style={styles.formRow}>
                    <View style={styles.formField}>
                      <ThemedText style={[styles.formLabel, { color: theme.textSecondary }]}>Duration (sec)</ThemedText>
                      <TextInput
                        style={[styles.formInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement }]}
                        value={form.durationSec}
                        onChangeText={(v) => handleFormChange(exerciseId, 'durationSec', v)}
                        keyboardType="numeric"
                        accessibilityLabel="Hold duration in seconds"
                        placeholder="0"
                        placeholderTextColor={theme.textTertiary}
                      />
                    </View>
                    <View style={styles.formField}>
                      <ThemedText style={[styles.formLabel, { color: theme.textSecondary }]}>RPE</ThemedText>
                      <TextInput
                        style={[styles.formInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement }]}
                        value={form.rpe}
                        onChangeText={(v) => handleFormChange(exerciseId, 'rpe', v)}
                        keyboardType="numeric"
                        accessibilityLabel="RPE"
                        placeholder="—"
                        placeholderTextColor={theme.textTertiary}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.formRow}>
                    <View style={styles.formField}>
                      <ThemedText style={[styles.formLabel, { color: theme.textSecondary }]}>Reps</ThemedText>
                      <TextInput
                        style={[styles.formInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement }]}
                        value={form.reps}
                        onChangeText={(v) =>
                          handleFormChange(exerciseId, 'reps', v)
                        }
                        keyboardType="numeric"
                        accessibilityLabel="Reps"
                      />
                    </View>
                    {mode === 'weighted' && (
                      <View style={styles.formField}>
                        <ThemedText style={[styles.formLabel, { color: theme.textSecondary }]}>Weight</ThemedText>
                        <TextInput
                          style={[styles.formInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement }]}
                          value={form.weight}
                          onChangeText={(v) =>
                            handleFormChange(exerciseId, 'weight', v)
                          }
                          keyboardType="numeric"
                          accessibilityLabel="Weight"
                        />
                      </View>
                    )}
                    <View style={styles.formField}>
                      <ThemedText style={[styles.formLabel, { color: theme.textSecondary }]}>RPE</ThemedText>
                      <TextInput
                        style={[styles.formInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement }]}
                        value={form.rpe}
                        onChangeText={(v) =>
                          handleFormChange(exerciseId, 'rpe', v)
                        }
                        keyboardType="numeric"
                        accessibilityLabel="RPE"
                        placeholder="—"
                        placeholderTextColor={theme.textTertiary}
                      />
                    </View>
                  </View>
                )}
                {formError ? (
                  <ThemedText style={[styles.formErrorText, { color: theme.error }]}>
                    {formError}
                  </ThemedText>
                ) : null}
                <View style={styles.notesRow}>
                  <TextInput
                    style={[styles.notesInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement }]}
                    value={form.notes}
                    onChangeText={(v) =>
                      handleFormChange(exerciseId, 'notes', v)
                    }
                    placeholder="Notes (optional)"
                    placeholderTextColor={theme.textTertiary}
                    accessibilityLabel="Set notes"
                  />
                </View>

                <View style={styles.formActions}>
                  <Pressable
                    style={[styles.addSetButton, { backgroundColor: theme.accent }]}
                    onPress={() => handleAddSet(exerciseId)}
                    accessibilityRole="button"
                    accessibilityLabel={`Log set for ${item.exercises.name}`}
                  >
                    <ThemedText style={[styles.addSetButtonText, { color: theme.accentText }]}>
                      + Log Set {sets.length + 1}
                    </ThemedText>
                  </Pressable>

                  {hasTimer && !isTimerActive && (
                    <Pressable
                      style={[styles.timerButton, { backgroundColor: theme.timerBackground, borderColor: theme.timerBorder }]}
                      onPress={() =>
                        handleStartTimer(exerciseId, item.timer_config!)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Start timer for ${item.exercises.name}`}
                    >
                      <ThemedText style={[styles.timerButtonText, { color: theme.timerText }]}>
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
            style={[styles.completeButton, { backgroundColor: theme.success }]}
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

      {/* Set Edit Modal (Req 9.1) */}
      <SetEditModal
        visible={!!editingSet}
        setNumber={editingSet?.set.set_number ?? 1}
        initialData={{
          reps: editingSet?.set.reps ?? 0,
          weight: editingSet?.set.weight ?? 0,
          rpe: editingSet?.set.rpe ?? null,
          notes: editingSet?.set.notes ?? null,
        }}
        exerciseName={editingSet?.exerciseName ?? ''}
        onSave={handleSaveEdit}
        onCancel={() => setEditingSet(null)}
      />

      {/* Undo Toast (Req 9.5) */}
      <UndoToast
        visible={undoState.visible}
        message="Set deleted"
        onUndo={handleUndoDelete}
        onDismiss={handleDismissUndo}
      />
    </ThemedView>
    </GestureHandlerRootView>
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
    borderRadius: Radii.large,
    padding: Spacing.three,
    gap: Spacing.two,
    borderWidth: 1,
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
    letterSpacing: 1,
  },
  timerRound: {
    fontSize: 12,
    fontWeight: '500',
  },
  timerTimeRow: {
    alignItems: 'center',
  },
  timerCountdown: {
    fontSize: 36,
    fontWeight: '700',
  },
  timerElapsed: {
    fontSize: 12,
  },
  stopTimerButton: {
    paddingVertical: Spacing.two,
    borderRadius: Radii.medium,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  stopTimerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Exercise card
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
  exerciseName: {
    fontWeight: '700',
    fontSize: 15,
  },
  targetInfo: {
    fontSize: 12,
  },
  // Exercise instance edit/remove (Requirements 4.3, 4.4, 4.6, 4.7, 4.8)
  itemHeaderActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  itemHeaderActionBtn: {
    minHeight: 32,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: 2,
  },
  itemEditInput: {
    borderWidth: 1,
    borderRadius: Radii.small,
    paddingHorizontal: Spacing.one,
    paddingVertical: 4,
    fontSize: 13,
    minWidth: 48,
    textAlign: 'center',
  },
  itemEditSaveBtn: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radii.small,
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Logged sets list (header only, rows handled by LoggedSetRow)
  setsListContainer: {
    gap: Spacing.one,
  },
  // Cardio logged-set rows (rendered by CardioSetRow)
  cardioSetRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.one,
  },
  cardioSetCell: {
    flex: 1,
    fontSize: 13,
    textAlign: 'center',
  },
  formErrorText: {
    fontSize: 13,
    marginTop: Spacing.one,
  },
  setsHeader: {
    flexDirection: 'row',
    paddingVertical: Spacing.one,
    borderBottomWidth: 1,
  },
  setsHeaderLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
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
    textTransform: 'uppercase',
  },
  formInput: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    minHeight: 48,
  },
  notesRow: {
    gap: 2,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 14,
    minHeight: 48,
  },
  formActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  addSetButton: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: Radii.medium,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  addSetButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  timerButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.medium,
    borderWidth: 1,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  timerButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Complete session
  completeButton: {
    paddingVertical: Spacing.three,
    borderRadius: Radii.large,
    alignItems: 'center',
    marginTop: Spacing.two,
    minHeight: 48,
    justifyContent: 'center',
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
