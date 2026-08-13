/**
 * Template Preview Screen
 *
 * Displays a read-only view of a program template with full structure.
 * Shows clone button for authenticated users, redirects to auth for guests.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 4.1, 4.4
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/AuthProvider';
import { cloneTemplate, getTemplateBySlug } from '@/services/template-service';
import type { ProgramTemplate } from '@/types/template';
import { supabase } from '@/utils/supabase';

export default function TemplatePreviewScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session, user } = useAuth();

  const [template, setTemplate] = useState<ProgramTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCloning, setIsCloning] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) {
      setNotFound(true);
      setIsLoading(false);
      return;
    }

    const load = async () => {
      const result = await getTemplateBySlug(supabase, slug);
      if (!result) {
        setNotFound(true);
      } else {
        setTemplate(result);
      }
      setIsLoading(false);
    };

    load();
  }, [slug]);

  const handleClone = useCallback(async () => {
    if (!session || !user) {
      router.push('/(auth)/login');
      return;
    }

    if (!template) return;

    setIsCloning(true);
    try {
      const newProgramId = await cloneTemplate(supabase, user.id, template.id);
      Alert.alert('Cloned!', 'Program added to your library as a draft.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Clone failed';
      Alert.alert('Error', msg);
    } finally {
      setIsCloning(false);
    }
  }, [session, user, template, router]);

  const handleUnpublish = useCallback(async () => {
    if (!user || !template) return;

    Alert.alert(
      'Unpublish Template',
      'This will remove the template from public access. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpublish',
          style: 'destructive',
          onPress: async () => {
            try {
              await unpublishTemplate(supabase, user.id, template.id);
              Alert.alert('Unpublished', 'Template is no longer publicly visible.', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Unpublish failed';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  }, [user, template, router]);

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </ThemedView>
    );
  }

  if (notFound || !template) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="headlineMedium">Template not found</ThemedText>
        <ThemedText themeColor="textSecondary" style={{ marginTop: 8 }}>
          This template may have been unpublished or the link is invalid.
        </ThemedText>
      </ThemedView>
    );
  }

  const { program_snapshot } = template;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="headlineMedium">{template.title}</ThemedText>
          {template.description ? (
            <ThemedText themeColor="textSecondary" style={{ marginTop: 4 }}>
              {template.description}
            </ThemedText>
          ) : null}
          <View style={styles.metaRow}>
            <ThemedText type="bodySmall" themeColor="textSecondary">
              {template.clone_count} clones
            </ThemedText>
          </View>
          {template.tags.length > 0 && (
            <View style={styles.tagRow}>
              {template.tags.map(tag => (
                <View key={tag} style={[styles.tagPill, { backgroundColor: theme.accent + '20' }]}>
                  <ThemedText style={[styles.tagText, { color: theme.accent }]}>{tag}</ThemedText>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Program Structure */}
        <View style={styles.section}>
          <ThemedText type="labelMedium" themeColor="textSecondary">
            PROGRAM STRUCTURE
          </ThemedText>
          <ThemedText style={styles.programName}>{program_snapshot.name}</ThemedText>

          {program_snapshot.program_days.map(day => (
            <View key={day.day_number} style={[styles.dayCard, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.dayTitle}>
                Day {day.day_number}: {day.name}
              </ThemedText>
              {day.items.map((item, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <ThemedText type="bodySmall">
                    {item.exercise_name ?? item.type}
                  </ThemedText>
                  <ThemedText type="bodySmall" themeColor="textSecondary">
                    {item.target_sets} × {item.target_reps}
                    {item.target_weight ? ` @ ${item.target_weight}kg` : ''}
                  </ThemedText>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Footer Buttons */}
      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        {user && template.author_id === user.id && (
          <Pressable
            style={[styles.cloneButton, { backgroundColor: theme.error, marginBottom: 8 }]}
            onPress={handleUnpublish}
            accessibilityRole="button"
            accessibilityLabel="Unpublish this template"
          >
            <ThemedText style={styles.cloneButtonText}>Unpublish</ThemedText>
          </Pressable>
        )}
        <Pressable
          style={[styles.cloneButton, { backgroundColor: theme.accent }]}
          onPress={handleClone}
          disabled={isCloning}
          accessibilityRole="button"
          accessibilityLabel="Clone this template to your program library"
        >
          {isCloning ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <ThemedText style={styles.cloneButtonText}>
              Clone to My Library
            </ThemedText>
          )}
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  scroll: { padding: Spacing.four, paddingBottom: 100 },
  header: { marginBottom: Spacing.four },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  tagRow: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  tagPill: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, fontWeight: '500' },
  section: { gap: Spacing.two },
  programName: { fontSize: 16, fontWeight: '600', marginTop: 4 },
  dayCard: { borderRadius: Radii.medium, padding: Spacing.three, marginTop: Spacing.two, gap: 6 },
  dayTitle: { fontSize: 14, fontWeight: '600' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.three, borderTopWidth: 1 },
  cloneButton: { borderRadius: Radii.medium, paddingVertical: 14, alignItems: 'center' },
  cloneButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
