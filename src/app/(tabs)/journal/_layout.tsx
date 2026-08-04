/**
 * Journal tab nested layout.
 * Uses a Stack navigator to support list → detail navigation.
 *
 * Requirements: 22.1, 22.2, 22.3, 22.4
 */
import { Stack } from 'expo-router';

export default function JournalLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
