/**
 * Exercise Library screen — browse, search, filter, and manage exercises.
 *
 * Features:
 * - Search with case-insensitive substring matching on name (debounced 200ms)
 * - Exact-match filtering by primary and secondary muscle groups
 * - Custom exercise creation, editing, and deletion
 * - Confirmation dialog when deleting exercise in use
 * - Empty-state with "Create Custom Exercise" option
 * - 300+ global exercises from seed data
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9
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
import { GLOBAL_EXERCISES, MUSCLE_GROUPS } from '@/data/exercise-seed';
import { useTheme } from '@/hooks/use-theme';
import { validateExercise } from '@/lib/validation';
import { useAuth } from '@/providers/AuthProvider';
import {
    createExercise,
    deleteExercise,
    updateExercise,
} from '@/services/exercise-library';
import { useCadenceStore, type Exercise } from '@/store';
import { supabase } from '@/utils/supabase';


// ─── Types ───────────────────────────────────────────────────────────────────

interface ExerciseFormState {
  name: string;
  primaryMuscleGroup: string;
  secondaryMuscleGroups: string[];
  instructions: string;
}

const INITIAL_FORM: ExerciseFormState = {
  name: '',
  primaryMuscleGroup: '',
  secondaryMuscleGroups: [],
  instructions: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converts seed data into Exercise objects for the store.
 * Uses deterministic IDs based on the exercise name for consistency.
 */
function seedToExercises(): Exercise[] {
  return GLOBAL_EXERCISES.map((seed, idx) => ({
    id: `global-${idx}`,
    name: seed.name,
    primaryMuscleGroup: seed.primaryMuscleGroup,
    secondaryMuscleGroups: seed.secondaryMuscleGroups,
    instructions: seed.instructions,
    isGlobal: true,
  }));
}

/**
 * Debounce hook — returns a debounced value after the specified delay.
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ExerciseLibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const exercises = useCadenceStore((s) => s.exercises);
  const setExercises = useCadenceStore((s) => s.setExercises);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  const debouncedQuery = useDebounce(searchQuery, 200);

  // Seed exercises into store if empty
  useEffect(() => {
    if (exercises.length === 0) {
      const seeded = seedToExercises();
      setExercises(seeded);
    }
  }, [exercises.length, setExercises]);

  // ─── Search & Filter (local, <200ms) ────────────────────────────────────────

  const filteredExercises = useMemo(() => {
    const query = debouncedQuery.toLowerCase().trim();

    return exercises.filter((exercise) => {
      // Case-insensitive substring match on name
      if (query && !exercise.name.toLowerCase().includes(query)) {
        return false;
      }

      // Exact-match filtering by muscle group (primary or secondary)
      if (selectedMuscleGroup) {
        const matchesPrimary =
          exercise.primaryMuscleGroup === selectedMuscleGroup;
        const matchesSecondary =
          exercise.secondaryMuscleGroups?.includes(selectedMuscleGroup) ?? false;
        if (!matchesPrimary && !matchesSecondary) {
          return false;
        }
      }

      return true;
    });
  }, [exercises, debouncedQuery, selectedMuscleGroup]);

  // ─── CRUD Operations ──────────────────────────────────────────────────────────

  const handleCreateExercise = useCallback(
    async (form: ExerciseFormState) => {
      if (!session) return;
      setIsLoading(true);

      try {
        const created = await createExercise(supabase, session.user.id, {
          name: form.name.trim(),
          primary_muscle_group: form.primaryMuscleGroup,
          secondary_muscle_groups: form.secondaryMuscleGroups,
          instructions: form.instructions.trim(),
        });

        // Add to store with the correct shape
        const newExercise: Exercise = {
          id: created.id,
          name: created.name,
          primaryMuscleGroup: created.primary_muscle_group,
          secondaryMuscleGroups: created.secondary_muscle_groups,
          instructions: created.instructions,
          isGlobal: false,
        };

        setExercises([...exercises, newExercise]);
        setShowCreateModal(false);
      } catch (err) {
        Alert.alert(
          'Error',
          err instanceof Error ? err.message : 'Failed to create exercise'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [session, exercises, setExercises]
  );

  const handleEditExercise = useCallback(
    async (exerciseId: string, form: ExerciseFormState) => {
      if (!session) return;
      setIsLoading(true);

      try {
        const updated = await updateExercise(supabase, session.user.id, exerciseId, {
          name: form.name.trim(),
          primary_muscle_group: form.primaryMuscleGroup,
          secondary_muscle_groups: form.secondaryMuscleGroups,
          instructions: form.instructions.trim(),
        });

        // Update in store
        const updatedExercises = exercises.map((e) =>
          e.id === exerciseId
            ? {
                ...e,
                name: updated.name,
                primaryMuscleGroup: updated.primary_muscle_group,
                secondaryMuscleGroups: updated.secondary_muscle_groups,
                instructions: updated.instructions,
              }
            : e
        );
        setExercises(updatedExercises);
        setEditingExercise(null);
      } catch (err) {
        Alert.alert(
          'Error',
          err instanceof Error ? err.message : 'Failed to update exercise'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [session, exercises, setExercises]
  );

  const handleDeleteExercise = useCallback(
    async (exercise: Exercise) => {
      if (!session) return;

      // Check if exercise is in use in any program
      const { data: usageData } = await supabase
        .from('program_day_items')
        .select('id')
        .eq('exercise_id', exercise.id)
        .limit(1);

      const isInUse = usageData && usageData.length > 0;

      const confirmMessage = isInUse
        ? `"${exercise.name}" is currently used in one or more programs. Are you sure you want to delete it?`
        : `Delete "${exercise.name}"? This cannot be undone.`;

      Alert.alert('Delete Exercise', confirmMessage, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              await deleteExercise(supabase, session.user.id, exercise.id);
              const updatedExercises = exercises.filter((e) => e.id !== exercise.id);
              setExercises(updatedExercises);
            } catch (err) {
              Alert.alert(
                'Error',
                err instanceof Error ? err.message : 'Failed to delete exercise'
              );
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]);
    },
    [session, exercises, setExercises]
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  const renderExerciseItem = useCallback(
    ({ item }: { item: Exercise }) => (
      <ExerciseCard
        exercise={item}
        theme={theme}
        onEdit={(e) => setEditingExercise(e)}
        onDelete={(e) => handleDeleteExercise(e)}
        onViewHistory={(e) => router.push(`/(tabs)/progress/exercise/${e.id}`)}
      />
    ),
    [theme, handleDeleteExercise, router]
  );

  const keyExtractor = useCallback((item: Exercise) => item.id, []);

  return (
    <ThemedView style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchSection}>
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
          onChangeText={setSearchQuery}
          placeholder="Search exercises…"
          placeholderTextColor={theme.textTertiary}
          accessibilityLabel="Search exercises"
          accessibilityRole="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {/* Muscle Group Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipContainer}
        style={styles.chipScroll}
      >
        <Pressable
          style={[
            styles.chip,
            {
              backgroundColor: !selectedMuscleGroup
                ? theme.accent
                : theme.backgroundElement,
              borderColor: !selectedMuscleGroup
                ? theme.accent
                : theme.border,
            },
          ]}
          onPress={() => setSelectedMuscleGroup(null)}
          accessibilityRole="button"
          accessibilityLabel="Show all muscle groups"
          accessibilityState={{ selected: !selectedMuscleGroup }}
        >
          <ThemedText
            style={[
              styles.chipText,
              { color: !selectedMuscleGroup ? '#fff' : theme.text },
            ]}
          >
            All
          </ThemedText>
        </Pressable>
        {MUSCLE_GROUPS.map((group) => (
          <Pressable
            key={group}
            style={[
              styles.chip,
              {
                backgroundColor:
                  selectedMuscleGroup === group
                    ? theme.accent
                    : theme.backgroundElement,
                borderColor:
                  selectedMuscleGroup === group
                    ? theme.accent
                    : theme.border,
              },
            ]}
            onPress={() =>
              setSelectedMuscleGroup(
                selectedMuscleGroup === group ? null : group
              )
            }
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${group}`}
            accessibilityState={{ selected: selectedMuscleGroup === group }}
          >
            <ThemedText
              style={[
                styles.chipText,
                {
                  color:
                    selectedMuscleGroup === group ? '#fff' : theme.text,
                },
              ]}
            >
              {group.charAt(0).toUpperCase() + group.slice(1)}
            </ThemedText>
          </Pressable>
        ))}
      </ScrollView>

      {/* Exercise List */}
      <FlatList
        data={filteredExercises}
        keyExtractor={keyExtractor}
        renderItem={renderExerciseItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <ThemedText
              type="headlineSmall"
              style={{ color: theme.text, marginBottom: Spacing.two }}
            >
              No exercises match your search
            </ThemedText>
            <ThemedText
              type="bodyMedium"
              style={{ color: theme.textSecondary, marginBottom: Spacing.three }}
            >
              Try a different search term or create a custom exercise.
            </ThemedText>
            <Pressable
              style={[styles.createButton, { backgroundColor: theme.accent }]}
              onPress={() => setShowCreateModal(true)}
              accessibilityRole="button"
              accessibilityLabel="Create custom exercise"
            >
              <ThemedText style={[styles.createButtonText, { color: theme.accentText }]}>
                Create Custom Exercise
              </ThemedText>
            </Pressable>
          </View>
        }
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={5}
      />

      {/* FAB to create exercise */}
      <Pressable
        style={[styles.fab, { backgroundColor: theme.accent }]}
        onPress={() => setShowCreateModal(true)}
        accessibilityRole="button"
        accessibilityLabel="Create new custom exercise"
      >
        <ThemedText style={[styles.fabText, { color: theme.accentText }]}>+</ThemedText>
      </Pressable>

      {/* Loading Overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      )}

      {/* Create Exercise Modal */}
      <ExerciseFormModal
        visible={showCreateModal}
        title="Create Custom Exercise"
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateExercise}
        theme={theme}
      />

      {/* Edit Exercise Modal */}
      {editingExercise && (
        <ExerciseFormModal
          visible={!!editingExercise}
          title="Edit Exercise"
          initialValues={{
            name: editingExercise.name,
            primaryMuscleGroup: editingExercise.primaryMuscleGroup,
            secondaryMuscleGroups: editingExercise.secondaryMuscleGroups ?? [],
            instructions: editingExercise.instructions ?? '',
          }}
          onClose={() => setEditingExercise(null)}
          onSubmit={(form) => handleEditExercise(editingExercise.id, form)}
          theme={theme}
        />
      )}
    </ThemedView>
  );
}

// ─── ExerciseCard Component ───────────────────────────────────────────────────

interface ExerciseCardProps {
  exercise: Exercise;
  theme: ReturnType<typeof useTheme>;
  onEdit: (exercise: Exercise) => void;
  onDelete: (exercise: Exercise) => void;
  onViewHistory: (exercise: Exercise) => void;
}

function ExerciseCard({ exercise, theme, onEdit, onDelete, onViewHistory }: ExerciseCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      style={[
        styles.exerciseCard,
        { borderColor: theme.border, backgroundColor: theme.backgroundElevated },
      ]}
      onPress={() => setExpanded(!expanded)}
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}, ${exercise.primaryMuscleGroup}${expanded ? ', expanded' : ''}`}
    >
      <View style={styles.exerciseCardHeader}>
        <View style={styles.exerciseCardInfo}>
          <ThemedText style={[styles.exerciseName, { color: theme.text }]}>
            {exercise.name}
          </ThemedText>
          <View style={styles.muscleGroupRow}>
            <View
              style={[
                styles.muscleGroupBadge,
                { backgroundColor: theme.accentSoft },
              ]}
            >
              <ThemedText style={[styles.muscleGroupText, { color: theme.accent }]}>
                {exercise.primaryMuscleGroup}
              </ThemedText>
            </View>
            {exercise.secondaryMuscleGroups?.map((group) => (
              <View
                key={group}
                style={[
                  styles.muscleGroupBadge,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <ThemedText
                  style={[styles.muscleGroupText, { color: theme.textSecondary }]}
                >
                  {group}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>
        {!exercise.isGlobal && (
          <View style={[styles.customBadge, { backgroundColor: theme.successSoft }]}>
            <ThemedText style={[styles.customBadgeText, { color: theme.success }]}>
              Custom
            </ThemedText>
          </View>
        )}
      </View>

      {/* Expanded Detail */}
      {expanded && (
        <View style={[styles.expandedContent, { borderTopColor: theme.borderSubtle }]}>
          {exercise.instructions ? (
            <ThemedText
              type="bodyMedium"
              style={{ color: theme.textSecondary, marginBottom: Spacing.two }}
            >
              {exercise.instructions}
            </ThemedText>
          ) : (
            <ThemedText
              type="bodyMedium"
              style={{ color: theme.textTertiary, fontStyle: 'italic', marginBottom: Spacing.two }}
            >
              No instructions available.
            </ThemedText>
          )}

          <View style={styles.exerciseActions}>
            <Pressable
              style={[styles.actionButton, { backgroundColor: theme.accentSoft }]}
              onPress={() => onViewHistory(exercise)}
              accessibilityRole="button"
              accessibilityLabel={`View history for ${exercise.name}`}
            >
              <ThemedText style={{ color: theme.accent, fontWeight: '600', fontSize: 13 }}>
                View History
              </ThemedText>
            </Pressable>
            {!exercise.isGlobal && (
              <>
                <Pressable
                  style={[styles.actionButton, { backgroundColor: theme.backgroundElement }]}
                  onPress={() => onEdit(exercise)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${exercise.name}`}
                >
                  <ThemedText style={{ color: theme.accent, fontWeight: '600', fontSize: 13 }}>
                    Edit
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, { backgroundColor: theme.errorSoft }]}
                  onPress={() => onDelete(exercise)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${exercise.name}`}
                >
                  <ThemedText style={{ color: theme.error, fontWeight: '600', fontSize: 13 }}>
                    Delete
                  </ThemedText>
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}

// ─── ExerciseFormModal Component ──────────────────────────────────────────────

interface ExerciseFormModalProps {
  visible: boolean;
  title: string;
  initialValues?: ExerciseFormState;
  onClose: () => void;
  onSubmit: (form: ExerciseFormState) => void;
  theme: ReturnType<typeof useTheme>;
}

function ExerciseFormModal({
  visible,
  title,
  initialValues,
  onClose,
  onSubmit,
  theme,
}: ExerciseFormModalProps) {
  const [form, setForm] = useState<ExerciseFormState>(initialValues ?? INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const nameRef = useRef<TextInput>(null);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (visible) {
      setForm(initialValues ?? INITIAL_FORM);
      setErrors({});
    }
  }, [visible, initialValues]);

  const handleSubmit = () => {
    const result = validateExercise({
      name: form.name,
      primary_muscle_group: form.primaryMuscleGroup,
      secondary_muscle_groups: form.secondaryMuscleGroups,
      instructions: form.instructions || null,
    });

    if (!result.valid) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    onSubmit(form);
  };

  const toggleSecondaryGroup = (group: string) => {
    setForm((prev) => {
      const groups = prev.secondaryMuscleGroups.includes(group)
        ? prev.secondaryMuscleGroups.filter((g) => g !== group)
        : prev.secondaryMuscleGroups.length < 3
          ? [...prev.secondaryMuscleGroups, group]
          : prev.secondaryMuscleGroups;
      return { ...prev, secondaryMuscleGroups: groups };
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContent,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <ThemedText type="headlineSmall" style={{ color: theme.text }}>
              {title}
            </ThemedText>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <ThemedText style={{ color: theme.accent, fontSize: 16, fontWeight: '600' }}>
                Cancel
              </ThemedText>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalForm}>
            {/* Name Input */}
            <View style={styles.formField}>
              <ThemedText style={[styles.formLabel, { color: theme.text }]}>
                Name *
              </ThemedText>
              <TextInput
                ref={nameRef}
                style={[
                  styles.formInput,
                  {
                    borderColor: errors.name ? theme.error : theme.border,
                    color: theme.text,
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
                value={form.name}
                onChangeText={(text) => setForm((f) => ({ ...f, name: text }))}
                placeholder="e.g. Bulgarian Split Squat"
                placeholderTextColor={theme.textTertiary}
                maxLength={100}
                accessibilityLabel="Exercise name"
              />
              {errors.name && (
                <ThemedText style={[styles.errorText, { color: theme.error }]}>
                  {errors.name}
                </ThemedText>
              )}
            </View>

            {/* Primary Muscle Group */}
            <View style={styles.formField}>
              <ThemedText style={[styles.formLabel, { color: theme.text }]}>
                Primary Muscle Group *
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipContainer}
              >
                {MUSCLE_GROUPS.map((group) => (
                  <Pressable
                    key={group}
                    style={[
                      styles.chip,
                      {
                        backgroundColor:
                          form.primaryMuscleGroup === group
                            ? theme.accent
                            : theme.backgroundElement,
                        borderColor:
                          form.primaryMuscleGroup === group
                            ? theme.accent
                            : theme.border,
                      },
                    ]}
                    onPress={() =>
                      setForm((f) => ({ ...f, primaryMuscleGroup: group }))
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${group} as primary`}
                    accessibilityState={{
                      selected: form.primaryMuscleGroup === group,
                    }}
                  >
                    <ThemedText
                      style={[
                        styles.chipText,
                        {
                          color:
                            form.primaryMuscleGroup === group
                              ? '#fff'
                              : theme.text,
                        },
                      ]}
                    >
                      {group.charAt(0).toUpperCase() + group.slice(1)}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
              {errors.primary_muscle_group && (
                <ThemedText style={[styles.errorText, { color: theme.error }]}>
                  {errors.primary_muscle_group}
                </ThemedText>
              )}
            </View>

            {/* Secondary Muscle Groups (multi-select, max 3) */}
            <View style={styles.formField}>
              <ThemedText style={[styles.formLabel, { color: theme.text }]}>
                Secondary Muscle Groups (up to 3)
              </ThemedText>
              <View style={styles.chipWrap}>
                {MUSCLE_GROUPS.filter((g) => g !== form.primaryMuscleGroup).map(
                  (group) => {
                    const isSelected = form.secondaryMuscleGroups.includes(group);
                    return (
                      <Pressable
                        key={group}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isSelected
                              ? theme.accentMuted
                              : theme.backgroundElement,
                            borderColor: isSelected
                              ? theme.accent
                              : theme.border,
                          },
                        ]}
                        onPress={() => toggleSecondaryGroup(group)}
                        accessibilityRole="button"
                        accessibilityLabel={`${isSelected ? 'Deselect' : 'Select'} ${group} as secondary`}
                        accessibilityState={{ selected: isSelected }}
                      >
                        <ThemedText
                          style={[
                            styles.chipText,
                            {
                              color: isSelected ? '#fff' : theme.text,
                            },
                          ]}
                        >
                          {group.charAt(0).toUpperCase() + group.slice(1)}
                        </ThemedText>
                      </Pressable>
                    );
                  }
                )}
              </View>
              {errors.secondary_muscle_groups && (
                <ThemedText style={[styles.errorText, { color: theme.error }]}>
                  {errors.secondary_muscle_groups}
                </ThemedText>
              )}
            </View>

            {/* Instructions */}
            <View style={styles.formField}>
              <ThemedText style={[styles.formLabel, { color: theme.text }]}>
                Instructions
              </ThemedText>
              <TextInput
                style={[
                  styles.formTextArea,
                  {
                    borderColor: errors.instructions ? theme.error : theme.border,
                    color: theme.text,
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
                value={form.instructions}
                onChangeText={(text) =>
                  setForm((f) => ({ ...f, instructions: text }))
                }
                placeholder="Describe how to perform this exercise…"
                placeholderTextColor={theme.textTertiary}
                multiline
                numberOfLines={4}
                maxLength={2000}
                textAlignVertical="top"
                accessibilityLabel="Exercise instructions"
              />
              {errors.instructions && (
                <ThemedText style={[styles.errorText, { color: theme.error }]}>
                  {errors.instructions}
                </ThemedText>
              )}
            </View>

            {/* Submit Button */}
            <Pressable
              style={[styles.submitButton, { backgroundColor: theme.accent }]}
              onPress={handleSubmit}
              accessibilityRole="button"
              accessibilityLabel={`Save exercise`}
            >
              <ThemedText style={[styles.submitButtonText, { color: theme.accentText }]}>Save Exercise</ThemedText>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchSection: {
    padding: Spacing.three,
    paddingBottom: Spacing.two,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.twoHalf,
    fontSize: 15,
    minHeight: 48,
  },
  chipScroll: {
    maxHeight: 44,
    paddingBottom: Spacing.two,
  },
  chipContainer: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radii.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    padding: Spacing.three,
    paddingBottom: 100,
    gap: Spacing.two,
  },
  exerciseCard: {
    borderWidth: 1,
    borderRadius: Radii.large,
    padding: Spacing.three,
  },
  exerciseCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  exerciseCardInfo: {
    flex: 1,
    gap: Spacing.one,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '600',
  },
  muscleGroupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  muscleGroupBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radii.full,
  },
  muscleGroupText: {
    fontSize: 11,
    fontWeight: '500',
  },
  customBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radii.full,
  },
  customBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  expandedContent: {
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
  },
  exerciseActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.medium,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.seven,
    paddingHorizontal: Spacing.four,
  },
  createButton: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.twoHalf,
    borderRadius: Radii.medium,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: Spacing.four,
    right: Spacing.four,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 30,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 1,
  },
  modalForm: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  formField: {
    gap: Spacing.one,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: Spacing.one,
  },
  formInput: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.twoHalf,
    fontSize: 15,
    minHeight: 48,
  },
  formTextArea: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.twoHalf,
    fontSize: 15,
    minHeight: 100,
  },
  errorText: {
    fontSize: 12,
    marginTop: Spacing.one,
  },
  submitButton: {
    paddingVertical: Spacing.three,
    borderRadius: Radii.medium,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: Spacing.two,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
