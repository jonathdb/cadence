/**
 * Authenticated tabs layout.
 * Bottom tab navigation: Chat, Program, Session, Progress, Settings.
 * Uses the Cadence dark-first design system.
 */
import { Tabs } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        tabBarStyle: {
          backgroundColor: theme.tabBarBackground,
          borderTopColor: theme.tabBarBorder,
          borderTopWidth: 1,
        },
        headerStyle: {
          backgroundColor: theme.background,
        },
        headerTintColor: theme.text,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Agent',
          tabBarLabel: 'Chat',
        }}
      />
      <Tabs.Screen
        name="program"
        options={{
          title: 'Program',
          tabBarLabel: 'Program',
        }}
      />
      <Tabs.Screen
        name="session"
        options={{
          title: 'Session',
          tabBarLabel: 'Session',
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarLabel: 'Progress',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Journal',
          href: null,
        }}
      />
    </Tabs>
  );
}
