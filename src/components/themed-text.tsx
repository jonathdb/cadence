/**
 * ThemedText - typography component using the Cadence "Kinetic Obsidian" type scale.
 *
 * Maps semantic type names to the TypeScale tokens (Plus Jakarta Sans).
 * Respects theme colors automatically.
 */
import { StyleSheet, Text, type TextProps } from 'react-native';

import { type ThemeColor, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextType =
  // Display / hero
  | 'displayLarge'
  | 'displayMedium'
  // Headlines
  | 'headlineLarge'
  | 'headlineMedium'
  | 'headlineSmall'
  // Titles
  | 'titleMedium'
  // Body
  | 'bodyLarge'
  | 'bodyMedium'
  | 'bodySmall'
  // Labels
  | 'labelLarge'
  | 'labelMedium'
  | 'labelSmall'
  | 'labelCaps'
  // Data / telemetry
  | 'dataMetric'
  | 'monoLarge'
  | 'monoMedium'
  | 'monoSmall'
  // Legacy aliases for backward compat
  | 'default'
  | 'title'
  | 'subtitle'
  | 'small'
  | 'smallBold'
  | 'link'
  | 'linkPrimary';

export type ThemedTextProps = TextProps & {
  type?: ThemedTextType;
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  const color = themeColor ? theme[themeColor] : undefined;
  const resolvedStyle = getStyleForType(type, theme.accent);

  return (
    <Text
      style={[
        { color: color ?? theme.text },
        resolvedStyle,
        style,
      ]}
      {...rest}
    />
  );
}

function getStyleForType(type: ThemedTextType, accentColor: string) {
  switch (type) {
    // New type scale
    case 'displayLarge': return styles.displayLarge;
    case 'displayMedium': return styles.displayMedium;
    case 'headlineLarge': return styles.headlineLarge;
    case 'headlineMedium': return styles.headlineMedium;
    case 'headlineSmall': return styles.headlineSmall;
    case 'titleMedium': return styles.titleMedium;
    case 'bodyLarge': return styles.bodyLarge;
    case 'bodyMedium': return styles.bodyMedium;
    case 'bodySmall': return styles.bodySmall;
    case 'labelLarge': return styles.labelLarge;
    case 'labelMedium': return styles.labelMedium;
    case 'labelSmall': return styles.labelSmall;
    case 'labelCaps': return styles.labelCaps;
    case 'dataMetric': return styles.dataMetric;
    case 'monoLarge': return styles.monoLarge;
    case 'monoMedium': return styles.monoMedium;
    case 'monoSmall': return styles.monoSmall;

    // Legacy aliases (map to new scale for backward compat)
    case 'title': return styles.headlineLarge;
    case 'subtitle': return styles.headlineMedium;
    case 'default': return styles.bodyLarge;
    case 'small': return styles.bodyMedium;
    case 'smallBold': return styles.labelLarge;
    case 'link': return styles.bodyMedium;
    case 'linkPrimary': return [styles.bodyMedium, { color: accentColor }];
    default: return styles.bodyLarge;
  }
}

const styles = StyleSheet.create({
  displayLarge: TypeScale.displayLarge,
  displayMedium: TypeScale.displayMedium,
  headlineLarge: TypeScale.headlineLarge,
  headlineMedium: TypeScale.headlineMedium,
  headlineSmall: TypeScale.headlineSmall,
  titleMedium: TypeScale.titleMedium,
  bodyLarge: TypeScale.bodyLarge,
  bodyMedium: TypeScale.bodyMedium,
  bodySmall: TypeScale.bodySmall,
  labelLarge: TypeScale.labelLarge,
  labelMedium: TypeScale.labelMedium,
  labelSmall: TypeScale.labelSmall,
  labelCaps: TypeScale.labelCaps,
  dataMetric: TypeScale.dataMetric,
  monoLarge: TypeScale.monoLarge,
  monoMedium: TypeScale.monoMedium,
  monoSmall: TypeScale.monoSmall,
});
