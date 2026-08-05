/**
 * ThemedText - typography component using the Cadence type scale.
 *
 * Maps semantic type names to the TypeScale tokens.
 * Respects theme colors automatically.
 */
import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, type ThemeColor, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextType =
  | 'displayLarge'
  | 'displayMedium'
  | 'headlineLarge'
  | 'headlineMedium'
  | 'headlineSmall'
  | 'bodyLarge'
  | 'bodyMedium'
  | 'bodySmall'
  | 'labelLarge'
  | 'labelMedium'
  | 'labelSmall'
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
    case 'bodyLarge': return styles.bodyLarge;
    case 'bodyMedium': return styles.bodyMedium;
    case 'bodySmall': return styles.bodySmall;
    case 'labelLarge': return styles.labelLarge;
    case 'labelMedium': return styles.labelMedium;
    case 'labelSmall': return styles.labelSmall;
    case 'monoLarge': return styles.monoLarge;
    case 'monoMedium': return styles.monoMedium;
    case 'monoSmall': return styles.monoSmall;

    // Legacy aliases (maps to new scale for backward compat)
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
  bodyLarge: TypeScale.bodyLarge,
  bodyMedium: TypeScale.bodyMedium,
  bodySmall: TypeScale.bodySmall,
  labelLarge: TypeScale.labelLarge,
  labelMedium: TypeScale.labelMedium,
  labelSmall: TypeScale.labelSmall,
  monoLarge: { ...TypeScale.monoLarge, fontFamily: Fonts.mono },
  monoMedium: { ...TypeScale.monoMedium, fontFamily: Fonts.mono },
  monoSmall: { ...TypeScale.monoSmall, fontFamily: Fonts.mono },
});
