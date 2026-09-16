/**
 * Root layout: wraps the entire app with AuthProvider and ThemeProvider.
 * Uses Expo Router's Slot to render the current route.
 * Redirects to auth or main app based on authentication state.
 *
 * Loads the Plus Jakarta Sans type family at runtime (Kinetic Obsidian design
 * system). The splash screen is held until both fonts and auth are ready.
 */
import {
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { DarkTheme, DefaultTheme, Slot, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { initSentry } from '@/lib/sentry';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { StoreIntegrationProvider } from '@/providers/StoreIntegrationProvider';
import { useNotificationDeepLink } from '@/services/notifications';

// Initialize Sentry at module level — before any error boundaries mount
initSentry();

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayoutNav({ fontsReady }: { fontsReady: boolean }) {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const appReady = !isLoading && fontsReady;

  // Deep-link to a route carried in a tapped notification's data.route (e.g. the
  // proactive session-insight notification links to chat). Only navigates when
  // authenticated so we don't jump past the login gate.
  const navigateFromNotification = useCallback(
    (route: string) => {
      if (session) {
        router.push(route as never);
      }
    },
    [session, router]
  );
  useNotificationDeepLink(navigateFromNotification);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)/chat');
    }
  }, [session, isLoading, segments]);

  // Hide splash once loading + fonts are done (native only)
  useEffect(() => {
    if (appReady && Platform.OS !== 'web') {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [appReady]);

  // Hold rendering until fonts are ready so we never flash system font first.
  if (!fontsReady) return null;

  return <Slot />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  // On error, proceed with system fallback rather than blocking the app.
  const fontsReady = fontsLoaded || !!fontError;

  return (
    <ErrorBoundary>
      <AuthProvider>
        <StoreIntegrationProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <RootLayoutNav fontsReady={fontsReady} />
          </ThemeProvider>
        </StoreIntegrationProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
