/**
 * Progress tab layout — uses a Stack navigator for nested screens.
 * index.tsx = main progression dashboard
 *
 * The per-exercise history/detail screens moved to `src/app/exercise/` (a
 * route group outside `(tabs)`) so they're reachable from any tab without
 * back navigation landing on the Progress tab's root — see
 * `src/app/exercise/_layout.tsx` for the full rationale.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 21.1, 21.2, 21.3
 */
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function ProgressLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
