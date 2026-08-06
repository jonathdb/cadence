/**
 * Progress tab layout — uses a Stack navigator for nested screens.
 * index.tsx = main progression dashboard
 * exercise/[exerciseId].tsx = per-exercise history screen
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
      <Stack.Screen
        name="exercise/[exerciseId]"
        options={{ title: 'Exercise History' }}
      />
    </Stack>
  );
}
