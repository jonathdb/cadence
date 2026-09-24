/**
 * Browse Templates Screen
 *
 * Displays a paginated list of published program templates.
 * Supports infinite scroll and tag filtering.
 *
 * Validates: Requirements 5.1, 5.2, 5.3
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTabBarClearance } from '@/hooks/useTabBarClearance';
import { browseTemplates } from '@/services/template-service';
import type { TemplateCard } from '@/types/template';
import { supabase } from '@/utils/supabase';

export default function BrowseTemplatesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const dockClearance = useTabBarClearance();

  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const nextCursorRef = useRef<string | null>(null);
  const nextCursorIdRef = useRef<string | null>(null);
  const hasMoreRef = useRef(true);

  const loadTemplates = useCallback(async (reset = false) => {
    if (reset) {
      setIsLoading(true);
      nextCursorRef.current = null;
      nextCursorIdRef.current = null;
      hasMoreRef.current = true;
    } else {
      if (!hasMoreRef.current) return;
      setIsLoadingMore(true);
    }

    try {
      const result = await browseTemplates(supabase, {
        cursor: reset ? undefined : nextCursorRef.current ?? undefined,
        cursorId: reset ? undefined : nextCursorIdRef.current ?? undefined,
        limit: 20,
        tagFilter: tagFilter.trim() || undefined,
      });

      if (reset) {
        setTemplates(result.templates);
      } else {
        setTemplates(prev => [...prev, ...result.templates]);
      }

      nextCursorRef.current = result.nextCursor;
      nextCursorIdRef.current = result.nextCursorId;
      hasMoreRef.current = result.nextCursor !== null;
    } catch (err) {
      console.error('Browse templates error:', err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [tagFilter]);

  useEffect(() => {
    loadTemplates(true);
  }, [tagFilter]);

  const handleEndReached = useCallback(() => {
    if (!isLoadingMore && hasMoreRef.current) {
      loadTemplates(false);
    }
  }, [isLoadingMore, loadTemplates]);

  const renderItem = useCallback(({ item }: { item: TemplateCard }) => (
    <Pressable
      style={[styles.card, { backgroundColor: theme.backgroundElement }]}
      onPress={() => router.push({ pathname: '/(tabs)/program/template-preview', params: { slug: item.slug } })}
      accessibilityRole="button"
      accessibilityLabel={`View template: ${item.title}`}
    >
      <ThemedText style={styles.cardTitle}>{item.title}</ThemedText>
      {item.description ? (
        <ThemedText type="bodySmall" themeColor="textSecondary" numberOfLines={2}>
          {item.description}
        </ThemedText>
      ) : null}
      <View style={styles.cardMeta}>
        <ThemedText type="bodySmall" themeColor="textSecondary">
          by {item.author_display_name}
        </ThemedText>
        <ThemedText type="bodySmall" themeColor="textSecondary">
          {item.clone_count} clones
        </ThemedText>
      </View>
      {item.tags.length > 0 && (
        <View style={styles.tagRow}>
          {item.tags.slice(0, 4).map(tag => (
            <View key={tag} style={[styles.tagPill, { backgroundColor: theme.accent + '20' }]}>
              <ThemedText style={[styles.tagText, { color: theme.accent }]}>{tag}</ThemedText>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  ), [theme, router]);

  return (
    <ThemedView style={styles.container}>
      {/* Tag Filter */}
      <View style={styles.filterContainer}>
        <TextInput
          style={[styles.filterInput, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border }]}
          placeholder="Filter by tag..."
          placeholderTextColor={theme.textTertiary}
          value={tagFilter}
          onChangeText={setTagFilter}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={templates}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: dockClearance }]}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <View style={styles.centered}>
              <ThemedText themeColor="textSecondary">No templates found</ThemedText>
            </View>
          }
          ListFooterComponent={
            isLoadingMore ? <ActivityIndicator color={theme.accent} style={{ marginVertical: 16 }} /> : null
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterContainer: { padding: Spacing.three },
  filterInput: {
    height: 40,
    borderRadius: Radii.medium,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  list: { padding: Spacing.three, gap: Spacing.three },
  card: {
    borderRadius: Radii.medium,
    padding: Spacing.three,
    gap: 6,
  },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  tagRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  tagPill: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, fontWeight: '500' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
});
