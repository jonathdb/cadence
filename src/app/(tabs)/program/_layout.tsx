/**
 * Program tab layout — uses a Stack navigator for nested screens.
 * index.tsx = active program overview
 * library.tsx = saved/archived programs
 * [dayId].tsx = day detail view
 *
 * Requirements: 1.2, 4.3, 5.1, 5.2
 */
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function ProgramLayout() {
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
      <Stack.Screen name="library" options={{ title: 'Program Library' }} />
      <Stack.Screen name="[dayId]" options={{ title: 'Day Detail' }} />
    </Stack>
  );
}
