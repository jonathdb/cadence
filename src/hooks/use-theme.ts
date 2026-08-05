/**
 * Theme hook - returns the active color tokens based on system preference.
 * Dark mode is the primary/default experience.
 */

import { Colors, Shadows, type ThemeColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface Theme extends ThemeColors {
  mode: 'light' | 'dark';
  shadows: typeof Shadows.dark;
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  // Default to dark if unspecified (dark-first design)
  const mode = scheme === 'light' ? 'light' : 'dark';

  return {
    ...Colors[mode],
    mode,
    shadows: Shadows[mode],
  };
}
