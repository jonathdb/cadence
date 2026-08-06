/**
 * SyncStatusBadge - Shows failed sync count with manual retry action.
 *
 * Displays a badge indicating the number of permanently failed WAL entries
 * and provides a button to manually retry syncing those entries.
 *
 * Requirements: 4.7
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radii, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getSyncEngine } from '@/services/sync-engine';
import { useCadenceStore } from '@/store/index';

/**
 * Renders a badge with the count of unsynced (permanently failed) entries
 * and a retry button. Returns null when no failed entries exist.
 */
export function SyncStatusBadge() {
  const theme = useTheme();
  const failedSyncCount = useCadenceStore((state) => state.failedSyncCount);
  const updateSyncStatus = useCadenceStore((state) => state.updateSyncStatus);
  const [isRetrying, setIsRetrying] = useState(false);

  // Don't show if there are no failed entries
  if (failedSyncCount === 0) {
    return null;
  }

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const syncEngine = getSyncEngine();
      await syncEngine.retryFailed();
      updateSyncStatus();
    } catch {
      // Retry failed silently — the badge will persist
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.errorSoft, borderColor: theme.error },
      ]}
      accessibilityRole="alert"
      accessibilityLabel={`${failedSyncCount} ${failedSyncCount === 1 ? 'entry' : 'entries'} failed to sync. Tap retry to try again.`}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.content}>
        <View style={[styles.badge, { backgroundColor: theme.error }]}>
          <Text style={styles.badgeText}>{failedSyncCount}</Text>
        </View>
        <Text style={[styles.message, { color: theme.error }]}>
          {failedSyncCount === 1
            ? '1 entry failed to sync'
            : `${failedSyncCount} entries failed to sync`}
        </Text>
      </View>
      <Pressable
        onPress={handleRetry}
        disabled={isRetrying}
        style={[styles.retryButton, { backgroundColor: theme.error }]}
        accessibilityRole="button"
        accessibilityLabel="Retry syncing failed entries"
        accessibilityState={{ disabled: isRetrying }}
      >
        {isRetrying ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.retryText}>Retry</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
    gap: Spacing.two,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  badge: {
    width: 22,
    height: 22,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    ...TypeScale.labelSmall,
    color: '#ffffff',
    fontWeight: '700',
  },
  message: {
    ...TypeScale.labelMedium,
    flex: 1,
  },
  retryButton: {
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radii.small,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    ...TypeScale.labelMedium,
    color: '#ffffff',
    fontWeight: '600',
  },
});
