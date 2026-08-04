/**
 * Chat tab nested layout.
 * Uses a Stack navigator to support future sub-screens (e.g., chat history).
 */
import { Stack } from 'expo-router';

export default function ChatLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
