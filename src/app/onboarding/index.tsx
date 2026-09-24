/**
 * First-run onboarding flow (Requirement 5).
 *
 * A single, state-driven screen that walks a new user through a short,
 * multi-step setup collecting their training profile. It lives at `/onboarding`
 * (outside the `(tabs)` group, so no floating dock) and is presented when the
 * server-persisted `onboarding_status` is still `pending`.
 *
 * Design notes:
 *  - The whole flow is ONE screen with a `step` index in component state, so
 *    every value the user enters persists in-session across steps and across a
 *    write failure (Requirement 5.8) — nothing is unmounted between steps.
 *  - Every field is optional (Requirement 5.2); leaving anything empty never
 *    blocks Next / Finish / Skip.
 *  - Skip is present and selectable on every step incl. the first and last
 *    (Requirement 5.3). Skipping persists any entered values, marks the status
 *    `skipped`, and grants full access (Requirement 5.4, 5.6).
 *  - Finish persists entered values then marks the status `completed`
 *    (Requirement 5.7).
 *  - If either the value write or the status write fails, entered values are
 *    kept in state, an error is shown, and we do NOT navigate away or mark the
 *    status resolved (Requirement 5.8).
 *
 * Reuses the field inputs/patterns from `settings/profile.tsx` for consistency.
 * Expo SDK 57 (React Native 0.86): core RN primitives + existing themed UI.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GhostButton, PrimaryButton } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/AuthProvider';
import {
    buildOnboardingPatch,
    setOnboardingStatus,
    updateUserProfile,
} from '@/services/profile';
import {
    EXPERIENCE_LEVELS,
    TRAINING_GOALS,
    parseProfileNumerics,
    type BodyweightUnit,
    type ExperienceLevel,
    type OnboardingValues,
    type TrainingGoal,
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

/** Where the flow dismisses to once onboarding is resolved. */
const APP_HOME = '/(tabs)/chat' as const;

/**
 * Total steps: an intro (0) followed by four collection steps (1–4).
 * Step 4 is the last step — Finish is shown there.
 */
const INTRO_STEP = 0;
const LAST_STEP = 4;
const TOTAL_COLLECTION_STEPS = 4;

export default function OnboardingScreen() {
  const { session } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [step, setStep] = useState<number>(INTRO_STEP);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state — retained for the whole session (never unmounted between steps).
  const [goal, setGoal] = useState<TrainingGoal | null>(null);
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [bodyweight, setBodyweight] = useState('');
  const [bodyweightUnit, setBodyweightUnit] = useState<BodyweightUnit>('kg');
  const [weeklyFrequency, setWeeklyFrequency] = useState('');
  const [days, setDays] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [injuries, setInjuries] = useState('');
  const [notes, setNotes] = useState('');

  const toggleInArray = (arr: string[], value: string): string[] =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  /**
   * Builds the set of onboarding values the user has actually entered. Only
   * keys the user touched are included so `buildOnboardingPatch` never writes
   * (or clears) untouched fields (Requirement 5.6).
   */
  function collectEnteredValues(): { ok: true; values: OnboardingValues } | { ok: false; error: string } {
    const parsed = parseProfileNumerics({ bodyweight, weeklyFrequency });
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }

    const values: OnboardingValues = {};
    if (goal !== null) values.goal = goal;
    if (experience !== null) values.experience_level = experience;
    if (parsed.bodyweight !== null) {
      values.bodyweight = parsed.bodyweight;
      values.bodyweight_unit = bodyweightUnit;
    }
    if (parsed.weeklyFrequency !== null) values.weekly_frequency = parsed.weeklyFrequency;
    if (days.length > 0) values.preferred_training_days = days;
    if (equipment.length > 0) values.equipment = equipment;
    if (injuries.trim() !== '') values.injuries = injuries.trim();
    if (notes.trim() !== '') values.training_notes = notes.trim();

    return { ok: true, values };
  }

  /**
   * Shared resolve path for both Skip and Finish. Persists any entered values
   * then records the resolved status. On any failure, keeps values in state,
   * shows an error, and does NOT navigate (Requirement 5.8).
   */
  async function resolveOnboarding(status: 'completed' | 'skipped') {
    const userId = session?.user.id;
    if (!userId) return;

    const collected = collectEnteredValues();
    if (!collected.ok) {
      setError(collected.error);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Persist entered values first (only touched fields are written).
      const patch = buildOnboardingPatch(collected.values);
      if (Object.keys(patch).length > 0) {
        await updateUserProfile(userId, patch);
      }
      // Only after values are safely written do we mark the status resolved.
      await setOnboardingStatus(userId, status);

      router.replace(APP_HOME);
    } catch (err) {
      // Keep entered values in state; do not mark resolved; do not navigate.
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  const goNext = () => {
    setError(null);
    setStep((s) => Math.min(s + 1, LAST_STEP));
  };
  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, INTRO_STEP));
  };

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
      <ThemedText type="labelLarge" style={{ color: active ? theme.accentText : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
  ];

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + Spacing.four, paddingBottom: insets.bottom + Spacing.six },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress + skip header */}
        <View style={styles.header}>
          {step === INTRO_STEP ? (
            <ThemedText type="labelCaps" themeColor="textSecondary">Welcome</ThemedText>
          ) : (
            <ThemedText type="labelCaps" themeColor="textSecondary">
              {`Step ${step} of ${TOTAL_COLLECTION_STEPS}`}
            </ThemedText>
          )}
          <Pressable
            onPress={() => resolveOnboarding('skipped')}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            hitSlop={8}
          >
            <ThemedText type="linkPrimary">Skip</ThemedText>
          </Pressable>
        </View>

        {error && (
          <View style={[styles.errorContainer, { backgroundColor: theme.errorSoft }]}>
            <ThemedText style={{ fontSize: 14, color: theme.error }}>{error}</ThemedText>
          </View>
        )}

        {/* ---- Step content ---- */}
        {step === INTRO_STEP && (
          <View style={styles.section}>
            <ThemedText type="headlineLarge">Let’s set up your coach</ThemedText>
            <ThemedText type="bodyLarge" themeColor="textSecondary">
              Answer a few quick questions so Cadence can personalize your training. Everything is
              optional — you can skip any step, or the whole thing, and change it later in Settings.
            </ThemedText>
          </View>
        )}

        {step === 1 && (
          <View style={styles.stepBody}>
            <View style={styles.section}>
              <ThemedText type="labelCaps" themeColor="textSecondary">Primary Goal</ThemedText>
              <View style={styles.chipWrap}>
                {TRAINING_GOALS.map((g) => (
                  <Chip
                    key={g}
                    label={GOAL_LABELS[g]}
                    active={goal === g}
                    onPress={() => setGoal(goal === g ? null : g)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <ThemedText type="labelCaps" themeColor="textSecondary">Experience Level</ThemedText>
              <SegmentedControl
                options={EXPERIENCE_LEVELS.map((e) => ({ value: e, label: e[0].toUpperCase() + e.slice(1) }))}
                value={experience ?? 'beginner'}
                onChange={(v) => setExperience(v as ExperienceLevel)}
              />
              <ThemedText type="bodySmall" themeColor="textTertiary">
                Optional — leave it if you’re not sure.
              </ThemedText>
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepBody}>
            <View style={styles.section}>
              <ThemedText type="labelCaps" themeColor="textSecondary">Bodyweight</ThemedText>
              <View style={styles.row}>
                <TextInput
                  value={bodyweight}
                  onChangeText={setBodyweight}
                  keyboardType="numeric"
                  placeholder="e.g. 80"
                  placeholderTextColor={theme.textSecondary}
                  style={[...inputStyle, { flex: 1 }]}
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

            <View style={styles.section}>
              <ThemedText type="labelCaps" themeColor="textSecondary">Sessions Per Week</ThemedText>
              <TextInput
                value={weeklyFrequency}
                onChangeText={setWeeklyFrequency}
                keyboardType="numeric"
                placeholder="e.g. 4"
                placeholderTextColor={theme.textSecondary}
                style={inputStyle}
                accessibilityLabel="Sessions per week"
              />
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepBody}>
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

            <View style={styles.section}>
              <ThemedText type="labelCaps" themeColor="textSecondary">Preferred Training Days</ThemedText>
              <View style={styles.chipWrap}>
                {DAYS.map((d) => (
                  <Chip
                    key={d.value}
                    label={d.label}
                    active={days.includes(d.value)}
                    onPress={() => setDays(toggleInArray(days, d.value))}
                  />
                ))}
              </View>
            </View>
          </View>
        )}

        {step === 4 && (
          <View style={styles.stepBody}>
            <View style={styles.section}>
              <ThemedText type="labelCaps" themeColor="textSecondary">Injuries / Limitations</ThemedText>
              <TextInput
                value={injuries}
                onChangeText={setInjuries}
                multiline
                placeholder="e.g. Left shoulder impingement — avoid overhead pressing"
                placeholderTextColor={theme.textSecondary}
                style={[...inputStyle, styles.multiline]}
                accessibilityLabel="Injuries or limitations"
              />
            </View>

            <View style={styles.section}>
              <ThemedText type="labelCaps" themeColor="textSecondary">About My Training</ThemedText>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="Anything else your coach should know"
                placeholderTextColor={theme.textSecondary}
                style={[...inputStyle, styles.multiline]}
                accessibilityLabel="About my training notes"
              />
            </View>
          </View>
        )}

        {/* ---- Navigation ---- */}
        <View style={styles.navRow}>
          {step > INTRO_STEP && (
            <GhostButton
              label="Back"
              onPress={goBack}
              disabled={isSaving}
              style={styles.navButton}
              accessibilityLabel="Go to previous step"
            />
          )}

          {step < LAST_STEP ? (
            <PrimaryButton
              label={step === INTRO_STEP ? 'Get started' : 'Next'}
              onPress={goNext}
              disabled={isSaving}
              style={styles.navButton}
              accessibilityLabel="Go to next step"
            />
          ) : (
            <PrimaryButton
              label={isSaving ? 'Finishing…' : 'Finish'}
              loading={isSaving}
              onPress={() => resolveOnboarding('completed')}
              style={styles.navButton}
              accessibilityLabel="Finish onboarding"
            />
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepBody: { gap: Spacing.four },
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
  navRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  navButton: { flex: 1 },
});
