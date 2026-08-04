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
import { Spacing } from '@/constants/theme';
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

const STATUS_COLORS: Record<string, string> = {
  active: '#16a34a',
  archived: '#6b7280',
  draft: '#d97706',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  archived: 'Archived',
  draft: 'Draft',
};

export default function ProgramLibraryScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [programs, setPrograms] = useState<ProgramListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

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

                // Refresh the list to show updated statuses
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
        <ActivityIndicator size="large" color="#3c87f7" />
      </ThemedView>
    );
  }

  if (programs.length === 0) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="subtitle" style={styles.emptyTitle}>
          No Programs
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
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
          <View key={program.id} style={styles.programCard}>
            <View style={styles.cardHeader}>
              <ThemedText style={styles.programName}>{program.name}</ThemedText>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: STATUS_COLORS[program.status] || '#6b7280' },
                ]}
              >
                <ThemedText style={styles.statusText}>
                  {STATUS_LABELS[program.status] || program.status}
                </ThemedText>
              </View>
            </View>

            <ThemedText style={styles.meta}>
              {program.program_days.length} day
              {program.program_days.length !== 1 ? 's' : ''} •{' '}
              {new Date(program.created_at).toLocaleDateString()}
            </ThemedText>

            <View style={styles.actions}>
              {program.status !== 'active' && (
                <Pressable
                  style={styles.activateButton}
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
                style={styles.viewButton}
                onPress={() => router.push('/(tabs)/program')}
                accessibilityRole="button"
                accessibilityLabel={`View details of ${program.name}`}
              >
                <ThemedText style={styles.viewButtonText}>View</ThemedText>
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
    borderColor: '#e5e7eb',
    borderRadius: 12,
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
    color: '#1f2937',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  meta: {
    fontSize: 13,
    color: '#6b7280',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  activateButton: {
    backgroundColor: '#3c87f7',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  activateButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  viewButton: {
    backgroundColor: '#f0f0f3',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
  viewButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  emptyTitle: {
    fontSize: 22,
    marginBottom: Spacing.two,
  },
  emptyText: {
    textAlign: 'center',
  },
});
