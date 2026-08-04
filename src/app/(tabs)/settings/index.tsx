/**
 * Main settings hub screen.
 * Shows user email, sign-out button, and navigation links to sub-screens:
 * API Keys, Permissions, Spotify, Health.
 *
 * Requirements: 3.1, 23.1, 25.1, 12.1
 */
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';

interface SettingsLink {
  label: string;
  description: string;
  route: '/(tabs)/settings/api-keys' | '/(tabs)/settings/permissions' | '/(tabs)/settings/spotify' | '/(tabs)/settings/health' | '/(tabs)/settings/audit-log';
}

const SETTINGS_LINKS: SettingsLink[] = [
  {
    label: 'API Keys',
    description: 'Configure OpenAI or Anthropic API keys',
    route: '/(tabs)/settings/api-keys',
  },
  {
    label: 'Permissions',
    description: 'Control what the Agent can do automatically',
    route: '/(tabs)/settings/permissions',
  },
  {
    label: 'Spotify',
    description: 'Connect or disconnect your Spotify account',
    route: '/(tabs)/settings/spotify',
  },
  {
    label: 'Health',
    description: 'Connect HealthKit or Health Connect',
    route: '/(tabs)/settings/health',
  },
  {
    label: 'Audit Log',
    description: 'View all Agent actions and their outcomes',
    route: '/(tabs)/settings/audit-log',
  },
];

export default function SettingsIndexScreen() {
  const { session, signOut } = useAuth();
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Settings</ThemedText>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            ACCOUNT
          </ThemedText>
          <View style={styles.card}>
            <ThemedText>{session?.user.email ?? 'Not signed in'}</ThemedText>
          </View>
        </View>

        {/* Navigation Links */}
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            CONFIGURATION
          </ThemedText>
          {SETTINGS_LINKS.map((link) => (
            <Pressable
              key={link.route}
              style={styles.linkCard}
              onPress={() => router.push(link.route)}
              accessibilityRole="button"
              accessibilityLabel={`Navigate to ${link.label} settings`}
            >
              <View style={styles.linkContent}>
                <ThemedText style={styles.linkLabel}>{link.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {link.description}
                </ThemedText>
              </View>
              <ThemedText themeColor="textSecondary">›</ThemedText>
            </Pressable>
          ))}
        </View>

        {/* Sign Out */}
        <View style={styles.section}>
          <Pressable
            style={styles.signOutButton}
            onPress={signOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out of your account"
          >
            <ThemedText style={styles.signOutText}>Sign Out</ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    paddingTop: Spacing.five,
  },
  section: {
    gap: Spacing.two,
  },
  card: {
    padding: Spacing.three,
    borderRadius: 8,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 8,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
  },
  linkContent: {
    flex: 1,
    gap: 2,
  },
  linkLabel: {
    fontWeight: '600',
    fontSize: 16,
  },
  signOutButton: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    padding: Spacing.two + 4,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  signOutText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
