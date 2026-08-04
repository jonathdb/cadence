/**
 * Auth group layout - contains login/register/verify-email screens.
 * Rendered when user is not authenticated.
 * All screens are headerless for a clean auth experience.
 *
 * Requirements: 27.1
 */
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="verify-email" />
    </Stack>
  );
}
