/**
 * Set Edit Modal
 *
 * A modal form for editing a logged set's values (reps, weight, RPE, notes).
 * Pre-fills with the existing set data and validates inputs before saving.
 *
 * Requirements: 9.1 (tap-to-edit with pre-filled form)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AccessibilityInfo,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
    View
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface SetEditData {
  reps: number;
  weight: number;
  rpe: number | null;
  notes: string | null;
}

interface SetEditModalProps {
  visible: boolean;
  setNumber: number;
  initialData: SetEditData;
  exerciseName: string;
  onSave: (data: SetEditData) => void;
  onCancel: () => void;
}

export function SetEditModal({
  visible,
  setNumber,
  initialData,
  exerciseName,
  onSave,
  onCancel,
}: SetEditModalProps) {
  const theme = useTheme();
  const [reps, setReps] = useState(initialData.reps.toString());
  const [weight, setWeight] = useState(initialData.weight.toString());
  const [rpe, setRpe] = useState(initialData.rpe?.toString() ?? '');
  const [notes, setNotes] = useState(initialData.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const repsInputRef = useRef<TextInput>(null);

  // Re-sync form when modal opens with new data
  useEffect(() => {
    if (visible) {
      setReps(initialData.reps.toString());
      setWeight(initialData.weight.toString());
      setRpe(initialData.rpe?.toString() ?? '');
      setNotes(initialData.notes ?? '');
      setError(null);

      // Focus management: move focus to first input on modal open (Req 24.4)
      const timer = setTimeout(() => {
        repsInputRef.current?.focus();
        // Announce modal to screen readers
        if (Platform.OS !== 'web') {
          AccessibilityInfo.announceForAccessibility(
            `Edit set ${setNumber} for ${exerciseName}. Reps field focused.`
          );
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible, initialData, setNumber, exerciseName]);

  const handleSave = useCallback(() => {
    const parsedReps = parseInt(reps, 10);
    const parsedWeight = parseFloat(weight);
    const parsedRpe = rpe ? parseFloat(rpe) : null;

    if (isNaN(parsedReps) || parsedReps < 1 || parsedReps > 999) {
      setError('Reps must be between 1 and 999');
      return;
    }

    if (isNaN(parsedWeight) || parsedWeight < 0 || parsedWeight > 999) {
      setError('Weight must be between 0 and 999');
      return;
    }

    if (parsedRpe !== null && (isNaN(parsedRpe) || parsedRpe < 1 || parsedRpe > 10)) {
      setError('RPE must be between 1 and 10');
      return;
    }

    setError(null);
    onSave({
      reps: parsedReps,
      weight: parsedWeight,
      rpe: parsedRpe,
      notes: notes.trim() || null,
    });
  }, [reps, weight, rpe, notes, onSave]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable
        style={styles.overlay}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Close edit modal"
      >
        <Pressable
          style={[styles.modalContent, { backgroundColor: theme.backgroundElevated, borderColor: theme.border }]}
          onPress={() => {}}
          accessibilityRole="none"
          accessibilityViewIsModal={true}
        >
          <ThemedText type="subtitle" style={{ color: theme.text }}>
            Edit Set {setNumber}
          </ThemedText>
          <ThemedText style={[styles.exerciseLabel, { color: theme.textSecondary }]}>
            {exerciseName}
          </ThemedText>

          {error && (
            <ThemedText style={[styles.errorText, { color: theme.error }]}>
              {error}
            </ThemedText>
          )}

          <View style={styles.formRow}>
            <View style={styles.formField}>
              <ThemedText style={[styles.formLabel, { color: theme.textSecondary }]}>
                Reps
              </ThemedText>
              <TextInput
                style={[styles.formInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement }]}
                ref={repsInputRef}
                value={reps}
                onChangeText={setReps}
                keyboardType="numeric"
                accessibilityLabel="Edit reps"
                selectTextOnFocus
              />
            </View>
            <View style={styles.formField}>
              <ThemedText style={[styles.formLabel, { color: theme.textSecondary }]}>
                Weight
              </ThemedText>
              <TextInput
                style={[styles.formInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement }]}
                value={weight}
                onChangeText={setWeight}
                keyboardType="numeric"
                accessibilityLabel="Edit weight"
                selectTextOnFocus
              />
            </View>
            <View style={styles.formField}>
              <ThemedText style={[styles.formLabel, { color: theme.textSecondary }]}>
                RPE
              </ThemedText>
              <TextInput
                style={[styles.formInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement }]}
                value={rpe}
                onChangeText={setRpe}
                keyboardType="numeric"
                accessibilityLabel="Edit RPE"
                placeholder="—"
                placeholderTextColor={theme.textTertiary}
                selectTextOnFocus
              />
            </View>
          </View>

          <View style={styles.notesField}>
            <ThemedText style={[styles.formLabel, { color: theme.textSecondary }]}>
              Notes
            </ThemedText>
            <TextInput
              style={[styles.notesInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes"
              placeholderTextColor={theme.textTertiary}
              accessibilityLabel="Edit notes"
              multiline
            />
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.cancelButton, { backgroundColor: theme.backgroundElement }]}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel editing"
            >
              <ThemedText style={{ color: theme.textSecondary }}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.saveButton, { backgroundColor: theme.accent }]}
              onPress={handleSave}
              accessibilityRole="button"
              accessibilityLabel="Save set changes"
            >
              <ThemedText style={styles.saveButtonText}>Save</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Radii.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  exerciseLabel: {
    fontSize: 13,
    marginTop: -Spacing.two,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
  },
  formRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  formField: {
    flex: 1,
    gap: 4,
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
    paddingVertical: Spacing.two,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    minHeight: 48,
  },
  notesField: {
    gap: 4,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 14,
    minHeight: 48,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.twoHalf,
    borderRadius: Radii.medium,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  saveButton: {
    flex: 1,
    paddingVertical: Spacing.twoHalf,
    borderRadius: Radii.medium,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
