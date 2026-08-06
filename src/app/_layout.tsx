/**
 * Root layout: wraps the entire app with AuthProvider and ThemeProvider.
 * Uses Expo Router's Slot to render the current route.
 * Redirects to auth or main app based on authentication state.
 */
import { DarkTheme, DefaultTheme, Slot, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { StoreIntegrationProvider } from '@/providers/StoreIntegrationProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)/chat');
    }
  }, [session, isLoading, segments]);

  // Hide splash once loading is done (native only)
  useEffect(() => {
    if (!isLoading && Platform.OS !== 'web') {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  return <Slot />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ErrorBoundary>
      <AuthProvider>
        <StoreIntegrationProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <RootLayoutNav />
          </ThemeProvider>
        </StoreIntegrationProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
