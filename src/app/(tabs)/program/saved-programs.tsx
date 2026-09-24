/**
 * Program Library screen — lists all user programs (active, archived, draft).
 * Shows status badge per program. Supports activating a different program
 * using the activate_program RPC (atomically archives current, activates new).
 *
 * Program lifecycle affordances (archive-first model):
 * - Each row has a Delete affordance → confirmation naming the program, with a
 *   default Archive action and a secondary, explicitly-confirmed
 *   "Delete permanently" (purge) action.
 * - Archived rows can be hidden; a "Show hidden" toggle surfaces hidden rows
 *   and offers an Unhide action.
 *
 * Requirements: 3.1, 3.3, 3.5, 3.6, 4.3, 5.1, 5.2
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTabBarClearance } from '@/hooks/useTabBarClearance';
import { useAuth } from '@/providers/AuthProvider';
import {
    archiveProgram,
    listPrograms,
    purgeProgram,
    setProgramHidden,
} from '@/services/program-manager';
import { getSyncEngine } from '@/services/sync-engine';
import { publishTemplate } from '@/services/template-service';
import { getWAL } from '@/services/wal';
import type { Program } from '@/types/program';
import { supabase } from '@/utils/supabase';

/**
 * Whether local offline plumbing (WAL + sync engine) is available.
 * WAL relies on expo-sqlite, which is native-only; on web we fall back to
 * direct Supabase calls via program-manager.
 */
const OFFLINE_SUPPORTED = Platform.OS !== 'web';

/**
 * Enqueue a program lifecycle op in the local WAL and kick a sync flush.
 * Returns true if the op was enqueued (native), false if offline plumbing is
 * unavailable (web) and the caller should fall back to a direct call.
 */
function enqueueProgramOp(
  operation: 'program_archive' | 'program_hide' | 'program_purge',
  programId: string,
  payload: Record<string, unknown>
): boolean {
  if (!OFFLINE_SUPPORTED) return false;

  try {
    const wal = getWAL();
    wal.enqueue({
      operation,
      payload,
      table_name: 'programs',
      record_id: programId,
    });
  } catch {
    // WAL not initialized (shouldn't happen on native post-startup) — let the
    // caller fall back to a direct call.
    return false;
  }

  // Trigger an immediate flush; when offline this is a no-op and the sync
  // engine re-flushes automatically on reconnect (within 30s per design §4).
  try {
    void getSyncEngine().flush();
  } catch {
    // Sync engine not initialized — the WAL entry still persists and will be
    // flushed on the next reconnect/startup.
  }

  return true;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  archived: 'Archived',
  draft: 'Draft',
};

export default function ProgramLibraryScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const dockClearance = useTabBarClearance();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  // Per-row busy flag so a row shows progress and can't be double-actioned
  // while an archive/hide/purge is in flight.
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  function getStatusColor(status: string) {
    switch (status) {
      case 'active': return theme.success;
      case 'draft': return theme.warning;
      default: return theme.textSecondary;
    }
  }

  const fetchPrograms = useCallback(async () => {
    if (!session) return;

    try {
      const data = await listPrograms(supabase, session.user.id, {
        includeHidden: showHidden,
      });
      setPrograms(data);
    } catch (err) {
      console.error('Error fetching programs:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [session, showHidden]);

  useFocusEffect(
    useCallback(() => {
      fetchPrograms();
    }, [fetchPrograms])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPrograms();
  }, [fetchPrograms]);

  const handlePublishTemplate = useCallback(
    (program: Program) => {
      if (!session) return;

      Alert.prompt
        ? Alert.prompt(
            'Publish as Template',
            'Enter a title for the shareable template:',
            async (title: string) => {
              if (!title?.trim()) return;
              try {
                const result = await publishTemplate(supabase, session.user.id, program.id, {
                  title: title.trim(),
                  description: `${program.name} — ${program.program_days.length} day program`,
                });
                Alert.alert(
                  'Published!',
                  `Template available at: cadence.app/t/${result.slug}`,
                  [{ text: 'OK' }]
                );
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Publish failed';
                Alert.alert('Error', msg);
              }
            },
            'plain-text',
            program.name
          )
        : // Android fallback — Alert.prompt not available
          Alert.alert(
            'Publish as Template',
            `Publish "${program.name}" as a shareable template?`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Publish',
                onPress: async () => {
                  try {
                    const result = await publishTemplate(supabase, session.user.id, program.id, {
                      title: program.name,
                      description: `${program.program_days.length} day program`,
                    });
                    Alert.alert(
                      'Published!',
                      `Template available at: cadence.app/t/${result.slug}`
                    );
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Publish failed';
                    Alert.alert('Error', msg);
                  }
                },
              },
            ]
          );
    },
    [session]
  );

  const handleActivateProgram = useCallback(
    (program: Program) => {
      if (program.status === 'active') return;

      Alert.alert(
        'Activate Program',
        `Activate "${program.name}"? Your current active program will be archived.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Activate',
            style: 'default',
            onPress: async () => {
              if (!session) return;
              setActivating(program.id);

              try {
                const { error } = await supabase.rpc('activate_program', {
                  p_user_id: session.user.id,
                  p_program_id: program.id,
                });

                if (error) {
                  Alert.alert('Error', `Failed to activate program: ${error.message}`);
                  return;
                }

                await fetchPrograms();
              } catch (err) {
                Alert.alert(
                  'Error',
                  err instanceof Error ? err.message : 'Failed to activate program'
                );
              } finally {
                setActivating(null);
              }
            },
          },
        ]
      );
    },
    [session, fetchPrograms]
  );

  // ─── Local (optimistic) list mutations ────────────────────────────────────────
  // Reflect the change immediately so the row updates/removes without waiting on
  // the network (Req 3.4/3.7). The WAL + sync engine reconcile with the server.

  const applyLocalArchive = useCallback((programId: string) => {
    setPrograms((prev) =>
      prev.map((p) =>
        p.id === programId ? { ...p, status: 'archived' } : p
      )
    );
  }, []);

  const applyLocalHidden = useCallback((programId: string, hidden: boolean) => {
    setPrograms((prev) =>
      prev.map((p) => (p.id === programId ? { ...p, hidden } : p))
    );
  }, []);

  const applyLocalPurge = useCallback((programId: string) => {
    setPrograms((prev) => prev.filter((p) => p.id !== programId));
  }, []);

  // ─── Archive / Purge ────────────────────────────────────────────────────────

  const runArchive = useCallback(
    async (program: Program) => {
      if (!session) return;
      setMutatingId(program.id);

      // Optimistic local update first (Req 3.4/3.7 — reflect immediately).
      applyLocalArchive(program.id);

      // Offline-first path: enqueue the op and let the sync engine reconcile.
      if (enqueueProgramOp('program_archive', program.id, { status: 'archived' })) {
        setMutatingId(null);
        return;
      }

      // Web fallback: no WAL — call the server directly.
      try {
        await archiveProgram(supabase, session.user.id, program.id);
        await fetchPrograms();
      } catch (err) {
        // Req 3.6: keep the program in the list, surface an error indication.
        await fetchPrograms(); // reconcile the optimistic change back
        Alert.alert(
          'Archive failed',
          err instanceof Error ? err.message : 'Could not archive the program. It remains in your library.'
        );
      } finally {
        setMutatingId(null);
      }
    },
    [session, fetchPrograms, applyLocalArchive]
  );

  const runPurge = useCallback(
    async (program: Program) => {
      if (!session) return;
      setMutatingId(program.id);

      // Optimistic local removal first (Req 3.4/3.7 — remove immediately).
      applyLocalPurge(program.id);

      // Offline-first path: enqueue the delete and let the sync engine reconcile.
      if (enqueueProgramOp('program_purge', program.id, {})) {
        setMutatingId(null);
        return;
      }

      // Web fallback: no WAL — delete on the server directly.
      try {
        await purgeProgram(supabase, session.user.id, program.id);
        await fetchPrograms();
      } catch (err) {
        // Req 3.6: keep the program in the list, surface an error indication.
        await fetchPrograms(); // restore the row if the delete failed
        Alert.alert(
          'Delete failed',
          err instanceof Error ? err.message : 'Could not delete the program. It remains in your library.'
        );
      } finally {
        setMutatingId(null);
      }
    },
    [session, fetchPrograms, applyLocalPurge]
  );

  const confirmPurge = useCallback(
    (program: Program) => {
      // Req 3.3: second, distinct destructive confirmation that names the program.
      Alert.alert(
        'Delete permanently?',
        `"${program.name}" and its structure will be permanently deleted. Your logged workout history is kept. This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete permanently',
            style: 'destructive',
            onPress: () => runPurge(program),
          },
        ]
      );
    },
    [runPurge]
  );

  const handleDeleteProgram = useCallback(
    (program: Program) => {
      // Req 3.1 / 3.3: delete affordance opens a confirmation naming the program.
      // Default action = Archive (non-destructive). Secondary, clearly separated
      // destructive action = "Delete permanently" (purge), which requires an
      // explicit second confirm. Cancel leaves the program unchanged (Req 3.5).
      Alert.alert(
        `Delete "${program.name}"?`,
        'Archiving keeps the program and its history but removes it from your active list. You can also delete it permanently.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete permanently',
            style: 'destructive',
            onPress: () => confirmPurge(program),
          },
          {
            text: 'Archive',
            style: 'default',
            onPress: () => runArchive(program),
          },
        ]
      );
    },
    [runArchive, confirmPurge]
  );

  // ─── Hide / Unhide (archived rows) ────────────────────────────────────────────

  const runSetHidden = useCallback(
    async (program: Program, hidden: boolean) => {
      if (!session) return;
      setMutatingId(program.id);

      // Optimistic local update first. When the current view excludes hidden
      // rows, hiding removes the row from view immediately; a refetch on the
      // next focus reconciles visibility with the "Show hidden" toggle.
      applyLocalHidden(program.id, hidden);

      // Offline-first path: enqueue the op and let the sync engine reconcile.
      if (enqueueProgramOp('program_hide', program.id, { hidden })) {
        setMutatingId(null);
        return;
      }

      // Web fallback: no WAL — call the server directly.
      try {
        await setProgramHidden(supabase, session.user.id, program.id, hidden);
        await fetchPrograms();
      } catch (err) {
        // Req 3.6: keep the program in the list, surface an error indication.
        await fetchPrograms(); // reconcile the optimistic change back
        Alert.alert(
          hidden ? 'Hide failed' : 'Unhide failed',
          err instanceof Error
            ? err.message
            : `Could not ${hidden ? 'hide' : 'unhide'} the program. It remains unchanged.`
        );
      } finally {
        setMutatingId(null);
      }
    },
    [session, fetchPrograms, applyLocalHidden]
  );

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </ThemedView>
    );
  }

  const hasArchived = programs.some((p) => p.status === 'archived');

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: dockClearance }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Show hidden toggle — only relevant once archived programs exist. */}
        {(hasArchived || showHidden) && (
          <Pressable
            style={[styles.showHiddenToggle, { borderColor: theme.border }]}
            onPress={() => setShowHidden((v) => !v)}
            accessibilityRole="switch"
            accessibilityLabel="Show hidden programs"
            accessibilityState={{ checked: showHidden }}
          >
            <ThemedText style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>
              {showHidden ? 'Hiding hidden programs' : 'Show hidden programs'}
            </ThemedText>
            <View
              style={[
                styles.toggleDot,
                { backgroundColor: showHidden ? theme.accent : theme.backgroundSelected },
              ]}
            />
          </Pressable>
        )}

        {programs.length === 0 ? (
          <View style={styles.emptyInline}>
            <ThemedText type="headlineMedium" style={styles.emptyTitle}>
              No Programs
            </ThemedText>
            <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.emptyText}>
              Chat with the agent to create your first training program.
            </ThemedText>
          </View>
        ) : (
          programs.map((program) => {
            const isArchived = program.status === 'archived';
            const isBusy = mutatingId === program.id;

            return (
              <View
                key={program.id}
                style={[styles.programCard, { borderColor: theme.border, backgroundColor: theme.backgroundElevated }]}
              >
                <View style={styles.cardHeader}>
                  <ThemedText style={[styles.programName, { color: theme.text }]}>{program.name}</ThemedText>
                  <View style={styles.badgeRow}>
                    {program.hidden && (
                      <View style={[styles.statusBadge, { backgroundColor: theme.textTertiary }]}>
                        <ThemedText style={styles.statusText}>Hidden</ThemedText>
                      </View>
                    )}
                    <View
                      style={[styles.statusBadge, { backgroundColor: getStatusColor(program.status) }]}
                    >
                      <ThemedText style={styles.statusText}>
                        {STATUS_LABELS[program.status] || program.status}
                      </ThemedText>
                    </View>
                  </View>
                </View>

                <ThemedText style={{ fontSize: 13, color: theme.textSecondary }}>
                  {program.program_days.length} day
                  {program.program_days.length !== 1 ? 's' : ''} •{' '}
                  {new Date(program.created_at).toLocaleDateString()}
                </ThemedText>

                <View style={styles.actions}>
                  {program.status !== 'active' && (
                    <Pressable
                      style={[styles.activateButton, { backgroundColor: theme.accent }]}
                      onPress={() => handleActivateProgram(program)}
                      disabled={activating === program.id || isBusy}
                      accessibilityRole="button"
                      accessibilityLabel={`Activate ${program.name}`}
                    >
                      {activating === program.id ? (
                        <ActivityIndicator size="small" color={theme.accentText} />
                      ) : (
                        <ThemedText style={[styles.activateButtonText, { color: theme.accentText }]}>Activate</ThemedText>
                      )}
                    </Pressable>
                  )}

                  <Pressable
                    style={[styles.viewButton, { backgroundColor: theme.backgroundElement }]}
                    onPress={() => router.push('/(tabs)/program')}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel={`View details of ${program.name}`}
                  >
                    <ThemedText style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>View</ThemedText>
                  </Pressable>

                  <Pressable
                    style={[styles.viewButton, { backgroundColor: theme.backgroundElement }]}
                    onPress={() => handlePublishTemplate(program)}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel={`Publish ${program.name} as a shareable template`}
                  >
                    <ThemedText style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>Publish</ThemedText>
                  </Pressable>

                  {/* Hide / Unhide — only for archived programs (Req 3, declutter). */}
                  {isArchived && (
                    <Pressable
                      style={[styles.viewButton, { backgroundColor: theme.backgroundElement }]}
                      onPress={() => runSetHidden(program, !program.hidden)}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel={
                        program.hidden ? `Unhide ${program.name}` : `Hide ${program.name}`
                      }
                    >
                      <ThemedText style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>
                        {program.hidden ? 'Unhide' : 'Hide'}
                      </ThemedText>
                    </Pressable>
                  )}

                  {/* Delete affordance (Req 3.1) — archive-first confirmation. */}
                  <Pressable
                    style={[styles.deleteButton, { backgroundColor: theme.errorSoft }]}
                    onPress={() => handleDeleteProgram(program)}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${program.name}`}
                  >
                    {isBusy ? (
                      <ActivityIndicator size="small" color={theme.error} />
                    ) : (
                      <ThemedText style={{ fontSize: 13, fontWeight: '600', color: theme.error }}>
                        Delete
                      </ThemedText>
                    )}
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
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
    padding: Spacing.four,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  showHiddenToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 48,
  },
  toggleDot: {
    width: 18,
    height: 18,
    borderRadius: Radii.full,
  },
  programCard: {
    borderWidth: 1,
    borderRadius: Radii.large,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  programName: {
    fontWeight: '700',
    fontSize: 16,
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  statusBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: Radii.full,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  activateButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.medium,
    minWidth: 80,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  activateButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  viewButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.medium,
    minHeight: 48,
    justifyContent: 'center',
  },
  deleteButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.medium,
    minHeight: 48,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyInline: {
    alignItems: 'center',
    paddingVertical: Spacing.six,
  },
  emptyTitle: {
    marginBottom: Spacing.two,
  },
  emptyText: {
    textAlign: 'center',
  },
});
