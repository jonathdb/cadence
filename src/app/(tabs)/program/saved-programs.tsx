/**
 * Program Library screen — lists all user programs (active, archived, draft).
 * Shows status badge per program. Supports activating a different program
 * using the activate_program RPC (atomically archives current, activates new).
 *
 * Requirements: 4.3, 5.1, 5.2
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/utils/supabase';

interface ProgramListItem {
  id: string;
  name: string;
  status: 'active' | 'archived' | 'draft';
  created_at: string;
  updated_at: string;
  program_days: { id: string }[];
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
  const [programs, setPrograms] = useState<ProgramListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

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
      const { data, error } = await supabase
        .from('programs')
        .select(`
          id,
          name,
          status,
          created_at,
          updated_at,
          program_days (id)
        `)
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch programs:', error.message);
        return;
      }

      setPrograms((data as unknown as ProgramListItem[]) || []);
    } catch (err) {
      console.error('Error fetching programs:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      fetchPrograms();
    }, [fetchPrograms])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPrograms();
  }, [fetchPrograms]);

  const handleActivateProgram = useCallback(
    (program: ProgramListItem) => {
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

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </ThemedView>
    );
  }

  if (programs.length === 0) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="headlineMedium" style={styles.emptyTitle}>
          No Programs
        </ThemedText>
        <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.emptyText}>
          Chat with the agent to create your first training program.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {programs.map((program) => (
          <View key={program.id} style={[styles.programCard, { borderColor: theme.border, backgroundColor: theme.backgroundElevated }]}>
            <View style={styles.cardHeader}>
              <ThemedText style={[styles.programName, { color: theme.text }]}>{program.name}</ThemedText>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(program.status) },
                ]}
              >
                <ThemedText style={styles.statusText}>
                  {STATUS_LABELS[program.status] || program.status}
                </ThemedText>
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
                  disabled={activating === program.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Activate ${program.name}`}
                >
                  {activating === program.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <ThemedText style={styles.activateButtonText}>Activate</ThemedText>
                  )}
                </Pressable>
              )}

              <Pressable
                style={[styles.viewButton, { backgroundColor: theme.backgroundElement }]}
                onPress={() => router.push('/(tabs)/program')}
                accessibilityRole="button"
                accessibilityLabel={`View details of ${program.name}`}
              >
                <ThemedText style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>View</ThemedText>
              </Pressable>
            </View>
          </View>
        ))}
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
  },
  programName: {
    fontWeight: '700',
    fontSize: 16,
    flex: 1,
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
  emptyTitle: {
    marginBottom: Spacing.two,
  },
  emptyText: {
    textAlign: 'center',
  },
});
