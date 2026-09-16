/**
 * ScreenHeader — Kinetic Obsidian top app bar.
 *
 * Left: Cadence pulse brand mark + brand label with a view overline.
 * Right: notifications bell (with optional unread dot) + athlete avatar.
 *
 * Designed to be used as a custom expo-router `header`.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/Icon';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ScreenHeaderProps = {
  /** Overline shown under the brand, e.g. "ACTIVE SESSION HUB". */
  overline?: string;
  hasUnread?: boolean;
  onPressBell?: () => void;
  onPressAvatar?: () => void;
};

/** Cadence pulse mark: a dashed ring with an inner activity waveform. */
function PulseMark({ color, size = 32 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Circle
        cx={16}
        cy={16}
        r={14}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="3 3"
        fill="none"
        opacity={0.7}
      />
      <Path
        d="M7 16 L12 16 L14.5 10 L18 22 L20 16 L25 16"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function ScreenHeader({
  overline,
  hasUnread = false,
  onPressBell,
  onPressAvatar,
}: ScreenHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + Spacing.two,
          backgroundColor: theme.background,
          borderBottomColor: theme.borderSubtle,
        },
      ]}
    >
      <View style={styles.left}>
        <PulseMark color={theme.accent} />
        <View style={styles.brandText}>
          <ThemedText type="headlineSmall" style={{ color: theme.accent }}>
            Cadence
          </ThemedText>
          {overline ? (
            <ThemedText type="labelCaps" style={{ color: theme.textSecondary }}>
              {overline}
            </ThemedText>
          ) : null}
        </View>
      </View>

      <View style={styles.right}>
        <Pressable
          onPress={onPressBell}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          style={styles.iconButton}
          hitSlop={8}
        >
          <Icon name="bell" size={22} color={theme.textSecondary} />
          {hasUnread ? (
            <View style={[styles.unreadDot, { backgroundColor: theme.accent, borderColor: theme.background }]} />
          ) : null}
        </Pressable>
        <Pressable
          onPress={onPressAvatar}
          accessibilityRole="button"
          accessibilityLabel="Profile"
          style={[styles.avatar, { backgroundColor: theme.accent }]}
          hitSlop={4}
        >
          <Icon name="person" size={18} color={theme.accentText} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.twoHalf,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minWidth: 0,
    flex: 1,
  },
  brandText: {
    minWidth: 0,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoHalf,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: Radii.full,
    borderWidth: 1.5,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
