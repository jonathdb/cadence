/**
 * Settings hub — Profile and Settings (Kinetic Obsidian).
 *
 * Account profile card, AI Coach Engine section, session automation toggle,
 * integrations & hardware links, and sign out. Preserves all existing data,
 * toggles, capability filtering, and navigation behavior.
 *
 * Requirements: 3.1, 15.2, 15.3, 23.1, 23.2, 23.3, 25.1, 12.1
 */
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { AIPlanCard } from '@/components/AIPlanCard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/Badge';
import { DestructiveButton } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlatformCapabilities } from '@/hooks/usePlatformCapabilities';
import { useTabBarClearance } from '@/hooks/useTabBarClearance';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useAuth } from '@/providers/AuthProvider';
import { useAiTierStore } from '@/store/ai-tier';

interface SettingsLink {
  label: string;
  description: string;
  icon: IconName;
  iconColor?: 'accent' | 'success' | 'tertiary';
  route: '/(tabs)/settings/profile' | '/(tabs)/settings/api-keys' | '/(tabs)/settings/permissions' | '/(tabs)/settings/spotify' | '/(tabs)/settings/health' | '/(tabs)/settings/audit-log';
  /** If set, only show this link when the given capability is available */
  requiresCapability?: 'health' | 'notifications' | 'gps' | 'biometrics';
}

const ENGINE_LINKS: SettingsLink[] = [
  {
    label: 'API Keys',
    description: 'Configure OpenAI or Anthropic API keys',
    icon: 'shield',
    iconColor: 'accent',
    route: '/(tabs)/settings/api-keys',
  },
];

const INTEGRATION_LINKS: SettingsLink[] = [
  {
    label: 'Spotify Audio Engine',
    description: 'Connect or disconnect your Spotify account',
    icon: 'music',
    iconColor: 'success',
    route: '/(tabs)/settings/spotify',
  },
  {
    label: 'Apple Health & Garmin',
    description: 'Connect HealthKit or Health Connect',
    icon: 'heart',
    iconColor: 'tertiary',
    route: '/(tabs)/settings/health',
    requiresCapability: 'health',
  },
  {
    label: 'Agent Permissions',
    description: 'Control what the Agent can do automatically',
    icon: 'shield',
    iconColor: 'accent',
    route: '/(tabs)/settings/permissions',
  },
  {
    label: 'Audit Log',
    description: 'View all Agent actions and their outcomes',
    icon: 'insights',
    iconColor: 'tertiary',
    route: '/(tabs)/settings/audit-log',
  },
];

export default function SettingsIndexScreen() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const dockClearance = useTabBarClearance();
  const { settings, updateSetting } = useUserSettings();
  const capabilities = usePlatformCapabilities();
  const fetchTierInfo = useAiTierStore((s) => s.fetchTierInfo);

  // Fetch AI tier info when screen mounts
  useEffect(() => {
    if (session?.user?.id) {
      fetchTierInfo(session.user.id);
    }
  }, [session?.user?.id, fetchTierInfo]);

  const iconColorFor = (c?: 'accent' | 'success' | 'tertiary') =>
    c === 'success' ? theme.success : c === 'tertiary' ? theme.tertiary : theme.accent;

  const visibleIntegrations = INTEGRATION_LINKS.filter((link) => {
    if (!link.requiresCapability) return true;
    return capabilities[link.requiresCapability];
  });

  const email = session?.user.email ?? 'Not signed in';
  const displayName = email.split('@')[0] || 'Athlete';

  const renderLink = (link: SettingsLink) => (
    <Pressable
      key={link.route}
      onPress={() => router.push(link.route)}
      accessibilityRole="button"
      accessibilityLabel={`Navigate to ${link.label} settings`}
    >
      <GlassCard elevation="low" style={styles.linkCard}>
        <View style={[styles.linkIcon, { backgroundColor: theme.backgroundHighest }]}>
          <Icon name={link.icon} size={20} color={iconColorFor(link.iconColor)} />
        </View>
        <View style={styles.linkContent}>
          <ThemedText type="titleMedium">{link.label}</ThemedText>
          <ThemedText type="bodySmall" themeColor="textSecondary" numberOfLines={1}>
            {link.description}
          </ThemedText>
        </View>
        <Icon name="chevron-right" size={18} color={theme.textSecondary} />
      </GlassCard>
    </Pressable>
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: dockClearance },
        ]}
      >
        {/* Account */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText type="labelCaps" themeColor="textSecondary">
              Account
            </ThemedText>
            <Badge label="Telemetry Live" variant="success" dot />
          </View>
          <Pressable
            onPress={() => router.push('/(tabs)/settings/profile')}
            accessibilityRole="button"
            accessibilityLabel="Edit training profile"
          >
            <GlassCard elevation="mid" radius="xl" style={styles.profileCard}>
              <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
                <Icon name="person" size={24} color={theme.accent} />
              </View>
              <View style={styles.profileText}>
                <ThemedText type="headlineSmall" numberOfLines={1}>
                  {displayName}
                </ThemedText>
                <ThemedText type="bodySmall" themeColor="textSecondary" numberOfLines={1}>
                  {email}
                </ThemedText>
              </View>
              <Icon name="chevron-right" size={18} color={theme.textSecondary} />
            </GlassCard>
          </Pressable>
        </View>

        {/* AI Coach Engine */}
        <View style={styles.section}>
          <ThemedText type="labelCaps" themeColor="textSecondary">
            AI Coach Engine
          </ThemedText>
          <AIPlanCard />
          {ENGINE_LINKS.map(renderLink)}
        </View>

        {/* Session automation (Req 15.2, 15.3) */}
        <View style={styles.section}>
          <ThemedText type="labelCaps" themeColor="textSecondary">
            Workout Session Automation
          </ThemedText>
          <GlassCard elevation="low" style={styles.toggleCard}>
            <View style={[styles.linkIcon, { backgroundColor: theme.backgroundHighest }]}>
              <Icon name="timer" size={20} color={theme.accent} />
            </View>
            <View style={styles.toggleContent}>
              <ThemedText type="titleMedium">Rest Timer Auto-Start</ThemedText>
              <ThemedText type="bodySmall" themeColor="textSecondary">
                Automatically start the rest timer after logging a set
              </ThemedText>
            </View>
            <Switch
              value={settings.rest_timer_auto_start}
              onValueChange={(value) => updateSetting('rest_timer_auto_start', value)}
              trackColor={{ false: theme.backgroundHighest, true: theme.accent }}
              thumbColor="#ffffff"
              ios_backgroundColor={theme.backgroundHighest}
              accessibilityLabel="Toggle rest timer auto-start"
              accessibilityRole="switch"
            />
          </GlassCard>
        </View>

        {/* Integrations & Hardware */}
        <View style={styles.section}>
          <ThemedText type="labelCaps" themeColor="textSecondary">
            Integrations & Hardware
          </ThemedText>
          {visibleIntegrations.map(renderLink)}
        </View>

        {/* Sign Out */}
        <DestructiveButton
          label="Sign Out of Cadence"
          icon={<Icon name="sign-out" size={18} color={theme.error} />}
          fullWidth
          onPress={signOut}
          accessibilityLabel="Sign out of your account"
        />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.three,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Profile
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoHalf,
    padding: Spacing.three,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: Radii.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  // Links
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoHalf,
    padding: Spacing.twoHalf,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: Radii.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkContent: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  // Toggle
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoHalf,
    padding: Spacing.twoHalf,
  },
  toggleContent: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
