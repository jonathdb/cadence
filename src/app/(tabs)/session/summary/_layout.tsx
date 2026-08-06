/**
 * Summary sub-layout — renders dynamic [sessionId] route as a single screen.
 */
import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function SummaryLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
      }}
    >
      <Stack.Screen
        name="[sessionId]"
        options={{ title: 'Session Summary', headerBackVisible: false }}
      />
    </Stack>
  );
}
