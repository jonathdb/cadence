/**
 * Main settings hub screen.
 * Shows user email, sign-out button, and navigation links to sub-screens:
 * API Keys, Permissions, Spotify, Health (native only).
 * Includes inline toggles for session preferences (rest timer auto-start).
 *
 * Requirements: 3.1, 15.2, 15.3, 23.1, 23.2, 23.3, 25.1, 12.1
 */
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlatformCapabilities } from '@/hooks/usePlatformCapabilities';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useAuth } from '@/providers/AuthProvider';

interface SettingsLink {
  label: string;
  description: string;
  route: '/(tabs)/settings/api-keys' | '/(tabs)/settings/permissions' | '/(tabs)/settings/spotify' | '/(tabs)/settings/health' | '/(tabs)/settings/audit-log';
  /** If set, only show this link when the given capability is available */
  requiresCapability?: 'health' | 'notifications' | 'gps' | 'biometrics';
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
    requiresCapability: 'health',
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
  const theme = useTheme();
  const { settings, updateSetting } = useUserSettings();
  const capabilities = usePlatformCapabilities();
  const fetchTierInfo = useAiTierStore((s) => s.fetchTierInfo);

  // Fetch AI tier info when screen mounts
  useEffect(() => {
    if (session?.user?.id) {
      fetchTierInfo(session.user.id);
    }
  }, [session?.user?.id, fetchTierInfo]);

  // Filter settings links based on platform capabilities (Req 23.2, 23.3)
  const visibleLinks = SETTINGS_LINKS.filter((link) => {
    if (!link.requiresCapability) return true;
    return capabilities[link.requiresCapability];
  });

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <ThemedText type="headlineMedium">Settings</ThemedText>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <ThemedText type="labelMedium" themeColor="textSecondary">
            ACCOUNT
          </ThemedText>
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText>{session?.user.email ?? 'Not signed in'}</ThemedText>
          </View>
        </View>

        {/* AI Plan Section */}
        <View style={styles.section}>
          <ThemedText type="labelMedium" themeColor="textSecondary">
            AI PLAN
          </ThemedText>
          <AIPlanCard />
        </View>

        {/* Session Preferences (Req 15.2, 15.3) */}
        <View style={styles.section}>
          <ThemedText type="labelMedium" themeColor="textSecondary">
            SESSION
          </ThemedText>
          <View style={[styles.toggleCard, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.toggleContent}>
              <ThemedText style={styles.toggleLabel}>Rest Timer Auto-Start</ThemedText>
              <ThemedText type="bodySmall" themeColor="textSecondary">
                Automatically start the rest timer after logging a set
              </ThemedText>
            </View>
            <Switch
              value={settings.rest_timer_auto_start}
              onValueChange={(value) => updateSetting('rest_timer_auto_start', value)}
              trackColor={{ false: theme.border, true: theme.accent }}
              accessibilityLabel="Toggle rest timer auto-start"
              accessibilityRole="switch"
            />
          </View>
        </View>

        {/* Navigation Links */}
        <View style={styles.section}>
          <ThemedText type="labelMedium" themeColor="textSecondary">
            CONFIGURATION
          </ThemedText>
          {visibleLinks.map((link) => (
            <Pressable
              key={link.route}
              style={[styles.linkCard, { backgroundColor: theme.backgroundElement }]}
              onPress={() => router.push(link.route)}
              accessibilityRole="button"
              accessibilityLabel={`Navigate to ${link.label} settings`}
            >
              <View style={styles.linkContent}>
                <ThemedText style={styles.linkLabel}>{link.label}</ThemedText>
                <ThemedText type="bodySmall" themeColor="textSecondary">
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
            style={[styles.signOutButton, { backgroundColor: theme.error }]}
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
    borderRadius: Radii.medium,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Radii.medium,
  },
  linkContent: {
    flex: 1,
    gap: 2,
  },
  linkLabel: {
    fontWeight: '600',
    fontSize: 16,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Radii.medium,
  },
  toggleContent: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    fontWeight: '600',
    fontSize: 16,
  },
  signOutButton: {
    borderRadius: Radii.medium,
    padding: Spacing.two + 4,
    alignItems: 'center',
    marginTop: Spacing.two,
    minHeight: 48,
    justifyContent: 'center',
  },
  signOutText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
