/**
 * Journal entries list screen.
 * Displays all journal entries ordered newest first with date, content preview,
 * and agent-drafted badge. Tap to open detail/edit. "New Entry" button for manual creation.
 *
 * Requirements: 22.1, 22.2, 22.4
 */
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Database } from '@/types/database';

type JournalEntry = Database['public']['Tables']['journal_entries']['Row'];

export default function JournalListScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const theme = useTheme();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setEntries(data);
    }
  }, [user]);

  useEffect(() => {
    fetchEntries().finally(() => setIsLoading(false));
  }, [fetchEntries]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchEntries();
    setIsRefreshing(false);
  }, [fetchEntries]);

  const handleNewEntry = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('journal_entries')
      .insert({
        user_id: user.id,
        content: '',
        agent_drafted: false,
      })
      .select()
      .single();

    if (!error && data) {
      router.push(`/(tabs)/journal/${data.id}`);
    }
  }, [user, router]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getPreview = (content: string) => {
    if (!content) return 'Empty entry';
    return content.length > 80 ? content.slice(0, 80) + '…' : content;
  };

  const renderItem = ({ item }: { item: JournalEntry }) => (
    <Pressable
      onPress={() => router.push(`/(tabs)/journal/${item.id}`)}
      style={({ pressed }) => [
        styles.entryCard,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Journal entry from ${formatDate(item.created_at)}`}
    >
      <View style={styles.entryHeader}>
        <ThemedText type="smallBold">{formatDate(item.created_at)}</ThemedText>
        {item.agent_drafted && (
          <View style={[styles.badge, { backgroundColor: theme.accent }]}>
            <ThemedText type="small" style={styles.badgeText}>
              AI Draft
            </ThemedText>
          </View>
        )}
      </View>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
        {getPreview(item.content)}
      </ThemedText>
    </Pressable>
  );

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="subtitle" style={styles.title}>
          Journal
        </ThemedText>
        <Pressable
          onPress={handleNewEntry}
          style={({ pressed }) => [
            styles.newButton,
            { backgroundColor: theme.accent, opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Create new journal entry"
        >
          <ThemedText type="smallBold" style={styles.newButtonText}>
            + New Entry
          </ThemedText>
        </Pressable>
      </View>

      {entries.length === 0 ? (
        <View style={styles.emptyState}>
          <ThemedText type="default" themeColor="textSecondary" style={styles.emptyText}>
            No journal entries yet. Create one after your next session or tap "New Entry" above.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
  },
  title: {
    fontSize: 22,
  },
  newButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.medium,
    minHeight: 48,
    justifyContent: 'center',
  },
  newButtonText: {
    color: '#ffffff',
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  entryCard: {
    padding: Spacing.three,
    borderRadius: Radii.large,
    gap: Spacing.two,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radii.full,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
  },
  separator: {
    height: Spacing.two,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  emptyText: {
    textAlign: 'center',
  },
});
