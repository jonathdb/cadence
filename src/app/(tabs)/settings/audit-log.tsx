/**
 * Audit Log screen.
 * Displays all Agent Tool_Call audit entries for the current user.
 * Each entry shows: timestamp, action type, permission category,
 * approval status, and outcome (success/failure).
 *
 * Features:
 * - Pull-to-refresh
 * - Pagination (load more on scroll)
 * - Color-coded status and outcome badges
 *
 * Requirements: 24.1, 24.2
 */
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTabBarClearance } from '@/hooks/useTabBarClearance';
import { useAuth } from '@/providers/AuthProvider';
import { getAuditLog, type AuditLogEntryRow } from '@/services/audit-log';
import type { ActionOutcome, ApprovalStatus } from '@/types/permissions';

const PAGE_SIZE = 20;

/** Human-readable labels for permission categories. */
const CATEGORY_LABELS: Record<string, string> = {
  program_edits: 'Program',
  journal_edits: 'Journal',
  spotify_actions: 'Spotify',
  health_access: 'Health',
};

/** Color for approval status badges. */
function getStatusColor(status: ApprovalStatus): string {
  switch (status) {
    case 'approved':
      return '#10b981';
    case 'rejected':
      return '#ef4444';
    case 'auto_applied':
      return '#06b6d4';
    default:
      return '#8b919a';
  }
}

/** Color for outcome badges. */
function getOutcomeColor(outcome: ActionOutcome): string {
  switch (outcome) {
    case 'success':
      return '#10b981';
    case 'failure':
      return '#ef4444';
    default:
      return '#8b919a';
  }
}

/** Format an ISO timestamp into a readable local date/time string. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Format a status value for display. */
function formatStatus(status: ApprovalStatus): string {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'auto_applied':
      return 'Auto Applied';
    default:
      return status;
  }
}

function AuditLogItem({ entry }: { entry: AuditLogEntryRow }) {
  const categoryLabel = CATEGORY_LABELS[entry.permission_category] ?? entry.permission_category;
  const theme = useTheme();

  return (
    <View style={[styles.entryCard, { backgroundColor: theme.backgroundElement }]} accessibilityRole="summary">
      {/* Header row: timestamp and action type */}
      <View style={styles.entryHeader}>
        <ThemedText type="small" themeColor="textSecondary">
          {formatTimestamp(entry.timestamp)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {categoryLabel}
        </ThemedText>
      </View>

      {/* Action type */}
      <ThemedText style={styles.actionType}>{entry.action_type}</ThemedText>

      {/* Status and outcome badges */}
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: getStatusColor(entry.approval_status) + '20' }]}>
          <ThemedText
            type="small"
            style={[styles.badgeText, { color: getStatusColor(entry.approval_status) }]}
          >
            {formatStatus(entry.approval_status)}
          </ThemedText>
        </View>

        <View style={[styles.badge, { backgroundColor: getOutcomeColor(entry.outcome) + '20' }]}>
          <ThemedText
            type="small"
            style={[styles.badgeText, { color: getOutcomeColor(entry.outcome) }]}
          >
            {entry.outcome === 'success' ? 'Success' : 'Failed'}
          </ThemedText>
        </View>
      </View>

      {/* Error message if failure */}
      {entry.error_message && (
        <ThemedText type="small" style={[styles.errorMessage, { color: theme.error }]}>
          {entry.error_message}
        </ThemedText>
      )}
    </View>
  );
}

export default function AuditLogScreen() {
  const { session } = useAuth();
  const dockClearance = useTabBarClearance();
  const [entries, setEntries] = useState<AuditLogEntryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEntries = useCallback(
    async (offset = 0, replace = true) => {
      if (!session?.user.id) return;

      try {
        const data = await getAuditLog(session.user.id, {
          limit: PAGE_SIZE,
          offset,
        });

        if (replace) {
          setEntries(data);
        } else {
          setEntries((prev) => [...prev, ...data]);
        }

        setHasMore(data.length === PAGE_SIZE);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load audit log');
      }
    },
    [session?.user.id]
  );

  useEffect(() => {
    loadEntries().finally(() => setIsLoading(false));
  }, [loadEntries]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadEntries(0, true);
    setIsRefreshing(false);
  }, [loadEntries]);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    await loadEntries(entries.length, false);
    setIsLoadingMore(false);
  }, [entries.length, hasMore, isLoadingMore, loadEntries]);

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {error && (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      )}

      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AuditLogItem entry={item} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: dockClearance }]}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <ThemedText themeColor="textSecondary">No audit log entries yet.</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Agent actions will appear here once the Agent performs tool calls.
            </ThemedText>
          </View>
        }
      />
    </ThemedView>
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
  },
  listContent: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  entryCard: {
    padding: Spacing.three,
    borderRadius: Radii.medium,
    gap: Spacing.one,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionType: {
    fontWeight: '600',
    fontSize: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radii.full,
  },
  badgeText: {
    fontWeight: '600',
  },
  errorMessage: {
    marginTop: Spacing.one,
  },
  errorContainer: {
    padding: Spacing.two,
    margin: Spacing.four,
    borderRadius: Radii.medium,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.five,
  },
  footerLoader: {
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
