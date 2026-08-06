/**
 * AppCrashScreen - User-friendly fallback UI displayed when an error boundary catches an unhandled error.
 *
 * Shows the error message (in dev mode) and a "Retry" action that re-renders the failed component tree.
 * Styled using the Cadence dark-first design system.
 *
 * Requirements: 19.2, 19.3
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TouchTarget, TypeScale } from '@/constants/theme';

export interface AppCrashScreenProps {
  /** The error that was caught */
  error: Error;
  /** Called when the user taps "Retry" to re-render the failed tree */
  onReset: () => void;
}

export function AppCrashScreen({ error, onReset }: AppCrashScreenProps) {
  return (
    <View style={styles.container} accessibilityRole="alert" accessibilityLabel="Application error occurred">
      <View style={styles.content}>
        <ThemedText type="displayMedium" style={styles.emoji}>
          ⚠️
        </ThemedText>

        <ThemedText type="headlineLarge" style={styles.title}>
          Something went wrong
        </ThemedText>

        <ThemedText type="bodyLarge" style={styles.subtitle}>
          The app encountered an unexpected error. Tap the button below to try again.
        </ThemedText>

        {__DEV__ && (
          <View style={styles.errorBox}>
            <ThemedText type="labelMedium" style={styles.errorLabel}>
              Error Details (dev only)
            </ThemedText>
            <ThemedText type="bodySmall" style={styles.errorMessage} numberOfLines={6}>
              {error.message}
            </ThemedText>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
          onPress={onReset}
          accessibilityRole="button"
          accessibilityLabel="Retry"
          accessibilityHint="Attempts to re-render the failed component"
        >
          <ThemedText type="labelLarge" style={styles.retryText}>
            Retry
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  content: {
    alignItems: 'center',
    maxWidth: 360,
  },
  emoji: {
    fontSize: 64,
    marginBottom: Spacing.four,
  },
  title: {
    color: Colors.dark.text,
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  subtitle: {
    color: Colors.dark.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.five,
  },
  errorBox: {
    backgroundColor: Colors.dark.errorSoft,
    borderWidth: 1,
    borderColor: Colors.dark.error,
    borderRadius: Radii.medium,
    padding: Spacing.three,
    marginBottom: Spacing.five,
    width: '100%',
  },
  errorLabel: {
    color: Colors.dark.error,
    marginBottom: Spacing.one,
  },
  errorMessage: {
    color: Colors.dark.textSecondary,
    fontFamily: 'monospace',
  },
  retryButton: {
    backgroundColor: Colors.dark.accent,
    borderRadius: Radii.medium,
    paddingVertical: Spacing.twoHalf,
    paddingHorizontal: Spacing.five,
    minHeight: TouchTarget.minimum,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButtonPressed: {
    opacity: 0.85,
  },
  retryText: {
    color: '#ffffff',
    ...TypeScale.labelLarge,
  },
});
