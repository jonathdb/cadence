/**
 * Journal entry detail/edit screen.
 * Supports free-text editing via multiline TextInput. Shows agent-drafted badge
 * if the entry was drafted by the AI. Save and delete actions with confirmation.
 * Shows linked session info if session_id is set.
 *
 * Requirements: 22.2, 22.3, 22.4
 */
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/utils/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Database } from '@/types/database';

type JournalEntry = Database['public']['Tables']['journal_entries']['Row'];

export default function JournalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const theme = useTheme();

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<{ started_at: string; program_day_name?: string } | null>(null);

  useEffect(() => {
    async function loadEntry() {
      if (!user || !id) return;

      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        setEntry(data);
        setContent(data.content);

        // Load linked session info if present
        if (data.session_id) {
          const { data: sessionData } = await supabase
            .from('sessions' as any)
            .select('started_at, program_day_id')
            .eq('id', data.session_id)
            .single();

          if (sessionData) {
            let programDayName: string | undefined;
            if ((sessionData as any).program_day_id) {
              const { data: dayData } = await supabase
                .from('program_days')
                .select('name')
                .eq('id', (sessionData as any).program_day_id)
                .single();
              programDayName = dayData?.name ?? undefined;
            }
            setSessionInfo({
              started_at: (sessionData as any).started_at,
              program_day_name: programDayName,
            });
          }
        }
      }
      setIsLoading(false);
    }

    loadEntry();
  }, [user, id]);

  const handleContentChange = useCallback(
    (text: string) => {
      setContent(text);
      setHasChanges(text !== (entry?.content ?? ''));
    },
    [entry]
  );

  const handleSave = useCallback(async () => {
    if (!user || !id) return;

    setIsSaving(true);
    const { error } = await supabase
      .from('journal_entries')
      .update({
        content,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (!error) {
      setEntry((prev) => (prev ? { ...prev, content, updated_at: new Date().toISOString() } : null));
      setHasChanges(false);
    }
    setIsSaving(false);
  }, [user, id, content]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this journal entry? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!user || !id) return;

            const { error } = await supabase
              .from('journal_entries')
              .delete()
              .eq('id', id)
              .eq('user_id', user.id);

            if (!error) {
              router.back();
            }
          },
        },
      ]
    );
  }, [user, id, router]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color="#3c87f7" />
      </ThemedView>
    );
  }

  if (!entry) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="default" themeColor="textSecondary">
          Entry not found.
        </ThemedText>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <ThemedText type="linkPrimary">Go Back</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Go back to journal list"
            >
              <ThemedText type="linkPrimary">← Back</ThemedText>
            </Pressable>
          </View>

          {/* Meta info */}
          <View style={styles.meta}>
            <ThemedText type="small" themeColor="textSecondary">
              {formatDate(entry.created_at)}
            </ThemedText>
            {entry.agent_drafted && (
              <View style={[styles.badge, { backgroundColor: '#3c87f7' }]}>
                <ThemedText type="small" style={styles.badgeText}>
                  AI Drafted
                </ThemedText>
              </View>
            )}
          </View>

          {/* Linked session info */}
          {sessionInfo && (
            <View style={[styles.sessionCard, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold">Linked Session</ThemedText>
              {sessionInfo.program_day_name && (
                <ThemedText type="small" themeColor="textSecondary">
                  {sessionInfo.program_day_name}
                </ThemedText>
              )}
              <ThemedText type="small" themeColor="textSecondary">
                {formatDate(sessionInfo.started_at)}
              </ThemedText>
            </View>
          )}

          {/* Content editor */}
          <TextInput
            style={[
              styles.editor,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: hasChanges ? '#3c87f7' : theme.backgroundSelected,
              },
            ]}
            value={content}
            onChangeText={handleContentChange}
            multiline
            placeholder="Write your training reflections here…"
            placeholderTextColor={theme.textSecondary}
            textAlignVertical="top"
            accessibilityLabel="Journal entry content"
            accessibilityHint="Type your training reflections"
          />

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              onPress={handleSave}
              disabled={!hasChanges || isSaving}
              style={({ pressed }) => [
                styles.saveButton,
                {
                  opacity: !hasChanges || isSaving ? 0.5 : pressed ? 0.7 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Save journal entry"
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <ThemedText type="smallBold" style={styles.saveButtonText}>
                  Save
                </ThemedText>
              )}
            </Pressable>

            <Pressable
              onPress={handleDelete}
              style={({ pressed }) => [
                styles.deleteButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Delete journal entry"
            >
              <ThemedText type="smallBold" style={styles.deleteButtonText}>
                Delete
              </ThemedText>
            </Pressable>
          </View>

          {entry.updated_at && entry.updated_at !== entry.created_at && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.updatedLabel}>
              Last updated: {formatDate(entry.updated_at)}
            </ThemedText>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
  },
  sessionCard: {
    padding: Spacing.three,
    borderRadius: 8,
    gap: Spacing.one,
  },
  editor: {
    minHeight: 200,
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    lineHeight: 24,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#3c87f7',
    paddingVertical: Spacing.three,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#ffffff',
  },
  deleteButton: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: 8,
    backgroundColor: '#ff4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#ffffff',
  },
  backLink: {
    padding: Spacing.two,
  },
  updatedLabel: {
    textAlign: 'center',
  },
});
