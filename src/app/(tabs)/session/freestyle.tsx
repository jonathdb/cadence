/**
 * Freestyle Session Screen — sessions without a Program_Day.
 *
 * Allows users to start a session without selecting a program day,
 * add exercises from the library, remove/skip exercises (only with zero logged sets),
 * reorder exercises, and log sets during the session.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MAX_EXERCISES_PER_SESSION } from '@/lib/validation';
import * as haptics from '@/services/haptics';
import { triggerSessionInsight } from '@/services/session-insight';
import { useCadenceStore, type Exercise } from '@/store/index';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FreestyleExercise {
  id: string;
  exerciseId: string;
  name: string;
  primaryMuscleGroup: string;
  status: 'active' | 'skipped';
  loggedSetsCount: number;
}

interface SetFormState {
  reps: string;
  weight: string;
  rpe: string;
  notes: string;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function FreestyleSessionScreen() {
  const router = useRouter();
  const theme = useTheme();

  // Store access
  const startSession = useCadenceStore((s) => s.startSession);
  const logSet = useCadenceStore((s) => s.logSet);
  const activeSession = useCadenceStore((s) => s.activeSession);
  const exercises = useCadenceStore((s) => s.exercises);

  // Local state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionExercises, setSessionExercises] = useState<FreestyleExercise[]>([]);
  const [formStates, setFormStates] = useState<Record<string, SetFormState>>({});
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);

  // Ref for unique exercise entry IDs
  const entryIdCounter = useRef(0);

  // ─── Initialize freestyle session on mount ─────────────────────────────────

  useEffect(() => {
    // Start a freestyle session (null = no program day)
    const id = startSession(null);
    setSessionId(id);
    setIsInitializing(false);
  }, [startSession]);

  // ─── Computed values ─────────────────────────────────────────────────────────

  const activeExerciseCount = sessionExercises.filter(
    (e) => e.status === 'active'
  ).length;

  const totalSetsLogged = sessionExercises.reduce(
    (sum, e) => sum + e.loggedSetsCount,
    0
  );

  // ─── Exercise Picker Logic ─────────────────────────────────────────────────

  const filteredExercises = useMemo(() => {
    if (!searchQuery.trim()) return exercises.slice(0, 50);
    const query = searchQuery.toLowerCase().trim();
    return exercises
      .filter((e) => e.name.toLowerCase().includes(query))
      .slice(0, 50);
  }, [exercises, searchQuery]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleAddExercise = useCallback(
    (exercise: Exercise) => {
      // Enforce max exercises per session
      if (activeExerciseCount >= MAX_EXERCISES_PER_SESSION) {
        Alert.alert(
          'Exercise Limit Reached',
          `You cannot add more than ${MAX_EXERCISES_PER_SESSION} exercises per session.`
        );
        return;
      }

      entryIdCounter.current += 1;
      const entryId = `freestyle-${exercise.id}-${entryIdCounter.current}`;

      const newEntry: FreestyleExercise = {
        id: entryId,
        exerciseId: exercise.id,
        name: exercise.name,
        primaryMuscleGroup: exercise.primaryMuscleGroup,
        status: 'active',
        loggedSetsCount: 0,
      };

      setSessionExercises((prev) => [...prev, newEntry]);

      // Initialize form state for the new exercise
      setFormStates((prev) => ({
        ...prev,
        [entryId]: { reps: '', weight: '', rpe: '', notes: '' },
      }));

      setIsPickerVisible(false);
      setSearchQuery('');
    },
    [activeExerciseCount]
  );

  const handleRemoveExercise = useCallback((entryId: string) => {
    const exercise = sessionExercises.find((e) => e.id === entryId);
    if (!exercise) return;

    if (exercise.loggedSetsCount > 0) {
      Alert.alert(
        'Cannot Remove',
        'This exercise cannot be removed because it contains logged data. Delete the sets first.'
      );
      return;
    }

    setSessionExercises((prev) => prev.filter((e) => e.id !== entryId));
    setFormStates((prev) => {
      const next = { ...prev };
      delete next[entryId];
      return next;
    });
  }, [sessionExercises]);

  const handleSkipExercise = useCallback((entryId: string) => {
    const exercise = sessionExercises.find((e) => e.id === entryId);
    if (!exercise) return;

    if (exercise.loggedSetsCount > 0) {
      Alert.alert(
        'Cannot Skip',
        'This exercise cannot be skipped because it contains logged data.'
      );
      return;
    }

    setSessionExercises((prev) =>
      prev.map((e) =>
        e.id === entryId ? { ...e, status: 'skipped' as const } : e
      )
    );
  }, [sessionExercises]);

  const handleMoveUp = useCallback((entryId: string) => {
    setSessionExercises((prev) => {
      const idx = prev.findIndex((e) => e.id === entryId);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((entryId: string) => {
    setSessionExercises((prev) => {
      const idx = prev.findIndex((e) => e.id === entryId);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  const handleLogSet = useCallback(
    (entryId: string) => {
      if (!sessionId) return;

      const exercise = sessionExercises.find((e) => e.id === entryId);
      if (!exercise) return;

      const form = formStates[entryId];
      if (!form) return;

      const reps = parseInt(form.reps, 10) || 0;
      const weight = parseFloat(form.weight) || 0;
      const rpe = form.rpe ? parseFloat(form.rpe) : undefined;

      if (reps <= 0) {
        Alert.alert('Invalid Set', 'Reps must be greater than zero.');
        return;
      }

      // Log the set via the store
      logSet(sessionId, exercise.exerciseId, {
        reps,
        weight,
        rpe: rpe ?? null,
        notes: form.notes || null,
      });

      // Trigger haptic feedback on set logged (Req 14.2)
      haptics.setLogged();

      // Update the local exercise sets count
      setSessionExercises((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? { ...e, loggedSetsCount: e.loggedSetsCount + 1 }
            : e
        )
      );

      // Reset form for next set (keep weight/rpe, clear reps)
      setFormStates((prev) => ({
        ...prev,
        [entryId]: { ...prev[entryId], reps: form.reps, notes: '' },
      }));
    },
    [sessionId, sessionExercises, formStates, logSet]
  );

  const handleFormChange = useCallback(
    (entryId: string, field: keyof SetFormState, value: string) => {
      setFormStates((prev) => ({
        ...prev,
        [entryId]: { ...prev[entryId], [field]: value },
      }));
    },
    []
  );

  const handleCompleteSession = useCallback(() => {
    if (!sessionId) return;
    const completeSession = useCadenceStore.getState().completeSession;
    completeSession(sessionId);
    // Fire-and-forget proactive coach insight (approval-gated; never blocks navigation).
    void triggerSessionInsight(sessionId);
    router.back();
  }, [sessionId, router]);

  // ─── Render ────────────────────────────────────────────────────────────────

  if (isInitializing) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
        <ThemedText type="bodyMedium" themeColor="textSecondary">
          Starting freestyle session…
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Session Header */}
        <View style={styles.sessionHeader}>
          <ThemedText type="headlineMedium">Freestyle Session</ThemedText>
          <ThemedText type="bodyMedium" themeColor="textSecondary">
            {activeExerciseCount} exercise{activeExerciseCount !== 1 ? 's' : ''} •{' '}
            {totalSetsLogged} sets logged
          </ThemedText>
        </View>

        {/* Exercise List */}
        {sessionExercises.map((entry, index) => (
          <ExerciseCard
            key={entry.id}
            entry={entry}
            index={index}
            isFirst={index === 0}
            isLast={index === sessionExercises.length - 1}
            form={formStates[entry.id]}
            theme={theme}
            onLogSet={handleLogSet}
            onFormChange={handleFormChange}
            onRemove={handleRemoveExercise}
            onSkip={handleSkipExercise}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
          />
        ))}

        {/* Add Exercise Button */}
        <Pressable
          style={[
            styles.addExerciseButton,
            {
              borderColor: theme.accent,
              backgroundColor: theme.accentSoft,
            },
          ]}
          onPress={() => setIsPickerVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Add exercise to session"
        >
          <ThemedText style={[styles.addExerciseText, { color: theme.accent }]}>
            + Add Exercise
          </ThemedText>
        </Pressable>

        {/* Complete Session Button */}
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

      {/* Exercise Picker Modal */}
      <Modal
        visible={isPickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsPickerVisible(false)}
      >
        <ExercisePickerModal
          exercises={filteredExercises}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelect={handleAddExercise}
          onClose={() => {
            setIsPickerVisible(false);
            setSearchQuery('');
          }}
          theme={theme}
        />
      </Modal>
    </ThemedView>
  );
}

// ─── Exercise Card Component ─────────────────────────────────────────────────

interface ExerciseCardProps {
  entry: FreestyleExercise;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  form: SetFormState | undefined;
  theme: ReturnType<typeof useTheme>;
  onLogSet: (entryId: string) => void;
  onFormChange: (entryId: string, field: keyof SetFormState, value: string) => void;
  onRemove: (entryId: string) => void;
  onSkip: (entryId: string) => void;
  onMoveUp: (entryId: string) => void;
  onMoveDown: (entryId: string) => void;
}

function ExerciseCard({
  entry,
  index,
  isFirst,
  isLast,
  form,
  theme,
  onLogSet,
  onFormChange,
  onRemove,
  onSkip,
  onMoveUp,
  onMoveDown,
}: ExerciseCardProps) {
  const isSkipped = entry.status === 'skipped';

  return (
    <View
      style={[
        styles.exerciseCard,
        {
          borderColor: isSkipped ? theme.borderSubtle : theme.border,
          backgroundColor: isSkipped
            ? theme.backgroundSubtle
            : theme.backgroundElevated,
          opacity: isSkipped ? 0.6 : 1,
        },
      ]}
      accessibilityLabel={`Exercise ${index + 1}: ${entry.name}${isSkipped ? ', skipped' : ''}`}
    >
      {/* Exercise Header */}
      <View style={styles.exerciseHeader}>
        <View style={[styles.orderBadge, { backgroundColor: theme.accent }]}>
          <ThemedText style={[styles.orderText, { color: theme.accentText }]}>{index + 1}</ThemedText>
        </View>
        <View style={styles.exerciseInfo}>
          <ThemedText style={[styles.exerciseName, { color: theme.text }]}>
            {entry.name}
          </ThemedText>
          <ThemedText style={{ fontSize: 12, color: theme.textSecondary }}>
            {entry.primaryMuscleGroup}
            {isSkipped ? ' • Skipped' : ''}
            {entry.loggedSetsCount > 0
              ? ` • ${entry.loggedSetsCount} set${entry.loggedSetsCount !== 1 ? 's' : ''}`
              : ''}
          </ThemedText>
        </View>
      </View>

      {/* Action Buttons Row */}
      <View style={styles.actionsRow}>
        {/* Reorder Controls */}
        <View style={styles.reorderControls}>
          <Pressable
            style={[styles.reorderButton, { backgroundColor: theme.backgroundElement }]}
            onPress={() => onMoveUp(entry.id)}
            disabled={isFirst}
            accessibilityRole="button"
            accessibilityLabel={`Move ${entry.name} up`}
          >
            <ThemedText
              style={[
                styles.reorderIcon,
                { color: isFirst ? theme.textTertiary : theme.text },
              ]}
            >
              ↑
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.reorderButton, { backgroundColor: theme.backgroundElement }]}
            onPress={() => onMoveDown(entry.id)}
            disabled={isLast}
            accessibilityRole="button"
            accessibilityLabel={`Move ${entry.name} down`}
          >
            <ThemedText
              style={[
                styles.reorderIcon,
                { color: isLast ? theme.textTertiary : theme.text },
              ]}
            >
              ↓
            </ThemedText>
          </Pressable>
        </View>

        {/* Skip / Remove */}
        {!isSkipped && (
          <Pressable
            style={[styles.actionButton, { backgroundColor: theme.warningSoft }]}
            onPress={() => onSkip(entry.id)}
            accessibilityRole="button"
            accessibilityLabel={`Skip ${entry.name}`}
          >
            <ThemedText style={[styles.actionButtonText, { color: theme.warning }]}>
              Skip
            </ThemedText>
          </Pressable>
        )}
        <Pressable
          style={[styles.actionButton, { backgroundColor: theme.errorSoft }]}
          onPress={() => onRemove(entry.id)}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${entry.name}`}
        >
          <ThemedText style={[styles.actionButtonText, { color: theme.error }]}>
            Remove
          </ThemedText>
        </Pressable>
      </View>

      {/* Log Set Form (only for active exercises) */}
      {!isSkipped && form && (
        <View style={[styles.setForm, { borderTopColor: theme.borderSubtle }]}>
          <View style={styles.formRow}>
            <View style={styles.formField}>
              <ThemedText style={[styles.formLabel, { color: theme.textSecondary }]}>
                Reps
              </ThemedText>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: theme.border,
                    color: theme.text,
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
                value={form.reps}
                onChangeText={(v) => onFormChange(entry.id, 'reps', v)}
                keyboardType="numeric"
                accessibilityLabel={`Reps for ${entry.name}`}
                placeholder="0"
                placeholderTextColor={theme.textTertiary}
              />
            </View>
            <View style={styles.formField}>
              <ThemedText style={[styles.formLabel, { color: theme.textSecondary }]}>
                Weight
              </ThemedText>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: theme.border,
                    color: theme.text,
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
                value={form.weight}
                onChangeText={(v) => onFormChange(entry.id, 'weight', v)}
                keyboardType="numeric"
                accessibilityLabel={`Weight for ${entry.name}`}
                placeholder="0"
                placeholderTextColor={theme.textTertiary}
              />
            </View>

            <View style={styles.formField}>
              <ThemedText style={[styles.formLabel, { color: theme.textSecondary }]}>
                RPE
              </ThemedText>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: theme.border,
                    color: theme.text,
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
                value={form.rpe}
                onChangeText={(v) => onFormChange(entry.id, 'rpe', v)}
                keyboardType="numeric"
                accessibilityLabel={`RPE for ${entry.name}`}
                placeholder="—"
                placeholderTextColor={theme.textTertiary}
              />
            </View>
          </View>

          <Pressable
            style={[styles.logSetButton, { backgroundColor: theme.accent }]}
            onPress={() => onLogSet(entry.id)}
            accessibilityRole="button"
            accessibilityLabel={`Log set for ${entry.name}`}
          >
            <ThemedText style={[styles.logSetButtonText, { color: theme.accentText }]}>
              + Log Set {entry.loggedSetsCount + 1}
            </ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Exercise Picker Modal ───────────────────────────────────────────────────

interface ExercisePickerModalProps {
  exercises: Exercise[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
  theme: ReturnType<typeof useTheme>;
}

function ExercisePickerModal({
  exercises,
  searchQuery,
  onSearchChange,
  onSelect,
  onClose,
  theme,
}: ExercisePickerModalProps) {
  return (
    <View
      style={[styles.pickerContainer, { backgroundColor: theme.background }]}
      accessibilityViewIsModal={true}
    >
      {/* Header */}
      <View style={[styles.pickerHeader, { borderBottomColor: theme.border }]}>
        <ThemedText type="headlineSmall" style={{ color: theme.text }}>
          Add Exercise
        </ThemedText>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close exercise picker"
          style={styles.closeButton}
        >
          <ThemedText style={{ color: theme.accent, fontSize: 16, fontWeight: '600' }}>
            Close
          </ThemedText>
        </Pressable>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={[
            styles.searchInput,
            {
              borderColor: theme.border,
              color: theme.text,
              backgroundColor: theme.backgroundElement,
            },
          ]}
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder="Search exercises…"
          placeholderTextColor={theme.textTertiary}
          autoFocus
          accessibilityLabel="Search exercises"
        />
      </View>

      {/* Results */}
      <FlatList
        data={exercises}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.pickerList}
        renderItem={({ item }) => (
          <Pressable
            style={[
              styles.pickerItem,
              { borderBottomColor: theme.borderSubtle },
            ]}
            onPress={() => onSelect(item)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.name}`}
          >
            <ThemedText style={[styles.pickerItemName, { color: theme.text }]}>
              {item.name}
            </ThemedText>
            <ThemedText style={{ fontSize: 12, color: theme.textSecondary }}>
              {item.primaryMuscleGroup}
            </ThemedText>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <ThemedText type="bodyMedium" themeColor="textSecondary">
              No exercises found. Try a different search term.
            </ThemedText>
          </View>
        }
      />
    </View>
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
    gap: Spacing.two,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: 100,
  },
  sessionHeader: {
    gap: Spacing.one,
  },
  // Exercise Card
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

  // Actions Row
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  reorderControls: {
    flexDirection: 'row',
    gap: Spacing.one,
    marginRight: 'auto' as const,
  },
  reorderButton: {
    width: 32,
    height: 32,
    borderRadius: Radii.small,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reorderIcon: {
    fontSize: 16,
    fontWeight: '700',
  },
  actionButton: {
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: Spacing.one,
    borderRadius: Radii.medium,
    minHeight: 32,
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // Set Form
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
    minHeight: 44,
  },

  logSetButton: {
    paddingVertical: Spacing.two,
    borderRadius: Radii.medium,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  logSetButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Add Exercise Button
  addExerciseButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radii.large,
    padding: Spacing.three,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  addExerciseText: {
    fontSize: 15,
    fontWeight: '600',
  },
  // Complete Button
  completeButton: {
    paddingVertical: Spacing.three,
    borderRadius: Radii.medium,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Picker Modal
  pickerContainer: {
    flex: 1,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  closeButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
  searchContainer: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.twoHalf,
    fontSize: 16,
    minHeight: 44,
  },
  pickerList: {
    paddingHorizontal: Spacing.four,
  },
  pickerItem: {
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    gap: 2,
    minHeight: 48,
    justifyContent: 'center',
  },
  pickerItemName: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptyState: {
    padding: Spacing.four,
    alignItems: 'center',
  },
});
