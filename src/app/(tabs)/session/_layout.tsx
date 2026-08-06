/**
 * Session tab layout — uses a Stack navigator for nested screens.
 * index.tsx = session entry (pick a day or redirect)
 * [dayId].tsx = active session logging screen
 * summary.tsx = end-of-session summary screen
 *
 * Requirements: 9.1, 10.1, 11.1, 11.2, 18.1, 22.1
 */
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function SessionLayout() {
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
      <Stack.Screen name="[dayId]" options={{ title: 'Session' }} />
      <Stack.Screen name="freestyle" options={{ title: 'Freestyle Session' }} />
      <Stack.Screen name="route" options={{ title: 'Track Route' }} />
      <Stack.Screen name="summary" options={{ headerShown: false }} />
    </Stack>
  );
}
