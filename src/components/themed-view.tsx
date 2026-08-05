/**
 * ThemedView - view with automatic background color from the active theme.
 */
import { View, type ViewProps } from 'react-native';

import { type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  /** Which theme color token to use for background. Default: 'background' */
  themeBackground?: ThemeColor;
};

export function ThemedView({ style, themeBackground, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();

  return (
    <View
      style={[{ backgroundColor: theme[themeBackground ?? 'background'] }, style]}
      {...otherProps}
    />
  );
}
