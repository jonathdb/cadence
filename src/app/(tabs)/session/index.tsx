/**
 * Session tab entry point.
 * Shows a prompt to start a session from the active program.
 * Users navigate here from the Program day detail screen with a dayId.
 *
 * Requirements: 9.1
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/utils/supabase';

interface ProgramDayListItem {
  id: string;
  day_number: number;
  name: string;
}

export default function SessionIndexScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [days, setDays] = useState<ProgramDayListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [programName, setProgramName] = useState<string | null>(null);

  const fetchActiveProgramDays = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: program, error: programError } = await supabase
        .from('programs')
        .select('id, name')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (programError || !program) {
        setIsLoading(false);
        return;
      }

      setProgramName(program.name);

      const { data: programDays, error: daysError } = await supabase
        .from('program_days')
        .select('id, day_number, name')
        .eq('program_id', program.id)
        .order('day_number', { ascending: true });

      if (daysError) {
        console.error('Failed to fetch program days:', daysError.message);
      } else {
        setDays(programDays || []);
      }
    } catch (err) {
      console.error('Error fetching active program:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveProgramDays();
  }, [fetchActiveProgramDays]);

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </ThemedView>
    );
  }

  if (days.length === 0) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="headlineMedium" style={styles.title}>
          Session
        </ThemedText>
        <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.description}>
          {programName
            ? 'Your active program has no days configured yet.'
            : 'No active program found. Create or activate a program from the Program tab to start logging sessions.'}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <ThemedText type="headlineMedium" style={styles.title}>
            Start Session
          </ThemedText>
          <ThemedText type="bodyMedium" themeColor="textSecondary">
            Pick a day from {programName} to begin logging.
          </ThemedText>
        </View>

        {/* Track Route button */}
        <Pressable
          style={[styles.routeCard, { borderColor: theme.success, backgroundColor: theme.successSoft }]}
          onPress={() => router.push('/(tabs)/session/route')}
          accessibilityRole="button"
          accessibilityLabel="Track a running or walking route"
        >
          <View style={[styles.routeBadge, { backgroundColor: theme.success }]}>
            <ThemedText style={styles.routeBadgeText}>🏃</ThemedText>
          </View>
          <ThemedText style={[styles.dayName, { color: theme.text }]}>Track Route</ThemedText>
        </Pressable>

        {days.map((day) => (
          <Pressable
            key={day.id}
            style={[styles.dayCard, { borderColor: theme.border, backgroundColor: theme.backgroundElevated }]}
            onPress={() => router.push(`/(tabs)/session/${day.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Start session for Day ${day.day_number}: ${day.name}`}
          >
            <View style={[styles.dayBadge, { backgroundColor: theme.accent }]}>
              <ThemedText style={styles.dayBadgeText}>{day.day_number}</ThemedText>
            </View>
            <ThemedText style={[styles.dayName, { color: theme.text }]}>{day.name}</ThemedText>
          </Pressable>
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
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  title: {},
  description: {
    textAlign: 'center',
  },
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radii.large,
    padding: Spacing.three,
    minHeight: 48,
  },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radii.large,
    padding: Spacing.three,
    minHeight: 48,
  },
  routeBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeBadgeText: {
    fontSize: 16,
  },
  dayBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayBadgeText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  dayName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
});
