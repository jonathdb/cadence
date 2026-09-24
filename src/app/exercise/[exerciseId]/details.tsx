/**
 * Exercise Detail Screen — text-first exercise information.
 *
 * Renders name, description, explanation, and metadata chips (level,
 * mechanic, force, category, equipment, muscle groups) as TEXT before any
 * media, so the screen is fully informative even before images load or when
 * they fail/are unavailable (Requirement 2.3). Legacy/partial records (all
 * new enrichment fields null) render placeholders instead of throwing
 * (Requirement 2.6). Attribution is shown only when the source license
 * requires it (Requirement 2.8).
 *
 * Route: /exercise/[exerciseId]/details
 * (Distinct from /exercise/[exerciseId], the per-exercise set/PR history
 * screen — this route is the catalog entry's own detail page. Both live
 * outside the `(tabs)` group — see `src/app/exercise/_layout.tsx` — so they
 * push onto a shared stack reachable from any tab, and back always returns
 * to whichever tab/screen pushed them.)
 *
 * _Design: Components §2d. Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.8._
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ExerciseMedia } from '@/components/exercise/ExerciseMedia';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTabBarClearance } from '@/hooks/useTabBarClearance';
import { useAuth } from '@/providers/AuthProvider';
import type { ExerciseChip, ExerciseDisplayViewModel } from '@/services/exercise-display';
import { ExerciseLibraryError, getExerciseDisplay } from '@/services/exercise-library';
import { supabase } from '@/utils/supabase';

/** Human-readable label per chip kind, used as a small caption above the value. */
const CHIP_KIND_LABELS: Record<ExerciseChip['kind'], string> = {
  level: 'Level',
  mechanic: 'Mechanic',
  force: 'Force',
  category: 'Category',
  equipment: 'Equipment',
  primaryMuscle: 'Primary Muscle',
  secondaryMuscle: 'Secondary Muscle',
};

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ExerciseDetailScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const dockClearance = useTabBarClearance();
  const { session } = useAuth();

  const [display, setDisplay] = useState<ExerciseDisplayViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!exerciseId || !session?.user.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getExerciseDisplay(supabase, session.user.id, exerciseId);
      setDisplay(result);
    } catch (err) {
      setError(
        err instanceof ExerciseLibraryError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to load exercise'
      );
    } finally {
      setIsLoading(false);
    }
  }, [exerciseId, session?.user.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </ThemedView>
    );
  }

  if (error || !display) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="headlineMedium" style={{ marginBottom: Spacing.two }}>
          Exercise Not Found
        </ThemedText>
        <ThemedText type="bodyMedium" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          {error ?? 'This exercise could not be loaded.'}
        </ThemedText>
        <Pressable
          style={[styles.backButton, { backgroundColor: theme.backgroundElement }]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ThemedText style={{ color: theme.accent, fontWeight: '600' }}>Go Back</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: dockClearance }]}>
        {/* Text-first: name, description, explanation, and chips render before
            any media is mounted, so the screen is fully informative even if
            media never loads (Requirement 2.3). */}
        <ThemedText type="headlineLarge">{display.name}</ThemedText>

        {display.chips.length > 0 && (
          <View style={styles.chipRow}>
            {display.chips.map((chip, idx) => (
              <View
                key={`${chip.kind}-${idx}`}
                style={[styles.chip, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
              >
                <ThemedText type="labelSmall" themeColor="textTertiary">
                  {CHIP_KIND_LABELS[chip.kind]}
                </ThemedText>
                <ThemedText type="bodySmall" style={{ color: theme.text }}>
                  {titleCase(chip.label)}
                </ThemedText>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <ThemedText type="headlineSmall" accessibilityRole="header">
            Description
          </ThemedText>
          <ThemedText
            type="bodyMedium"
            themeColor={display.hasDescription ? 'text' : 'textSecondary'}
          >
            {display.description}
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="headlineSmall" accessibilityRole="header">
            How To
          </ThemedText>
          <ThemedText
            type="bodyMedium"
            themeColor={display.hasExplanation ? 'text' : 'textSecondary'}
            style={styles.explanationText}
          >
            {display.explanation}
          </ThemedText>
        </View>

        {/* Media renders after all text content (Requirement 2.3). Never
            blocks or crashes the screen — ExerciseMedia handles missing/
            failed media internally (Requirements 2.4, 2.5, 2.7). */}
        <View style={styles.section}>
          <ThemedText type="headlineSmall" accessibilityRole="header">
            Demonstration
          </ThemedText>
          <ExerciseMedia media={display.media} exerciseName={display.name} />
        </View>

        {/* Attribution shown only when the source license requires it (Requirement 2.8). */}
        {display.attribution.required && (
          <ThemedText type="bodySmall" themeColor="textTertiary" style={styles.attribution}>
            {display.attribution.text}
          </ThemedText>
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
    gap: Spacing.two,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  backButton: {
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.twoHalf,
    borderRadius: Radii.medium,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    gap: 2,
    minWidth: 72,
  },
  section: {
    gap: Spacing.one,
  },
  explanationText: {
    lineHeight: 22,
  },
  attribution: {
    textAlign: 'center',
  },
});
