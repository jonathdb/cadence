/**
 * GlassCard — Kinetic Obsidian surface primitive.
 *
 * Renders a frosted glass card using expo-glass-effect's GlassView where
 * supported (iOS 26+), and falls back to a solid tinted surface with a
 * hairline border everywhere else. Legibility never depends on real blur.
 *
 * Elevation tiers map to the design system:
 *  - "low"  → surface-container-low  (structural cards)
 *  - "mid"  → surface-container      (interactive modules)
 *  - "high" → surface-container-high (floating / prominent)
 *
 * Set `active` for the focused-card treatment: cyan accent border + glow.
 */
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { type ReactNode } from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Elevation = 'low' | 'mid' | 'high';

export type GlassCardProps = ViewProps & {
  children?: ReactNode;
  elevation?: Elevation;
  /** Focused/active state: cyan accent border + atmospheric glow. */
  active?: boolean;
  /** Corner radius token. Defaults to `large` (12). */
  radius?: keyof typeof Radii;
  /** Disable the glassmorphic blur even where supported (use solid surface). */
  solid?: boolean;
};

export function GlassCard({
  children,
  elevation = 'low',
  active = false,
  radius = 'large',
  solid = false,
  style,
  ...rest
}: GlassCardProps) {
  const theme = useTheme();

  const surfaceColor =
    elevation === 'high'
      ? theme.backgroundSelected
      : elevation === 'mid'
        ? theme.backgroundElement
        : theme.backgroundElevated;

  const borderColor = active ? theme.borderAccent : theme.border;
  const borderRadius = Radii[radius];

  const baseStyle: ViewStyle = {
    borderRadius,
    borderWidth: 1,
    borderColor,
    overflow: 'hidden',
  };

  const glowStyle: ViewStyle | undefined = active ? theme.shadows.glow : undefined;

  const useGlass = !solid && isLiquidGlassAvailable();

  if (useGlass) {
    return (
      <View style={[glowStyle, style]}>
        <GlassView
          glassEffectStyle="regular"
          tintColor={surfaceColor}
          style={[baseStyle, styles.fill]}
          {...rest}
        >
          {children}
        </GlassView>
      </View>
    );
  }

  return (
    <View
      style={[baseStyle, { backgroundColor: surfaceColor }, glowStyle, style]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
  },
});
