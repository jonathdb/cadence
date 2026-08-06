/**
 * Undo Toast Component
 *
 * Displays a toast at the bottom of the screen with a message and "Undo" button.
 * Auto-dismisses after 5 seconds. If user taps "Undo", the onUndo callback fires.
 *
 * Requirements: 9.5 (5-second undo option for deleted sets)
 */
import { useEffect, useRef } from 'react';
import {
    Animated,
    Pressable,
    StyleSheet,
    View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface UndoToastProps {
  visible: boolean;
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
}

const TOAST_DURATION_MS = 5000;

export function UndoToast({ visible, message, onUndo, onDismiss }: UndoToastProps) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      // Animate in
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-dismiss after 5 seconds
      timerRef.current = setTimeout(() => {
        dismissToast();
      }, TOAST_DURATION_MS);
    } else {
      // Animate out
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 20,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissToast = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 20,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  const handleUndo = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onUndo();
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: theme.backgroundElevated,
          borderColor: theme.border,
          opacity,
          transform: [{ translateY }],
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel={`${message}. Tap undo to restore.`}
    >
      <View style={styles.content}>
        <ThemedText style={[styles.message, { color: theme.text }]}>
          {message}
        </ThemedText>
        <Pressable
          style={[styles.undoButton, { backgroundColor: theme.accentSoft }]}
          onPress={handleUndo}
          accessibilityRole="button"
          accessibilityLabel="Undo delete"
        >
          <ThemedText style={[styles.undoText, { color: theme.accent }]}>
            Undo
          </ThemedText>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Spacing.six,
    left: Spacing.three,
    right: Spacing.three,
    borderRadius: Radii.large,
    borderWidth: 1,
    padding: Spacing.three,
    zIndex: 1000,
    elevation: 10,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  undoButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.medium,
    marginLeft: Spacing.two,
  },
  undoText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
