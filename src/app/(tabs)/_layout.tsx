/**
 * Authenticated tabs layout.
 * Shows bottom tab navigation for: Chat, Program, Session, Progress, Settings.
 * This is the main app shell after authentication.
 *
 * Requirements: 27.1
 */
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#3c87f7',
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.background },
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
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
          href: null, // Hidden from tab bar — accessible from Progress screen
        }}
      />
    </Tabs>
  );
}
