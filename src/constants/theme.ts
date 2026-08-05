/**
 * Cadence Design System
 *
 * Dark-first fitness app. Accent: teal/cyan for energy without generic blue.
 * System fonts throughout. Designed for iOS (HIG) and Android (M3) native feel.
 */

import { Platform } from 'react-native';

// ============================================================================
// COLOR PALETTE
// ============================================================================

/**
 * Semantic color tokens for light and dark themes.
 * Dark is primary, light is available.
 */
export const Colors = {
  dark: {
    // Backgrounds
    background: '#0f1114',           // Near-black with slight warmth
    backgroundElevated: '#1a1d21',   // Cards, sheets, modals
    backgroundElement: '#22262b',    // Input fields, secondary surfaces
    backgroundSelected: '#2d3239',   // Active/pressed states
    backgroundSubtle: '#181b1f',     // Subtle section differentiation

    // Text
    text: '#f0f2f5',                 // Primary text (off-white, not pure white)
    textSecondary: '#8b919a',        // Secondary/muted text
    textTertiary: '#5c6370',         // Placeholder, disabled

    // Accent (Teal/Cyan - energetic, athletic)
    accent: '#06b6d4',              // Primary brand accent
    accentMuted: '#0e7490',         // Subtle accent backgrounds
    accentSoft: 'rgba(6, 182, 212, 0.12)',  // Accent tint for backgrounds

    // Semantic colors
    success: '#10b981',             // PRs, completed, positive
    successSoft: 'rgba(16, 185, 129, 0.12)',
    warning: '#f59e0b',             // Caution, pending
    warningSoft: 'rgba(245, 158, 11, 0.12)',
    error: '#ef4444',               // Errors, destructive actions
    errorSoft: 'rgba(239, 68, 68, 0.12)',

    // Borders
    border: '#2d3239',              // Default card/input borders
    borderSubtle: '#22262b',        // Very subtle separators
    borderFocus: '#06b6d4',         // Focus rings

    // Specific UI elements
    tabBarBackground: '#0f1114',
    tabBarBorder: '#1a1d21',
    tabBarActive: '#06b6d4',
    tabBarInactive: '#5c6370',

    // Chat
    chatBubbleUser: '#06b6d4',
    chatBubbleUserText: '#ffffff',
    chatBubbleAssistant: '#1a1d21',
    chatBubbleAssistantText: '#f0f2f5',
    chatBubbleSystem: 'rgba(16, 185, 129, 0.12)',
    chatBubbleSystemText: '#10b981',

    // Timer
    timerBackground: 'rgba(6, 182, 212, 0.08)',
    timerBorder: 'rgba(6, 182, 212, 0.24)',
    timerText: '#06b6d4',

    // PR indicator
    prBackground: 'rgba(245, 158, 11, 0.12)',
    prBorder: 'rgba(245, 158, 11, 0.3)',
    prText: '#f59e0b',
  },

  light: {
    // Backgrounds
    background: '#ffffff',
    backgroundElevated: '#ffffff',
    backgroundElement: '#f4f5f7',
    backgroundSelected: '#e8eaed',
    backgroundSubtle: '#f9fafb',

    // Text
    text: '#111318',
    textSecondary: '#5c6370',
    textTertiary: '#8b919a',

    // Accent
    accent: '#0891b2',
    accentMuted: '#06b6d4',
    accentSoft: 'rgba(8, 145, 178, 0.08)',

    // Semantic colors
    success: '#059669',
    successSoft: 'rgba(5, 150, 105, 0.08)',
    warning: '#d97706',
    warningSoft: 'rgba(217, 119, 6, 0.08)',
    error: '#dc2626',
    errorSoft: 'rgba(220, 38, 38, 0.08)',

    // Borders
    border: '#e2e4e8',
    borderSubtle: '#f0f1f3',
    borderFocus: '#0891b2',

    // Specific UI elements
    tabBarBackground: '#ffffff',
    tabBarBorder: '#e2e4e8',
    tabBarActive: '#0891b2',
    tabBarInactive: '#8b919a',

    // Chat
    chatBubbleUser: '#0891b2',
    chatBubbleUserText: '#ffffff',
    chatBubbleAssistant: '#f4f5f7',
    chatBubbleAssistantText: '#111318',
    chatBubbleSystem: 'rgba(5, 150, 105, 0.08)',
    chatBubbleSystemText: '#059669',

    // Timer
    timerBackground: 'rgba(8, 145, 178, 0.06)',
    timerBorder: 'rgba(8, 145, 178, 0.2)',
    timerText: '#0891b2',

    // PR indicator
    prBackground: 'rgba(217, 119, 6, 0.08)',
    prBorder: 'rgba(217, 119, 6, 0.24)',
    prText: '#d97706',
  },
} as const;

export type ThemeColors = typeof Colors.dark;
export type ThemeColor = keyof ThemeColors;

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export const Fonts = Platform.select({
  ios: {
    sans: 'System',
    mono: 'Menlo',
  },
  android: {
    sans: 'Roboto',
    mono: 'monospace',
  },
  default: {
    sans: 'System',
    mono: 'monospace',
  },
  web: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: '"SF Mono", "Fira Code", "Fira Mono", Menlo, monospace',
  },
})!;

/**
 * Type scale following iOS HIG and Material 3 conventions.
 * Uses system font weight scale (400-800).
 */
export const TypeScale = {
  // Display - large impactful numbers (timer, PR values)
  displayLarge: { fontSize: 48, lineHeight: 56, fontWeight: '700' as const },
  displayMedium: { fontSize: 36, lineHeight: 44, fontWeight: '700' as const },

  // Headlines - screen titles, section headers
  headlineLarge: { fontSize: 28, lineHeight: 36, fontWeight: '700' as const },
  headlineMedium: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const },
  headlineSmall: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },

  // Body - main content
  bodyLarge: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodyMedium: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  bodySmall: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },

  // Labels - buttons, badges, compact UI
  labelLarge: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  labelMedium: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const },
  labelSmall: { fontSize: 11, lineHeight: 14, fontWeight: '500' as const },

  // Mono - data values, timers, stats
  monoLarge: { fontSize: 32, lineHeight: 40, fontWeight: '700' as const },
  monoMedium: { fontSize: 20, lineHeight: 28, fontWeight: '600' as const },
  monoSmall: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const },
} as const;

// ============================================================================
// SPACING
// ============================================================================

/**
 * 4px base grid. All spacing is a multiple of 4.
 */
export const Spacing = {
  /** 2px - hairline gaps */
  half: 2,
  /** 4px - tight internal padding */
  one: 4,
  /** 8px - standard gap between related elements */
  two: 8,
  /** 12px - slightly larger than two, useful for padding */
  twoHalf: 12,
  /** 16px - card internal padding, section gaps */
  three: 16,
  /** 20px */
  threeHalf: 20,
  /** 24px - between cards, larger sections */
  four: 24,
  /** 32px - major section breaks */
  five: 32,
  /** 40px */
  fiveHalf: 40,
  /** 48px - screen-level padding top */
  six: 48,
  /** 64px - large gaps between major page sections */
  seven: 64,
} as const;

// ============================================================================
// BORDER RADII
// ============================================================================

/**
 * Consistent radius scale. One system, no mixing.
 * Cards: large. Buttons/inputs: medium. Badges: full.
 */
export const Radii = {
  /** 6px - subtle rounding (inputs, small elements) */
  small: 6,
  /** 10px - buttons, input fields */
  medium: 10,
  /** 14px - cards, sheets */
  large: 14,
  /** 20px - large cards, modals */
  xl: 20,
  /** 9999px - pills, badges, avatars */
  full: 9999,
} as const;

// ============================================================================
// SHADOWS (dark mode: minimal; light mode: soft)
// ============================================================================

export const Shadows = {
  dark: {
    small: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.3,
      shadowRadius: 2,
      elevation: 2,
    },
    medium: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
  },
  light: {
    small: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 2,
    },
    medium: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 4,
    },
  },
} as const;

// ============================================================================
// TOUCH TARGETS
// ============================================================================

/**
 * Minimum touch target sizes per platform guidelines.
 * iOS HIG: 44pt minimum. Material 3: 48dp minimum.
 */
export const TouchTarget = {
  minimum: Platform.OS === 'ios' ? 44 : 48,
  comfortable: 56,
} as const;

// ============================================================================
// PLATFORM UTILITIES
// ============================================================================

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 600;
