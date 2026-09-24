/**
 * Exercise detail/history route group — lives OUTSIDE the `(tabs)` group so it
 * is pushed onto the root stack rather than a tab-local stack.
 *
 * Why this exists: these screens are reachable from multiple tabs (the
 * Program day view, the Exercise Library, and the Progress dashboard). Expo
 * Router's tab navigator gives each tab its own independent history — pushing
 * an absolute path into a *different* tab (e.g. from `program` into
 * `(tabs)/progress/exercise/...`) switches the active tab and pushes there,
 * so the back button then pops within that tab's stack (its root is
 * `progress/index.tsx`), never returning to the tab the user actually came
 * from. Hoisting these screens to a shared, tab-independent stack fixes that:
 * any tab can push here, and back always returns to the exact screen that
 * pushed it, regardless of which tab that was.
 *
 * - `[exerciseId]/history.tsx` = per-exercise logged-set/PR history
 * - `[exerciseId]/details.tsx` = catalog exercise detail (description, media)
 */
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function ExerciseLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
      }}
    >
      <Stack.Screen name="[exerciseId]/history" options={{ title: 'Exercise History' }} />
      <Stack.Screen name="[exerciseId]/details" options={{ title: 'Exercise Details' }} />
    </Stack>
  );
}
