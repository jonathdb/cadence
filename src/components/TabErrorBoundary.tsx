/**
 * TabErrorBoundary - Per-tab error boundary for isolated crash recovery.
 *
 * Wraps individual tab content so that a crash in one tab does not bring down
 * the entire app. Displays a lighter error UI with a "Retry" action that only
 * re-renders the affected tab's component tree.
 *
 * Requirements: 19.1, 19.2, 19.3, 19.4
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TouchTarget, TypeScale } from '@/constants/theme';
import { logError } from '@/lib/error-logger';

export interface TabErrorBoundaryProps {
  /** Name of the tab (used in logging) */
  tabName?: string;
  children: React.ReactNode;
}

interface TabErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class TabErrorBoundary extends React.Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  constructor(props: TabErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): TabErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logError(error, errorInfo, this.props.tabName);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <View style={styles.container} accessibilityRole="alert" accessibilityLabel={`Error in ${this.props.tabName ?? 'tab'}`}>
          <View style={styles.content}>
            <ThemedText type="headlineMedium" style={styles.title}>
              This tab crashed
            </ThemedText>

            <ThemedText type="bodyMedium" style={styles.subtitle}>
              An unexpected error occurred. You can retry or switch to another tab.
            </ThemedText>

            {__DEV__ && (
              <View style={styles.errorBox}>
                <ThemedText type="bodySmall" style={styles.errorMessage} numberOfLines={4}>
                  {this.state.error.message}
                </ThemedText>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
              onPress={this.handleReset}
              accessibilityRole="button"
              accessibilityLabel="Retry"
              accessibilityHint="Attempts to re-render this tab"
            >
              <ThemedText type="labelLarge" style={styles.retryText}>
                Retry
              </ThemedText>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
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
    maxWidth: 320,
  },
  title: {
    color: Colors.dark.text,
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  subtitle: {
    color: Colors.dark.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.four,
  },
  errorBox: {
    backgroundColor: Colors.dark.errorSoft,
    borderWidth: 1,
    borderColor: Colors.dark.error,
    borderRadius: Radii.small,
    padding: Spacing.twoHalf,
    marginBottom: Spacing.four,
    width: '100%',
  },
  errorMessage: {
    color: Colors.dark.textSecondary,
    fontFamily: 'monospace',
  },
  retryButton: {
    backgroundColor: Colors.dark.accent,
    borderRadius: Radii.medium,
    paddingVertical: Spacing.twoHalf,
    paddingHorizontal: Spacing.four,
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
