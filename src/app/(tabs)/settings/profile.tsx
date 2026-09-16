/**
 * Training Profile screen.
 *
 * Lets the user set the rich training profile the AI coach uses: goal,
 * experience level, bodyweight, injuries/limitations, available equipment,
 * preferred training days, weekly frequency, and free-text notes.
 *
 * Reads/writes via src/services/profile.ts. Expo SDK 57 (React Native 0.86):
 * uses only core RN primitives + existing themed UI components.
 */
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Radii, Spacing, TabBarClearance } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/AuthProvider';
import { getUserProfile, updateUserProfile } from '@/services/profile';
import {
    EXPERIENCE_LEVELS,
    TRAINING_GOALS,
    parseProfileNumerics,
    type BodyweightUnit,
    type ExperienceLevel,
    type TrainingGoal,
    type UserProfileInput
} from '@/types/profile';

const GOAL_LABELS: Record<TrainingGoal, string> = {
  strength: 'Strength',
  hypertrophy: 'Hypertrophy',
  endurance: 'Endurance',
  general_fitness: 'General Fitness',
  weight_loss: 'Weight Loss',
  athletic_performance: 'Athletic Performance',
};

const DAYS: { value: string; label: string }[] = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
];

const EQUIPMENT_OPTIONS = [
  'barbell', 'dumbbells', 'kettlebell', 'machines', 'cables',
  'bodyweight', 'resistance_bands', 'pull_up_bar', 'bench', 'treadmill',
];

export default function ProfileScreen() {
  const { session } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Form state
  const [goal, setGoal] = useState<TrainingGoal | null>(null);
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [bodyweight, setBodyweight] = useState('');
  const [bodyweightUnit, setBodyweightUnit] = useState<BodyweightUnit>('kg');
  const [weeklyFrequency, setWeeklyFrequency] = useState('');
  const [days, setDays] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [injuries, setInjuries] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    try {
      const p = await getUserProfile(session.user.id);
      setGoal((p.goal as TrainingGoal) ?? null);
      setExperience((p.experience_level as ExperienceLevel) ?? null);
      setBodyweight(p.bodyweight != null ? String(p.bodyweight) : '');
      setBodyweightUnit((p.bodyweight_unit as BodyweightUnit) ?? 'kg');
      setWeeklyFrequency(p.weekly_frequency != null ? String(p.weekly_frequency) : '');
      setDays(p.preferred_training_days ?? []);
      setEquipment(p.equipment ?? []);
      setInjuries(p.injuries ?? '');
      setNotes(p.training_notes ?? '');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleInArray = (arr: string[], value: string): string[] =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  async function handleSave() {
    if (!session?.user.id) return;
    setIsSaving(true);
    setError(null);

    const parsed = parseProfileNumerics({ bodyweight, weeklyFrequency });
    if (!parsed.ok) {
      setError(parsed.error);
      setIsSaving(false);
      return;
    }

    const input: UserProfileInput = {
      goal,
      experience_level: experience,
      bodyweight: parsed.bodyweight,
      bodyweight_unit: bodyweightUnit,
      weekly_frequency: parsed.weeklyFrequency,
      preferred_training_days: days,
      equipment,
      injuries: injuries.trim() === '' ? null : injuries.trim(),
      training_notes: notes.trim() === '' ? null : notes.trim(),
    };

    try {
      await updateUserProfile(session.user.id, input);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.chip,
        {
          backgroundColor: active ? theme.accent : theme.backgroundElement,
          borderColor: active ? theme.accent : theme.border,
        },
      ]}
    >
      <ThemedText
        type="labelLarge"
        style={{ color: active ? theme.accentText : theme.text }}
      >
        {label}
      </ThemedText>
    </Pressable>
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: TabBarClearance + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedText type="small" themeColor="textSecondary">
          Your coach uses this profile to personalize suggestions, respect injuries and available
          equipment, and align plans with your goal.
        </ThemedText>

        {error && (
          <View style={[styles.errorContainer, { backgroundColor: theme.errorSoft }]}>
            <ThemedText style={{ fontSize: 14, color: theme.error }}>{error}</ThemedText>
          </View>
        )}

        {/* Goal */}
        <View style={styles.section}>
          <ThemedText type="labelCaps" themeColor="textSecondary">Primary Goal</ThemedText>
          <View style={styles.chipWrap}>
            {TRAINING_GOALS.map((g) => (
              <Chip key={g} label={GOAL_LABELS[g]} active={goal === g} onPress={() => setGoal(goal === g ? null : g)} />
            ))}
          </View>
        </View>

        {/* Experience */}
        <View style={styles.section}>
          <ThemedText type="labelCaps" themeColor="textSecondary">Experience Level</ThemedText>
          <SegmentedControl
            options={EXPERIENCE_LEVELS.map((e) => ({ value: e, label: e[0].toUpperCase() + e.slice(1) }))}
            value={experience ?? 'beginner'}
            onChange={(v) => setExperience(v as ExperienceLevel)}
          />
        </View>

        {/* Bodyweight */}
        <View style={styles.section}>
          <ThemedText type="labelCaps" themeColor="textSecondary">Bodyweight</ThemedText>
          <View style={styles.row}>
            <TextInput
              value={bodyweight}
              onChangeText={setBodyweight}
              keyboardType="numeric"
              placeholder="e.g. 80"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { flex: 1, color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
              accessibilityLabel="Bodyweight"
            />
            <SegmentedControl
              options={[{ value: 'kg', label: 'kg' }, { value: 'lbs', label: 'lbs' }]}
              value={bodyweightUnit}
              onChange={(v) => setBodyweightUnit(v as BodyweightUnit)}
              style={styles.unitControl}
            />
          </View>
        </View>

        {/* Weekly frequency */}
        <View style={styles.section}>
          <ThemedText type="labelCaps" themeColor="textSecondary">Sessions Per Week</ThemedText>
          <TextInput
            value={weeklyFrequency}
            onChangeText={setWeeklyFrequency}
            keyboardType="numeric"
            placeholder="e.g. 4"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
            accessibilityLabel="Sessions per week"
          />
        </View>

        {/* Preferred days */}
        <View style={styles.section}>
          <ThemedText type="labelCaps" themeColor="textSecondary">Preferred Training Days</ThemedText>
          <View style={styles.chipWrap}>
            {DAYS.map((d) => (
              <Chip key={d.value} label={d.label} active={days.includes(d.value)} onPress={() => setDays(toggleInArray(days, d.value))} />
            ))}
          </View>
        </View>

        {/* Equipment */}
        <View style={styles.section}>
          <ThemedText type="labelCaps" themeColor="textSecondary">Available Equipment</ThemedText>
          <View style={styles.chipWrap}>
            {EQUIPMENT_OPTIONS.map((e) => (
              <Chip
                key={e}
                label={e.replace(/_/g, ' ')}
                active={equipment.includes(e)}
                onPress={() => setEquipment(toggleInArray(equipment, e))}
              />
            ))}
          </View>
        </View>

        {/* Injuries */}
        <View style={styles.section}>
          <ThemedText type="labelCaps" themeColor="textSecondary">Injuries / Limitations</ThemedText>
          <TextInput
            value={injuries}
            onChangeText={setInjuries}
            multiline
            placeholder="e.g. Left shoulder impingement — avoid overhead pressing"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, styles.multiline, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
            accessibilityLabel="Injuries or limitations"
          />
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <ThemedText type="labelCaps" themeColor="textSecondary">About My Training</ThemedText>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Anything else your coach should know"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, styles.multiline, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
            accessibilityLabel="About my training notes"
          />
        </View>

        <PrimaryButton
          label={isSaving ? 'Saving…' : 'Save Profile'}
          loading={isSaving}
          fullWidth
          onPress={handleSave}
          accessibilityLabel="Save training profile"
        />

        {savedAt && !isSaving && (
          <ThemedText type="small" style={{ color: theme.success, textAlign: 'center' }}>
            Profile saved.
          </ThemedText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: Spacing.three, gap: Spacing.four },
  section: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.full,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.twoHalf,
    fontSize: 16,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  unitControl: { width: 120 },
  errorContainer: { padding: Spacing.two, borderRadius: Radii.medium },
});
