/**
 * Program Creation & Editing Screen
 *
 * Supports creating new programs (programId = "new") and editing existing
 * programs with status "draft" or "active".
 *
 * Features:
 * - Program name input with inline validation (1-100 chars)
 * - Day management: add/edit/remove/reorder (max 14 days)
 * - Exercise management within each day: add/edit/remove/reorder (max 20 per day)
 * - Exercise config: target sets, reps, weight, RPE, rest timer, notes
 * - Full validation before save
 * - Inline error indicators on invalid fields
 * - Retains unsaved changes on network save failure
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
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
import {
    MAX_DAYS_PER_PROGRAM,
    MAX_EXERCISES_PER_DAY,
    NOTES_LENGTH,
    PROGRAM_NAME_LENGTH,
    REST_TIMER_RANGE,
    TARGET_REPS_LENGTH,
    TARGET_SETS_RANGE,
    validateExerciseConfig,
    validateProgramName,
} from '@/lib/validation';
import { useAuth } from '@/providers/AuthProvider';
import { useCadenceStore, type Exercise } from '@/store/index';
import { supabase } from '@/utils/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExerciseConfig {
  id: string;
  exerciseId: string;
  exerciseName: string;
  targetSets: string;
  targetReps: string;
  targetWeight: string;
  targetRpe: string;
  restTimer: string;
  notes: string;
}

interface ProgramDayState {
  id: string;
  name: string;
  exercises: ExerciseConfig[];
  expanded: boolean;
}

interface ValidationErrors {
  programName?: string;
  days?: Record<string, string>;
  exercises?: Record<string, Record<string, string>>;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ProgramEditScreen() {
  const { programId } = useLocalSearchParams<{ programId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();
  const exercises = useCadenceStore((s) => s.exercises);

  const isNewProgram = programId === 'new';

  // ─── State ───────────────────────────────────────────────────────────────

  const [programName, setProgramName] = useState('');
  const [days, setDays] = useState<ProgramDayState[]>([]);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!isNewProgram);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exercisePickerDayId, setExercisePickerDayId] = useState<string | null>(null);
  const [exerciseEditState, setExerciseEditState] = useState<{
    dayId: string;
    exerciseId: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Day ID counter for generating unique IDs for new days
  const [dayIdCounter, setDayIdCounter] = useState(0);
  const [exerciseIdCounter, setExerciseIdCounter] = useState(0);

  // ─── Load existing program ─────────────────────────────────────────────────

  useEffect(() => {
    if (isNewProgram || !session) {
      setIsLoading(false);
      return;
    }

    async function loadProgram() {
      try {
        const { data, error } = await supabase
          .from('programs')
          .select(`
            id, name, status,
            program_days (
              id, day_number, name,
              program_day_items (
                id, order_index, target_sets, target_reps,
                target_weight, target_rpe, timer_config, notes,
                exercises (id, name)
              )
            )
          `)
          .eq('id', programId)
          .single();

        if (error) {
          Alert.alert('Error', 'Failed to load program');
          router.back();
          return;
        }

        const program = data as any;

        // Only allow editing draft or active programs
        if (program.status !== 'draft' && program.status !== 'active') {
          Alert.alert('Cannot Edit', 'Only draft or active programs can be edited.');
          router.back();
          return;
        }

        setProgramName(program.name || '');

        const sortedDays = [...(program.program_days || [])].sort(
          (a: any, b: any) => a.day_number - b.day_number
        );

        const loadedDays: ProgramDayState[] = sortedDays.map((day: any) => {
          const sortedItems = [...(day.program_day_items || [])].sort(
            (a: any, b: any) => a.order_index - b.order_index
          );

          return {
            id: day.id,
            name: day.name || `Day ${day.day_number}`,
            expanded: false,
            exercises: sortedItems.map((item: any) => ({
              id: item.id,
              exerciseId: item.exercises?.id || '',
              exerciseName: item.exercises?.name || 'Unknown',
              targetSets: String(item.target_sets || ''),
              targetReps: item.target_reps || '',
              targetWeight: item.target_weight != null ? String(item.target_weight) : '',
              targetRpe: item.target_rpe != null ? String(item.target_rpe) : '',
              restTimer: item.timer_config?.rest_seconds
                ? String(item.timer_config.rest_seconds)
                : '',
              notes: item.notes || '',
            })),
          };
        });

        setDays(loadedDays);
      } catch (err) {
        Alert.alert('Error', 'Failed to load program');
        router.back();
      } finally {
        setIsLoading(false);
      }
    }

    loadProgram();
  }, [isNewProgram, programId, session, router]);

  // ─── Validation ────────────────────────────────────────────────────────────

  const validate = useCallback((): boolean => {
    const newErrors: ValidationErrors = {};

    // Validate program name
    const nameResult = validateProgramName(programName);
    if (!nameResult.valid) {
      newErrors.programName = nameResult.errors.name;
    }

    // Validate at least 1 day
    if (days.length === 0) {
      newErrors.days = { _general: 'Program must have at least 1 day' };
    } else {
      const dayErrors: Record<string, string> = {};
      const exerciseErrors: Record<string, Record<string, string>> = {};

      days.forEach((day) => {
        if (day.exercises.length === 0) {
          dayErrors[day.id] = 'Each day must have at least 1 exercise';
        }

        // Validate each exercise config
        day.exercises.forEach((ex) => {
          const configResult = validateExerciseConfig({
            target_sets: ex.targetSets ? parseInt(ex.targetSets, 10) : null,
            target_reps: ex.targetReps || null,
            target_weight: ex.targetWeight ? parseFloat(ex.targetWeight) : null,
            target_rpe: ex.targetRpe ? parseFloat(ex.targetRpe) : null,
            rest_timer: ex.restTimer ? parseInt(ex.restTimer, 10) : null,
            notes: ex.notes || null,
          });

          if (!configResult.valid) {
            if (!exerciseErrors[day.id]) exerciseErrors[day.id] = {};
            exerciseErrors[day.id][ex.id] = Object.values(configResult.errors).join(', ');
          }
        });
      });

      if (Object.keys(dayErrors).length > 0) newErrors.days = dayErrors;
      if (Object.keys(exerciseErrors).length > 0) newErrors.exercises = exerciseErrors;
    }

    setErrors(newErrors);
    return (
      !newErrors.programName &&
      !newErrors.days &&
      !newErrors.exercises
    );
  }, [programName, days]);

  // ─── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!session) return;
    if (!validate()) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      if (isNewProgram) {
        // Create new program
        const { data: newProgram, error: programError } = await supabase
          .from('programs')
          .insert({
            name: programName.trim(),
            status: 'draft',
            user_id: session.user.id,
          })
          .select('id')
          .single();

        if (programError || !newProgram) {
          throw new Error(programError?.message || 'Failed to create program');
        }

        // Create days and exercises
        for (let i = 0; i < days.length; i++) {
          const day = days[i];
          const { data: newDay, error: dayError } = await supabase
            .from('program_days')
            .insert({
              program_id: newProgram.id,
              day_number: i + 1,
              name: day.name || `Day ${i + 1}`,
            })
            .select('id')
            .single();

          if (dayError || !newDay) {
            throw new Error(dayError?.message || 'Failed to create day');
          }

          // Create exercises for this day
          for (let j = 0; j < day.exercises.length; j++) {
            const ex = day.exercises[j];
            const timerConfig = ex.restTimer
              ? { type: 'rest', rest_seconds: parseInt(ex.restTimer, 10) }
              : null;

            const { error: itemError } = await supabase
              .from('program_day_items')
              .insert({
                program_day_id: newDay.id,
                exercise_id: ex.exerciseId || null,
                order_index: j + 1,
                target_sets: parseInt(ex.targetSets, 10) || 3,
                target_reps: ex.targetReps || '8-12',
                target_weight: ex.targetWeight ? parseFloat(ex.targetWeight) : null,
                target_rpe: ex.targetRpe ? parseFloat(ex.targetRpe) : null,
                timer_config: timerConfig,
                notes: ex.notes || null,
                type: 'exercise',
              });

            if (itemError) {
              throw new Error(itemError.message || 'Failed to create exercise');
            }
          }
        }
      } else {
        // Update existing program
        const { error: updateError } = await supabase
          .from('programs')
          .update({ name: programName.trim() })
          .eq('id', programId);

        if (updateError) {
          throw new Error(updateError.message || 'Failed to update program');
        }

        // Delete existing days and recreate (simpler than diffing)
        const { error: deleteError } = await supabase
          .from('program_days')
          .delete()
          .eq('program_id', programId);

        if (deleteError) {
          throw new Error(deleteError.message || 'Failed to update days');
        }

        // Recreate days and exercises
        for (let i = 0; i < days.length; i++) {
          const day = days[i];
          const { data: newDay, error: dayError } = await supabase
            .from('program_days')
            .insert({
              program_id: programId,
              day_number: i + 1,
              name: day.name || `Day ${i + 1}`,
            })
            .select('id')
            .single();

          if (dayError || !newDay) {
            throw new Error(dayError?.message || 'Failed to create day');
          }

          for (let j = 0; j < day.exercises.length; j++) {
            const ex = day.exercises[j];
            const timerConfig = ex.restTimer
              ? { type: 'rest', rest_seconds: parseInt(ex.restTimer, 10) }
              : null;

            const { error: itemError } = await supabase
              .from('program_day_items')
              .insert({
                program_day_id: newDay.id,
                exercise_id: ex.exerciseId || null,
                order_index: j + 1,
                target_sets: parseInt(ex.targetSets, 10) || 3,
                target_reps: ex.targetReps || '8-12',
                target_weight: ex.targetWeight ? parseFloat(ex.targetWeight) : null,
                target_rpe: ex.targetRpe ? parseFloat(ex.targetRpe) : null,
                timer_config: timerConfig,
                notes: ex.notes || null,
                type: 'exercise',
              });

            if (itemError) {
              throw new Error(itemError.message || 'Failed to create exercise');
            }
          }
        }
      }

      // Success — navigate back
      router.back();
    } catch (err) {
      // Retain unsaved changes on failure (Req 7.8)
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSaveError(msg);
      Alert.alert('Save Failed', `${msg}. Your changes have been preserved.`);
    } finally {
      setIsSaving(false);
    }
  }, [session, isNewProgram, programId, programName, days, validate, router]);

  // ─── Day Management ────────────────────────────────────────────────────────

  const handleAddDay = useCallback(() => {
    if (days.length >= MAX_DAYS_PER_PROGRAM) {
      Alert.alert('Limit Reached', `Maximum ${MAX_DAYS_PER_PROGRAM} days per program.`);
      return;
    }

    const newId = `new-day-${dayIdCounter}`;
    setDayIdCounter((c) => c + 1);

    setDays((prev) => [
      ...prev,
      {
        id: newId,
        name: `Day ${prev.length + 1}`,
        exercises: [],
        expanded: true,
      },
    ]);
  }, [days.length, dayIdCounter]);

  const handleRemoveDay = useCallback((dayId: string) => {
    Alert.alert('Remove Day', 'Are you sure you want to remove this day?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setDays((prev) => prev.filter((d) => d.id !== dayId)),
      },
    ]);
  }, []);

  const handleMoveDayUp = useCallback((dayId: string) => {
    setDays((prev) => {
      const idx = prev.findIndex((d) => d.id === dayId);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const handleMoveDayDown = useCallback((dayId: string) => {
    setDays((prev) => {
      const idx = prev.findIndex((d) => d.id === dayId);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  const handleDayNameChange = useCallback((dayId: string, name: string) => {
    setDays((prev) =>
      prev.map((d) => (d.id === dayId ? { ...d, name } : d))
    );
  }, []);

  const handleToggleDay = useCallback((dayId: string) => {
    setDays((prev) =>
      prev.map((d) => (d.id === dayId ? { ...d, expanded: !d.expanded } : d))
    );
  }, []);

  // ─── Exercise Management ───────────────────────────────────────────────────

  const handleAddExercise = useCallback(
    (exercise: Exercise) => {
      if (!exercisePickerDayId) return;

      const day = days.find((d) => d.id === exercisePickerDayId);
      if (!day) return;

      if (day.exercises.length >= MAX_EXERCISES_PER_DAY) {
        Alert.alert('Limit Reached', `Maximum ${MAX_EXERCISES_PER_DAY} exercises per day.`);
        return;
      }

      const newExId = `new-ex-${exerciseIdCounter}`;
      setExerciseIdCounter((c) => c + 1);

      const newExercise: ExerciseConfig = {
        id: newExId,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        targetSets: '3',
        targetReps: '8-12',
        targetWeight: '',
        targetRpe: '',
        restTimer: '',
        notes: '',
      };

      setDays((prev) =>
        prev.map((d) =>
          d.id === exercisePickerDayId
            ? { ...d, exercises: [...d.exercises, newExercise] }
            : d
        )
      );

      setExercisePickerDayId(null);
      setSearchQuery('');
    },
    [exercisePickerDayId, days, exerciseIdCounter]
  );

  const handleRemoveExercise = useCallback((dayId: string, exerciseConfigId: string) => {
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? { ...d, exercises: d.exercises.filter((e) => e.id !== exerciseConfigId) }
          : d
      )
    );
  }, []);

  const handleMoveExerciseUp = useCallback((dayId: string, exerciseConfigId: string) => {
    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        const idx = d.exercises.findIndex((e) => e.id === exerciseConfigId);
        if (idx <= 0) return d;
        const newExercises = [...d.exercises];
        [newExercises[idx - 1], newExercises[idx]] = [newExercises[idx], newExercises[idx - 1]];
        return { ...d, exercises: newExercises };
      })
    );
  }, []);

  const handleMoveExerciseDown = useCallback((dayId: string, exerciseConfigId: string) => {
    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        const idx = d.exercises.findIndex((e) => e.id === exerciseConfigId);
        if (idx < 0 || idx >= d.exercises.length - 1) return d;
        const newExercises = [...d.exercises];
        [newExercises[idx], newExercises[idx + 1]] = [newExercises[idx + 1], newExercises[idx]];
        return { ...d, exercises: newExercises };
      })
    );
  }, []);

  const handleExerciseConfigChange = useCallback(
    (dayId: string, exerciseConfigId: string, field: keyof ExerciseConfig, value: string) => {
      setDays((prev) =>
        prev.map((d) =>
          d.id === dayId
            ? {
                ...d,
                exercises: d.exercises.map((e) =>
                  e.id === exerciseConfigId ? { ...e, [field]: value } : e
                ),
              }
            : d
        )
      );
    },
    []
  );

  // ─── Exercise Picker Filtering ─────────────────────────────────────────────

  const filteredExercises = useMemo(() => {
    if (!searchQuery.trim()) return exercises.slice(0, 50);
    const query = searchQuery.toLowerCase().trim();
    return exercises
      .filter((e) => e.name.toLowerCase().includes(query))
      .slice(0, 50);
  }, [exercises, searchQuery]);

  // ─── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <ThemedText type="headlineMedium">
            {isNewProgram ? 'Create Program' : 'Edit Program'}
          </ThemedText>

          {/* Save Error Banner */}
          {saveError && (
            <View style={[styles.errorBanner, { backgroundColor: theme.errorSoft }]}>
              <ThemedText style={{ color: theme.error, fontSize: 13 }}>
                Save failed: {saveError}. Your changes are preserved.
              </ThemedText>
            </View>
          )}

          {/* Program Name Input */}
          <View style={styles.fieldContainer}>
            <ThemedText style={[styles.fieldLabel, { color: theme.textSecondary }]}>
              Program Name
            </ThemedText>
            <TextInput
              style={[
                styles.textInput,
                {
                  borderColor: errors.programName ? theme.error : theme.border,
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                },
              ]}
              value={programName}
              onChangeText={(text) => {
                setProgramName(text);
                if (errors.programName) {
                  setErrors((prev) => ({ ...prev, programName: undefined }));
                }
              }}
              placeholder="e.g. Push/Pull/Legs"
              placeholderTextColor={theme.textTertiary}
              maxLength={PROGRAM_NAME_LENGTH.max}
              accessibilityLabel="Program name"
              accessibilityRole="none"
            />
            {errors.programName && (
              <ThemedText style={[styles.errorText, { color: theme.error }]}>
                {errors.programName}
              </ThemedText>
            )}
          </View>

          {/* General Day Error */}
          {errors.days?._general && (
            <View style={[styles.errorBanner, { backgroundColor: theme.errorSoft }]}>
              <ThemedText style={{ color: theme.error, fontSize: 13 }}>
                {errors.days._general}
              </ThemedText>
            </View>
          )}

          {/* Day Cards */}
          {days.map((day, dayIndex) => (
            <DayCard
              key={day.id}
              day={day}
              dayIndex={dayIndex}
              isFirst={dayIndex === 0}
              isLast={dayIndex === days.length - 1}
              theme={theme}
              dayError={errors.days?.[day.id]}
              exerciseErrors={errors.exercises?.[day.id]}
              onToggle={handleToggleDay}
              onNameChange={handleDayNameChange}
              onRemove={handleRemoveDay}
              onMoveUp={handleMoveDayUp}
              onMoveDown={handleMoveDayDown}
              onAddExercise={() => setExercisePickerDayId(day.id)}
              onRemoveExercise={handleRemoveExercise}
              onMoveExerciseUp={handleMoveExerciseUp}
              onMoveExerciseDown={handleMoveExerciseDown}
              onExerciseConfigChange={handleExerciseConfigChange}
              onEditExercise={(exId) =>
                setExerciseEditState({ dayId: day.id, exerciseId: exId })
              }
            />
          ))}

          {/* Add Day Button */}
          <Pressable
            style={[
              styles.addDayButton,
              {
                borderColor: theme.accent,
                backgroundColor: theme.accentSoft,
              },
            ]}
            onPress={handleAddDay}
            accessibilityRole="button"
            accessibilityLabel="Add training day"
          >
            <ThemedText style={[styles.addDayText, { color: theme.accent }]}>
              + Add Day ({days.length}/{MAX_DAYS_PER_PROGRAM})
            </ThemedText>
          </Pressable>

          {/* Save Button */}
          <Pressable
            style={[
              styles.saveButton,
              {
                backgroundColor: isSaving ? theme.accentMuted : theme.accent,
                opacity: isSaving ? 0.7 : 1,
              },
            ]}
            onPress={handleSave}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel={isNewProgram ? 'Create program' : 'Save changes'}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <ThemedText style={styles.saveButtonText}>
                {isNewProgram ? 'Create Program' : 'Save Changes'}
              </ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Exercise Picker Modal */}
      <Modal
        visible={exercisePickerDayId !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setExercisePickerDayId(null);
          setSearchQuery('');
        }}
      >
        <ExercisePickerModal
          exercises={filteredExercises}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelect={handleAddExercise}
          onClose={() => {
            setExercisePickerDayId(null);
            setSearchQuery('');
          }}
          theme={theme}
        />
      </Modal>
    </ThemedView>
  );
}


// ─── Day Card Component ──────────────────────────────────────────────────────

interface DayCardProps {
  day: ProgramDayState;
  dayIndex: number;
  isFirst: boolean;
  isLast: boolean;
  theme: ReturnType<typeof useTheme>;
  dayError?: string;
  exerciseErrors?: Record<string, string>;
  onToggle: (dayId: string) => void;
  onNameChange: (dayId: string, name: string) => void;
  onRemove: (dayId: string) => void;
  onMoveUp: (dayId: string) => void;
  onMoveDown: (dayId: string) => void;
  onAddExercise: () => void;
  onRemoveExercise: (dayId: string, exerciseId: string) => void;
  onMoveExerciseUp: (dayId: string, exerciseId: string) => void;
  onMoveExerciseDown: (dayId: string, exerciseId: string) => void;
  onExerciseConfigChange: (
    dayId: string,
    exerciseId: string,
    field: keyof ExerciseConfig,
    value: string
  ) => void;
  onEditExercise: (exerciseId: string) => void;
}

function DayCard({
  day,
  dayIndex,
  isFirst,
  isLast,
  theme,
  dayError,
  exerciseErrors,
  onToggle,
  onNameChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onAddExercise,
  onRemoveExercise,
  onMoveExerciseUp,
  onMoveExerciseDown,
  onExerciseConfigChange,
  onEditExercise,
}: DayCardProps) {
  return (
    <View
      style={[
        styles.dayCard,
        {
          borderColor: dayError ? theme.error : theme.border,
          backgroundColor: theme.backgroundElevated,
        },
      ]}
      accessibilityLabel={`Day ${dayIndex + 1}: ${day.name}`}
    >
      {/* Day Header */}
      <Pressable
        style={styles.dayHeader}
        onPress={() => onToggle(day.id)}
        accessibilityRole="button"
        accessibilityLabel={`${day.expanded ? 'Collapse' : 'Expand'} Day ${dayIndex + 1}`}
      >
        <View style={[styles.dayBadge, { backgroundColor: theme.accent }]}>
          <ThemedText style={styles.dayBadgeText}>{dayIndex + 1}</ThemedText>
        </View>
        <TextInput
          style={[styles.dayNameInput, { color: theme.text }]}
          value={day.name}
          onChangeText={(text) => onNameChange(day.id, text)}
          placeholder={`Day ${dayIndex + 1}`}
          placeholderTextColor={theme.textTertiary}
          accessibilityLabel={`Day ${dayIndex + 1} name`}
        />
        <ThemedText style={{ color: theme.textSecondary, fontSize: 12 }}>
          {day.exercises.length} ex • {day.expanded ? '▼' : '▶'}
        </ThemedText>
      </Pressable>

      {/* Day Actions */}
      <View style={styles.dayActions}>
        <View style={styles.reorderControls}>
          <Pressable
            style={[styles.reorderBtn, { backgroundColor: theme.backgroundElement }]}
            onPress={() => onMoveUp(day.id)}
            disabled={isFirst}
            accessibilityRole="button"
            accessibilityLabel={`Move Day ${dayIndex + 1} up`}
          >
            <ThemedText
              style={[styles.reorderIcon, { color: isFirst ? theme.textTertiary : theme.text }]}
            >
              ↑
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.reorderBtn, { backgroundColor: theme.backgroundElement }]}
            onPress={() => onMoveDown(day.id)}
            disabled={isLast}
            accessibilityRole="button"
            accessibilityLabel={`Move Day ${dayIndex + 1} down`}
          >
            <ThemedText
              style={[styles.reorderIcon, { color: isLast ? theme.textTertiary : theme.text }]}
            >
              ↓
            </ThemedText>
          </Pressable>
        </View>
        <Pressable
          style={[styles.removeBtn, { backgroundColor: theme.errorSoft }]}
          onPress={() => onRemove(day.id)}
          accessibilityRole="button"
          accessibilityLabel={`Remove Day ${dayIndex + 1}`}
        >
          <ThemedText style={{ color: theme.error, fontSize: 12, fontWeight: '600' }}>
            Remove
          </ThemedText>
        </Pressable>
      </View>

      {/* Day Error */}
      {dayError && (
        <ThemedText style={[styles.errorText, { color: theme.error }]}>
          {dayError}
        </ThemedText>
      )}

      {/* Expanded Content: Exercises */}
      {day.expanded && (
        <View style={[styles.dayContent, { borderTopColor: theme.borderSubtle }]}>
          {day.exercises.map((ex, exIndex) => (
            <ExerciseConfigCard
              key={ex.id}
              exercise={ex}
              dayId={day.id}
              exIndex={exIndex}
              isFirst={exIndex === 0}
              isLast={exIndex === day.exercises.length - 1}
              theme={theme}
              error={exerciseErrors?.[ex.id]}
              onConfigChange={onExerciseConfigChange}
              onRemove={onRemoveExercise}
              onMoveUp={onMoveExerciseUp}
              onMoveDown={onMoveExerciseDown}
            />
          ))}

          {/* Add Exercise to Day */}
          <Pressable
            style={[
              styles.addExerciseBtn,
              { borderColor: theme.accentMuted, backgroundColor: theme.accentSoft },
            ]}
            onPress={onAddExercise}
            accessibilityRole="button"
            accessibilityLabel={`Add exercise to Day ${dayIndex + 1}`}
          >
            <ThemedText style={{ color: theme.accent, fontSize: 13, fontWeight: '600' }}>
              + Add Exercise ({day.exercises.length}/{MAX_EXERCISES_PER_DAY})
            </ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}


// ─── Exercise Config Card Component ──────────────────────────────────────────

interface ExerciseConfigCardProps {
  exercise: ExerciseConfig;
  dayId: string;
  exIndex: number;
  isFirst: boolean;
  isLast: boolean;
  theme: ReturnType<typeof useTheme>;
  error?: string;
  onConfigChange: (
    dayId: string,
    exerciseId: string,
    field: keyof ExerciseConfig,
    value: string
  ) => void;
  onRemove: (dayId: string, exerciseId: string) => void;
  onMoveUp: (dayId: string, exerciseId: string) => void;
  onMoveDown: (dayId: string, exerciseId: string) => void;
}

function ExerciseConfigCard({
  exercise,
  dayId,
  exIndex,
  isFirst,
  isLast,
  theme,
  error,
  onConfigChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: ExerciseConfigCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View
      style={[
        styles.exerciseConfigCard,
        {
          borderColor: error ? theme.error : theme.borderSubtle,
          backgroundColor: theme.backgroundElement,
        },
      ]}
      accessibilityLabel={`Exercise ${exIndex + 1}: ${exercise.exerciseName}`}
    >
      {/* Exercise Header */}
      <Pressable
        style={styles.exerciseConfigHeader}
        onPress={() => setExpanded(!expanded)}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${exercise.exerciseName} settings`}
      >
        <View style={styles.exerciseConfigInfo}>
          <ThemedText style={[styles.exerciseConfigName, { color: theme.text }]}>
            {exercise.exerciseName}
          </ThemedText>
          <ThemedText style={{ fontSize: 11, color: theme.textSecondary }}>
            {exercise.targetSets}×{exercise.targetReps}
            {exercise.targetWeight ? ` @ ${exercise.targetWeight}kg` : ''}
            {exercise.targetRpe ? ` RPE ${exercise.targetRpe}` : ''}
          </ThemedText>
        </View>
        <ThemedText style={{ color: theme.textSecondary, fontSize: 11 }}>
          {expanded ? '▼' : '▶'}
        </ThemedText>
      </Pressable>

      {/* Reorder + Remove */}
      <View style={styles.exerciseConfigActions}>
        <View style={styles.reorderControls}>
          <Pressable
            style={[styles.smallBtn, { backgroundColor: theme.backgroundSelected }]}
            onPress={() => onMoveUp(dayId, exercise.id)}
            disabled={isFirst}
            accessibilityRole="button"
            accessibilityLabel={`Move ${exercise.exerciseName} up`}
          >
            <ThemedText
              style={{ fontSize: 12, color: isFirst ? theme.textTertiary : theme.text }}
            >
              ↑
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.smallBtn, { backgroundColor: theme.backgroundSelected }]}
            onPress={() => onMoveDown(dayId, exercise.id)}
            disabled={isLast}
            accessibilityRole="button"
            accessibilityLabel={`Move ${exercise.exerciseName} down`}
          >
            <ThemedText
              style={{ fontSize: 12, color: isLast ? theme.textTertiary : theme.text }}
            >
              ↓
            </ThemedText>
          </Pressable>
        </View>
        <Pressable
          style={[styles.smallRemoveBtn, { backgroundColor: theme.errorSoft }]}
          onPress={() => onRemove(dayId, exercise.id)}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${exercise.exerciseName}`}
        >
          <ThemedText style={{ color: theme.error, fontSize: 11, fontWeight: '600' }}>
            ✕
          </ThemedText>
        </Pressable>
      </View>

      {/* Expanded Config Fields */}
      {expanded && (
        <View style={[styles.configFields, { borderTopColor: theme.borderSubtle }]}>
          {/* Sets & Reps row */}
          <View style={styles.configRow}>
            <View style={styles.configField}>
              <ThemedText style={[styles.configLabel, { color: theme.textSecondary }]}>
                Sets
              </ThemedText>
              <TextInput
                style={[
                  styles.configInput,
                  {
                    borderColor: theme.border,
                    color: theme.text,
                    backgroundColor: theme.background,
                  },
                ]}
                value={exercise.targetSets}
                onChangeText={(v) => onConfigChange(dayId, exercise.id, 'targetSets', v)}
                keyboardType="numeric"
                placeholder={`${TARGET_SETS_RANGE.min}-${TARGET_SETS_RANGE.max}`}
                placeholderTextColor={theme.textTertiary}
                accessibilityLabel={`Target sets for ${exercise.exerciseName}`}
              />
            </View>
            <View style={styles.configField}>
              <ThemedText style={[styles.configLabel, { color: theme.textSecondary }]}>
                Reps
              </ThemedText>
              <TextInput
                style={[
                  styles.configInput,
                  {
                    borderColor: theme.border,
                    color: theme.text,
                    backgroundColor: theme.background,
                  },
                ]}
                value={exercise.targetReps}
                onChangeText={(v) => onConfigChange(dayId, exercise.id, 'targetReps', v)}
                placeholder="e.g. 8-12"
                placeholderTextColor={theme.textTertiary}
                maxLength={TARGET_REPS_LENGTH.max}
                accessibilityLabel={`Target reps for ${exercise.exerciseName}`}
              />
            </View>
          </View>

          {/* Weight & RPE row */}
          <View style={styles.configRow}>
            <View style={styles.configField}>
              <ThemedText style={[styles.configLabel, { color: theme.textSecondary }]}>
                Weight (kg)
              </ThemedText>
              <TextInput
                style={[
                  styles.configInput,
                  {
                    borderColor: theme.border,
                    color: theme.text,
                    backgroundColor: theme.background,
                  },
                ]}
                value={exercise.targetWeight}
                onChangeText={(v) => onConfigChange(dayId, exercise.id, 'targetWeight', v)}
                keyboardType="numeric"
                placeholder="—"
                placeholderTextColor={theme.textTertiary}
                accessibilityLabel={`Target weight for ${exercise.exerciseName}`}
              />
            </View>
            <View style={styles.configField}>
              <ThemedText style={[styles.configLabel, { color: theme.textSecondary }]}>
                RPE
              </ThemedText>
              <TextInput
                style={[
                  styles.configInput,
                  {
                    borderColor: theme.border,
                    color: theme.text,
                    backgroundColor: theme.background,
                  },
                ]}
                value={exercise.targetRpe}
                onChangeText={(v) => onConfigChange(dayId, exercise.id, 'targetRpe', v)}
                keyboardType="numeric"
                placeholder="—"
                placeholderTextColor={theme.textTertiary}
                accessibilityLabel={`Target RPE for ${exercise.exerciseName}`}
              />
            </View>
          </View>

          {/* Rest Timer */}
          <View style={styles.configRow}>
            <View style={styles.configField}>
              <ThemedText style={[styles.configLabel, { color: theme.textSecondary }]}>
                Rest Timer (sec)
              </ThemedText>
              <TextInput
                style={[
                  styles.configInput,
                  {
                    borderColor: theme.border,
                    color: theme.text,
                    backgroundColor: theme.background,
                  },
                ]}
                value={exercise.restTimer}
                onChangeText={(v) => onConfigChange(dayId, exercise.id, 'restTimer', v)}
                keyboardType="numeric"
                placeholder={`${REST_TIMER_RANGE.min}-${REST_TIMER_RANGE.max}`}
                placeholderTextColor={theme.textTertiary}
                accessibilityLabel={`Rest timer for ${exercise.exerciseName}`}
              />
            </View>
          </View>

          {/* Notes */}
          <View style={styles.notesField}>
            <ThemedText style={[styles.configLabel, { color: theme.textSecondary }]}>
              Notes
            </ThemedText>
            <TextInput
              style={[
                styles.notesInput,
                {
                  borderColor: theme.border,
                  color: theme.text,
                  backgroundColor: theme.background,
                },
              ]}
              value={exercise.notes}
              onChangeText={(v) => onConfigChange(dayId, exercise.id, 'notes', v)}
              placeholder="Optional notes..."
              placeholderTextColor={theme.textTertiary}
              multiline
              maxLength={NOTES_LENGTH.max}
              accessibilityLabel={`Notes for ${exercise.exerciseName}`}
            />
          </View>

          {/* Error */}
          {error && (
            <ThemedText style={[styles.errorText, { color: theme.error }]}>
              {error}
            </ThemedText>
          )}
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
    <View style={[styles.pickerContainer, { backgroundColor: theme.background }]} accessibilityViewIsModal={true}>
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
            style={[styles.pickerItem, { borderBottomColor: theme.borderSubtle }]}
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
  flex: {
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

  // Error Banner
  errorBanner: {
    padding: Spacing.twoHalf,
    borderRadius: Radii.medium,
  },

  // Field Container
  fieldContainer: {
    gap: Spacing.one,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.twoHalf,
    fontSize: 16,
    minHeight: 48,
  },
  errorText: {
    fontSize: 12,
    marginTop: 2,
  },

  // Day Card
  dayCard: {
    borderWidth: 1,
    borderRadius: Radii.large,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dayBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  dayNameInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: Spacing.one,
  },
  dayActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dayContent: {
    borderTopWidth: 1,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  reorderControls: {
    flexDirection: 'row',
    gap: Spacing.one,
    marginRight: 'auto',
  },
  reorderBtn: {
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
  removeBtn: {
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: Spacing.one,
    borderRadius: Radii.medium,
    minHeight: 32,
    justifyContent: 'center',
  },

  // Exercise Config Card
  exerciseConfigCard: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    padding: Spacing.twoHalf,
    gap: Spacing.one,
  },
  exerciseConfigHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  exerciseConfigInfo: {
    flex: 1,
    gap: 1,
  },
  exerciseConfigName: {
    fontWeight: '600',
    fontSize: 14,
  },
  exerciseConfigActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  smallBtn: {
    width: 26,
    height: 26,
    borderRadius: Radii.small,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallRemoveBtn: {
    width: 26,
    height: 26,
    borderRadius: Radii.small,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  configFields: {
    borderTopWidth: 1,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  configRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  configField: {
    flex: 1,
    gap: 2,
  },
  configLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  configInput: {
    borderWidth: 1,
    borderRadius: Radii.small,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    minHeight: 36,
  },
  notesField: {
    gap: 2,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: Radii.small,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },

  // Add Buttons
  addDayButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radii.large,
    padding: Spacing.three,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  addDayText: {
    fontSize: 15,
    fontWeight: '600',
  },
  addExerciseBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radii.medium,
    padding: Spacing.two,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  saveButton: {
    paddingVertical: Spacing.three,
    borderRadius: Radii.medium,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Exercise Picker Modal
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
