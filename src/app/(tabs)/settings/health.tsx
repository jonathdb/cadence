/**
 * Health provider connection screen.
 * Shows permission status, allows connecting to HealthKit/Health Connect,
 * and provides a manual sync trigger.
 * Uses the health adapter service.
 *
 * Requirements: 12.1
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import {
    getHealthConnectionStatus,
    type HealthPermissions,
    isHealthAvailable,
    type PermissionStatus,
    requestHealthPermissions,
    syncHealthData,
    type SyncResult,
} from '@/services/health/adapter';

export default function HealthScreen() {
  const { session } = useAuth();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [permissions, setPermissions] = useState<HealthPermissions | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const isAvail = await isHealthAvailable();
      setAvailable(isAvail);

      if (isAvail) {
        const status = await getHealthConnectionStatus();
        setPermissions(status.permissions);
        setProvider(status.provider);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleRequestPermissions() {
    setIsRequesting(true);
    setError(null);

    try {
      const result = await requestHealthPermissions();
      setPermissions(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request permissions');
    } finally {
      setIsRequesting(false);
    }
  }

  async function handleSync() {
    if (!session?.user.id) return;

    setIsSyncing(true);
    setError(null);
    setSyncResult(null);

    try {
      const result = await syncHealthData(session.user.id);
      setSyncResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }

  function getPermissionStatusColor(status: PermissionStatus): string {
    switch (status) {
      case 'granted':
        return '#16a34a';
      case 'denied':
        return '#dc2626';
      case 'not_determined':
        return '#d97706';
      default:
        return '#6b7280';
    }
  }

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (available === false) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.section}>
            <ThemedText type="small" themeColor="textSecondary">
              Health data integration is not available on this device. Cadence works fully without
              health data — this feature requires Apple HealthKit (iOS) or Health Connect (Android).
            </ThemedText>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <ThemedText type="small" themeColor="textSecondary">
            Connect to {provider === 'apple_healthkit' ? 'Apple HealthKit' : 'Health Connect'} to
            import workout, sleep, and activity data. This helps the Agent provide better recovery
            and training recommendations.
          </ThemedText>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        )}

        {/* Permission Status */}
        {permissions && (
          <View style={styles.statusCard}>
            <ThemedText style={styles.sectionLabel}>Permissions</ThemedText>
            <PermissionRow label="Workouts" status={permissions.workouts} getColor={getPermissionStatusColor} />
            <PermissionRow label="Heart Rate" status={permissions.heartRate} getColor={getPermissionStatusColor} />
            <PermissionRow label="Sleep" status={permissions.sleep} getColor={getPermissionStatusColor} />
            <PermissionRow label="Activity" status={permissions.activity} getColor={getPermissionStatusColor} />
          </View>
        )}

        {/* Connect / Request Permissions Button */}
        <View style={styles.section}>
          <Pressable
            style={[styles.connectButton, isRequesting && styles.buttonDisabled]}
            onPress={handleRequestPermissions}
            disabled={isRequesting}
            accessibilityRole="button"
            accessibilityLabel="Request health data permissions"
          >
            {isRequesting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ThemedText style={styles.buttonText}>
                {permissions?.workouts === 'granted' ? 'Re-request Permissions' : 'Connect Health Provider'}
              </ThemedText>
            )}
          </Pressable>
        </View>

        {/* Manual Sync */}
        {permissions?.workouts === 'granted' && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionLabel}>Data Sync</ThemedText>
            <Pressable
              style={[styles.syncButton, isSyncing && styles.buttonDisabled]}
              onPress={handleSync}
              disabled={isSyncing}
              accessibilityRole="button"
              accessibilityLabel="Trigger manual health data sync"
            >
              {isSyncing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={styles.buttonText}>Sync Now</ThemedText>
              )}
            </Pressable>

            {syncResult && (
              <View style={[styles.syncResultCard, !syncResult.success && styles.syncResultError]}>
                <ThemedText type="small">
                  Records synced: {syncResult.recordsSynced}
                </ThemedText>
                <ThemedText type="small">
                  Records normalized: {syncResult.recordsNormalized}
                </ThemedText>
                {syncResult.errors.length > 0 && (
                  <ThemedText type="small" style={styles.syncErrorText}>
                    {syncResult.errors.length} error(s) occurred
                  </ThemedText>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

/** Permission status row component. */
function PermissionRow({
  label,
  status,
  getColor,
}: {
  label: string;
  status: PermissionStatus;
  getColor: (s: PermissionStatus) => string;
}) {
  return (
    <View style={permRowStyles.row}>
      <ThemedText type="small">{label}</ThemedText>
      <ThemedText type="small" style={{ color: getColor(status), fontWeight: '600' }}>
        {status.replace('_', ' ')}
      </ThemedText>
    </View>
  );
}

const permRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    fontWeight: '600',
    fontSize: 14,
  },
  errorContainer: {
    backgroundColor: '#fee2e2',
    padding: Spacing.two,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
  },
  statusCard: {
    padding: Spacing.three,
    borderRadius: 8,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
    gap: Spacing.one,
  },
  connectButton: {
    backgroundColor: '#3c87f7',
    borderRadius: 8,
    padding: Spacing.two + 4,
    alignItems: 'center',
  },
  syncButton: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    padding: Spacing.two + 4,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  syncResultCard: {
    padding: Spacing.two,
    borderRadius: 8,
    backgroundColor: '#dcfce7',
    gap: Spacing.one,
  },
  syncResultError: {
    backgroundColor: '#fef3c7',
  },
  syncErrorText: {
    color: '#dc2626',
  },
});
