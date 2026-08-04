/**
 * Root index - redirects based on auth state.
 * The actual redirect logic is in _layout.tsx's RootLayoutNav,
 * but we need this file so Expo Router has a valid initial route.
 */
import { Redirect } from 'expo-router';

import { useAuth } from '@/providers/AuthProvider';

export default function Index() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return null; // Splash screen is still showing
  }

  if (session) {
    return <Redirect href="/(tabs)/chat" />;
  }

  return <Redirect href="/(auth)/login" />;
}
