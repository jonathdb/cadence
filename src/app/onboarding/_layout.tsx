/**
 * Onboarding group layout.
 *
 * The first-run guided setup (Requirement 5). Rendered as a headerless stack
 * living at `/onboarding`, outside the `(tabs)` group so the floating dock is
 * not shown during setup. A single screen (`index`) drives the multi-step flow
 * internally so entered values are retained in-session across steps and across
 * a write failure (Requirement 5.8).
 */
import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
