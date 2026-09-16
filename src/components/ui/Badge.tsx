/**
 * Badge / StatusPill — Kinetic Obsidian compact status label.
 *
 * Variants map to the design system's functional colors:
 *  - accent   → cyan (e.g. "TODAY", "RPE 6 TARGET")
 *  - success  → emerald tint (e.g. "ACTIVE", "COMPLETED", "NEW", "GPS READY")
 *  - neutral  → muted surface (e.g. "ZONE 2", "KEPT", "SCHEDULED")
 *  - swapped  → high-contrast surface (e.g. "SWAPPED")
 *  - warning  → amber (e.g. "DELOAD")
 *  - pr       → amber PR highlight
 *
 * Use `dot` for a leading status dot (e.g. "• ACTIVE").
 */
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';

export type BadgeVariant =
  | 'accent'
  | 'success'
  | 'neutral'
  | 'swapped'
  | 'warning'
  | 'pr'
  | 'error';

export type BadgeProps = {
  label: string;
  variant?: BadgeVariant;
  dot?: boolean;
  style?: ViewStyle;
};

export function Badge({ label, variant = 'neutral', dot = false, style }: BadgeProps) {
  const theme = useTheme();

  const { bg, fg, border } = getVariantColors(theme, variant);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: bg, borderColor: border ?? 'transparent', borderWidth: border ? 1 : 0 },
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: fg }]} /> : null}
      <ThemedText type="labelCaps" style={{ color: fg }}>
        {label}
      </ThemedText>
    </View>
  );
}

function getVariantColors(
  theme: ReturnType<typeof useTheme>,
  variant: BadgeVariant,
): { bg: string; fg: string; border?: string } {
  switch (variant) {
    case 'accent':
      return { bg: theme.accentSoft, fg: theme.accent };
    case 'success':
      return { bg: theme.successSoft, fg: theme.success, border: theme.mode === 'dark' ? 'rgba(16,185,129,0.4)' : undefined };
    case 'swapped':
      return { bg: theme.backgroundHighest, fg: theme.text };
    case 'warning':
      return { bg: theme.warningSoft, fg: theme.warning };
    case 'pr':
      return { bg: theme.prBackground, fg: theme.prText, border: theme.prBorder };
    case 'error':
      return { bg: theme.errorSoft, fg: theme.error };
    case 'neutral':
    default:
      return { bg: theme.backgroundHighest, fg: theme.textSecondary };
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half + 1,
    borderRadius: Radii.full,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: Radii.full,
  },
});
