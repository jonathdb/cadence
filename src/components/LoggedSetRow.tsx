/**
 * Logged Set Row Component
 *
 * A reusable swipeable set row used in both [dayId].tsx and freestyle.tsx.
 * Supports:
 * - Tap to edit (opens SetEditModal)
 * - Swipe-left to reveal delete action
 * - Visible delete button for keyboard/switch control users (Req 24.4)
 * - Haptic feedback on interactions
 * - Accessibility labels and roles
 *
 * Requirements: 9.1, 9.3, 9.4, 14.2, 14.3, 24.1, 24.4
 */
import { useRef } from 'react';
import {
    Animated,
    Pressable,
    StyleSheet,
    View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface LoggedSetRowData {
  id: string;
  setNumber: number;
  reps: number;
  weight: number;
  rpe: number | null;
  notes: string | null;
  isPr: boolean | null;
}

interface LoggedSetRowProps {
  set: LoggedSetRowData;
  exerciseName: string;
  onEdit: (set: LoggedSetRowData) => void;
  onDelete: (set: LoggedSetRowData) => void;
}

export function LoggedSetRow({ set, exerciseName, onEdit, onDelete }: LoggedSetRowProps) {
  const theme = useTheme();
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0.5],
      extrapolate: 'clamp',
    });

    return (
      <Pressable
        style={[styles.deleteAction, { backgroundColor: theme.error }]}
        onPress={() => {
          swipeableRef.current?.close();
          onDelete(set);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Delete set ${set.setNumber}`}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <ThemedText style={styles.deleteText}>Delete</ThemedText>
        </Animated.View>
      </Pressable>
    );
  };

  return (
    <View style={styles.rowContainer}>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        rightThreshold={40}
        overshootRight={false}
      >
        <Pressable
          style={[styles.row, { backgroundColor: set.isPr ? theme.prBackground : 'transparent' }]}
          onPress={() => onEdit(set)}
          accessibilityRole="button"
          accessibilityLabel={`Set ${set.setNumber}: ${set.reps} reps at ${set.weight}kg${set.rpe ? `, RPE ${set.rpe}` : ''}${set.isPr ? ', personal record' : ''}. Tap to edit.`}
          accessibilityHint="Double tap to edit this set"
        >
          <ThemedText style={[styles.cell, { color: theme.textSecondary }]}>
            {set.setNumber}
          </ThemedText>
          <ThemedText style={[styles.cell, { color: theme.text }]}>
            {set.reps}
          </ThemedText>
          <ThemedText style={[styles.cell, { color: theme.text }]}>
            {set.weight}kg
          </ThemedText>
          <ThemedText style={[styles.cell, { color: theme.text }]}>
            {set.rpe ?? '—'}
          </ThemedText>
          <ThemedText style={styles.cellPr}>
            {set.isPr ? '🏆' : ''}
          </ThemedText>
        </Pressable>
      </Swipeable>

      {/* Visible delete button for keyboard/switch control accessibility (Req 24.4) */}
      <Pressable
        style={[styles.visibleDeleteButton, { backgroundColor: theme.errorSoft }]}
        onPress={() => onDelete(set)}
        accessibilityRole="button"
        accessibilityLabel={`Delete set ${set.setNumber} for ${exerciseName}`}
      >
        <ThemedText style={[styles.visibleDeleteText, { color: theme.error }]}>
          ✕
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    alignItems: 'center',
    minHeight: 44,
  },
  cell: {
    flex: 1,
    fontSize: 14,
    textAlign: 'center',
  },
  cellPr: {
    flex: 1,
    fontSize: 14,
    textAlign: 'center',
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    minHeight: 44,
  },
  deleteText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  visibleDeleteButton: {
    width: 32,
    height: 32,
    borderRadius: Radii.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.one,
  },
  visibleDeleteText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
