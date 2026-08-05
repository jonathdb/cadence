/**
 * Permission category toggles screen.
 * Allows users to toggle each permission category between
 * 'approval_required' and 'auto_apply'.
 *
 * Uses the permission service to read/write settings.
 *
 * Requirements: 23.1
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/AuthProvider';
import {
    ALL_PERMISSION_CATEGORIES,
    getUserPermissions,
    updatePermission,
} from '@/services/permissions';
import type { PermissionCategory, PermissionMode } from '@/types/permissions';

/** Human-readable labels and descriptions for each permission category. */
const CATEGORY_INFO: Record<PermissionCategory, { label: string; description: string }> = {
  program_edits: {
    label: 'Program Edits',
    description: 'Allow the Agent to modify your training program without asking first',
  },
  journal_edits: {
    label: 'Journal Edits',
    description: 'Allow the Agent to draft and save journal entries automatically',
  },
  spotify_actions: {
    label: 'Spotify Actions',
    description: 'Allow the Agent to search, create, and modify playlists automatically',
  },
  health_access: {
    label: 'Health Data Access',
    description: 'Allow the Agent to access your health data summaries automatically',
  },
};

export default function PermissionsScreen() {
  const { session } = useAuth();
  const theme = useTheme();
  const [permissions, setPermissions] = useState<Record<PermissionCategory, PermissionMode> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingCategory, setUpdatingCategory] = useState<PermissionCategory | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPermissions = useCallback(async () => {
    if (!session?.user.id) return;

    try {
      const perms = await getUserPermissions(session.user.id);
      setPermissions(perms);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permissions');
    } finally {
      setIsLoading(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  async function handleToggle(category: PermissionCategory, currentMode: PermissionMode) {
    if (!session?.user.id) return;

    const newMode: PermissionMode = currentMode === 'approval_required' ? 'auto_apply' : 'approval_required';

    setUpdatingCategory(category);
    setError(null);

    try {
      await updatePermission(session.user.id, category, newMode);
      setPermissions((prev) => (prev ? { ...prev, [category]: newMode } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update permission');
    } finally {
      setUpdatingCategory(null);
    }
  }

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <ThemedText type="small" themeColor="textSecondary">
            Control what the Agent can do automatically. When set to &quot;Auto Apply&quot;, the Agent will
            execute actions without asking for confirmation. When set to &quot;Approval Required&quot; (default),
            you must approve each action.
          </ThemedText>
        </View>

        {error && (
          <View style={[styles.errorContainer, { backgroundColor: theme.errorSoft }]}>
            <ThemedText style={{ fontSize: 14, color: theme.error, textAlign: 'center' }}>{error}</ThemedText>
          </View>
        )}

        <View style={styles.section}>
          {ALL_PERMISSION_CATEGORIES.map((category) => {
            const info = CATEGORY_INFO[category];
            const mode = permissions?.[category] ?? 'approval_required';
            const isAutoApply = mode === 'auto_apply';
            const isUpdating = updatingCategory === category;

            return (
              <View key={category} style={[styles.permissionRow, { backgroundColor: theme.backgroundElement }]}>
                <View style={styles.permissionInfo}>
                  <ThemedText style={styles.permissionLabel}>{info.label}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {info.description}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: isAutoApply ? theme.accent : theme.textSecondary, fontWeight: '600' }}>
                    {isAutoApply ? 'Auto Apply' : 'Approval Required'}
                  </ThemedText>
                </View>
                <View style={styles.toggleContainer}>
                  {isUpdating ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <Switch
                      value={isAutoApply}
                      onValueChange={() => handleToggle(category, mode)}
                      trackColor={{ false: theme.border, true: theme.accent }}
                      accessibilityLabel={`Toggle ${info.label} to ${isAutoApply ? 'approval required' : 'auto apply'}`}
                    />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
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
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.three,
  },
  errorContainer: {
    padding: Spacing.two,
    borderRadius: Radii.medium,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Radii.medium,
  },
  permissionInfo: {
    flex: 1,
    gap: 2,
  },
  permissionLabel: {
    fontWeight: '600',
    fontSize: 16,
  },
  toggleContainer: {
    marginLeft: Spacing.two,
  },
});
