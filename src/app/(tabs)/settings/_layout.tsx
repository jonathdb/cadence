/**
 * Settings stack layout.
 * Provides stack navigation within the settings tab for sub-screens.
 */
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function SettingsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Settings', headerShown: false }} />
      <Stack.Screen name="profile" options={{ title: 'Training Profile' }} />
      <Stack.Screen name="api-keys" options={{ title: 'API Keys' }} />
      <Stack.Screen name="permissions" options={{ title: 'Permissions' }} />
      <Stack.Screen name="spotify" options={{ title: 'Spotify' }} />
      <Stack.Screen name="health" options={{ title: 'Health' }} />
      <Stack.Screen name="audit-log" options={{ title: 'Audit Log' }} />
    </Stack>
  );
}
