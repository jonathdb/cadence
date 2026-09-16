/**
 * Authenticated tabs layout — Kinetic Obsidian shell.
 * Floating glass tab dock (Chat, Program, Session, Progress, Settings) and a
 * branded top app bar per screen.
 *
 * Includes global offline sync status UI indicators:
 * - OfflineBanner: shown when device has no connectivity
 * - SyncStatusBadge: shown when permanently failed WAL entries exist
 */
import { Tabs, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { OfflineBanner } from '@/components/OfflineBanner';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { FloatingTabBar } from '@/components/ui/FloatingTabBar';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useTheme } from '@/hooks/use-theme';

const OVERLINES: Record<string, string> = {
  chat: 'AI Coach Chat',
  program: 'Training Programs',
  session: 'Active Session Hub',
  progress: 'Performance Analytics',
  settings: 'Profile and Settings',
};

export default function TabsLayout() {
  const theme = useTheme();
  const router = useRouter();

  const renderHeader = (routeName: string) => () => (
    <ScreenHeader
      overline={OVERLINES[routeName]}
      onPressAvatar={() => router.push('/(tabs)/settings')}
    />
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <OfflineBanner />
      <SyncStatusBadge />
      <View style={styles.content}>
        <Tabs
          tabBar={(props) => <FloatingTabBar {...props} />}
          screenOptions={{
            headerShown: true,
            sceneStyle: { backgroundColor: theme.background },
          }}
        >
          <Tabs.Screen
            name="chat"
            options={{ title: 'Chat', header: renderHeader('chat') }}
          />
          <Tabs.Screen
            name="program"
            options={{ title: 'Program', header: renderHeader('program') }}
          />
          <Tabs.Screen
            name="session"
            options={{ title: 'Session', header: renderHeader('session') }}
          />
          <Tabs.Screen
            name="progress"
            options={{ title: 'Progress', header: renderHeader('progress') }}
          />
          <Tabs.Screen
            name="settings"
            options={{ title: 'Settings', header: renderHeader('settings') }}
          />
          <Tabs.Screen
            name="journal"
            options={{ title: 'Journal', href: null }}
          />
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
