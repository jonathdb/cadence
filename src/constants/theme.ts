/**
 * Cadence Design System — "Kinetic Obsidian"
 *
 * High-performance biometric dark aesthetic for serious athletes and AI-driven
 * workout tracking. Deep obsidian foundations, glassmorphic depth tiers,
 * luminous electric-cyan accents, and emerald feedback cues.
 *
 * Typography: Plus Jakarta Sans (loaded at runtime; system fallback).
 * Dark is the primary/design experience; light remains functional.
 */

import { Platform } from 'react-native';

// ============================================================================
// COLOR PALETTE
// ============================================================================

/**
 * Semantic color tokens for light and dark themes.
 * Dark is primary, light is available.
 *
 * Kinetic Obsidian mapping (dark):
 * - accent            → electric cyan #00f2fe (Stitch `primary-container`)
 * - onAccent          → near-black cyan-ink #002022 (Stitch `on-primary-fixed`)
 * - secondary/success → emerald #10b981 / #4edea3
 * - tertiary          → sky #89ceff
 */
export const Colors = {
  dark: {
    // Backgrounds — obsidian canvas ascending through glass container tiers
    background: '#10141a',           // surface — main canvas
    backgroundCanvas: '#0a0e14',     // surface-container-lowest — deepest base
    backgroundElevated: '#181c22',   // surface-container-low — cards, sheets
    backgroundElement: '#1c2026',    // surface-container — interactive rows
    backgroundSelected: '#262a31',   // surface-container-high — active/pressed
    backgroundSubtle: '#181c22',     // subtle section differentiation
    backgroundHighest: '#31353c',    // surface-container-highest — top tier

    // Text
    text: '#dfe2eb',                 // on-surface — primary (off-white)
    textSecondary: '#b9cacb',        // on-surface-variant — secondary/muted
    textTertiary: '#849495',         // outline — placeholder, disabled

    // Accent (Electric cyan — luminous, athletic)
    accent: '#00f2fe',              // primary-container — primary brand accent
    accentText: '#002022',          // ink color for text/icons on accent fills
    accentMuted: '#00696f',         // inverse-primary — subtle accent
    accentSoft: 'rgba(0, 242, 254, 0.12)',  // accent tint background
    accentGlow: 'rgba(0, 242, 254, 0.4)',   // glow/shadow color

    // Semantic colors
    success: '#4edea3',             // secondary — completed, confirmed sets
    successStrong: '#10b981',       // emerald — high-emphasis success
    successSoft: 'rgba(16, 185, 129, 0.15)',
    warning: '#f59e0b',             // amber — caution, deload
    warningSoft: 'rgba(245, 158, 11, 0.14)',
    error: '#ffb4ab',               // error — errors, destructive text
    errorStrong: '#ef4444',
    errorSoft: 'rgba(239, 68, 68, 0.12)',
    tertiary: '#89ceff',            // tertiary-fixed-dim — structural/recovery

    // Borders — hairline strokes for glass structure
    border: 'rgba(255, 255, 255, 0.08)',      // default card/input border
    borderStrong: 'rgba(255, 255, 255, 0.12)', // elevated inner border
    borderSubtle: 'rgba(255, 255, 255, 0.05)', // very subtle separators
    borderFocus: '#00f2fe',                    // focus rings
    borderAccent: 'rgba(0, 242, 254, 0.6)',    // active/focused card border

    // Specific UI elements
    tabBarBackground: 'rgba(24, 28, 34, 0.9)',
    tabBarBorder: 'rgba(255, 255, 255, 0.1)',
    tabBarActive: '#00f2fe',
    tabBarInactive: '#849495',

    // Chat
    chatBubbleUser: '#262a31',
    chatBubbleUserText: '#dfe2eb',
    chatBubbleAssistant: '#1c2026',
    chatBubbleAssistantText: '#dfe2eb',
    chatBubbleSystem: 'rgba(16, 185, 129, 0.15)',
    chatBubbleSystemText: '#4edea3',

    // Timer
    timerBackground: 'rgba(0, 242, 254, 0.08)',
    timerBorder: 'rgba(0, 242, 254, 0.24)',
    timerText: '#00f2fe',

    // PR indicator
    prBackground: 'rgba(245, 158, 11, 0.14)',
    prBorder: 'rgba(245, 158, 11, 0.3)',
    prText: '#f59e0b',
  },

  light: {
    // Backgrounds
    background: '#ffffff',
    backgroundCanvas: '#f9fafb',
    backgroundElevated: '#ffffff',
    backgroundElement: '#f4f5f7',
    backgroundSelected: '#e8eaed',
    backgroundSubtle: '#f9fafb',
    backgroundHighest: '#e2e4e8',

    // Text
    text: '#111318',
    textSecondary: '#5c6370',
    textTertiary: '#8b919a',

    // Accent
    accent: '#0891b2',
    accentText: '#ffffff',
    accentMuted: '#06b6d4',
    accentSoft: 'rgba(8, 145, 178, 0.08)',
    accentGlow: 'rgba(8, 145, 178, 0.25)',

    // Semantic colors
    success: '#059669',
    successStrong: '#047857',
    successSoft: 'rgba(5, 150, 105, 0.08)',
    warning: '#d97706',
    warningSoft: 'rgba(217, 119, 6, 0.08)',
    error: '#dc2626',
    errorStrong: '#dc2626',
    errorSoft: 'rgba(220, 38, 38, 0.08)',
    tertiary: '#0284c7',

    // Borders
    border: '#e2e4e8',
    borderStrong: '#d4d7dc',
    borderSubtle: '#f0f1f3',
    borderFocus: '#0891b2',
    borderAccent: 'rgba(8, 145, 178, 0.6)',

    // Specific UI elements
    tabBarBackground: 'rgba(255, 255, 255, 0.92)',
    tabBarBorder: '#e2e4e8',
    tabBarActive: '#0891b2',
    tabBarInactive: '#8b919a',

    // Chat
    chatBubbleUser: '#e8eaed',
    chatBubbleUserText: '#111318',
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

/** Plus Jakarta Sans family names registered via useFonts (see _layout.tsx). */
export const FontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

const systemMono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  web: '"SF Mono", "Fira Code", Menlo, monospace',
  default: 'monospace',
})!;

export const Fonts = {
  sans: FontFamily.regular,
  semibold: FontFamily.semibold,
  bold: FontFamily.bold,
  extrabold: FontFamily.extrabold,
  // Data/telemetry readouts use the extrabold Jakarta face for glanceability.
  mono: FontFamily.extrabold,
  systemMono,
};

/**
 * Type scale — Kinetic Obsidian (Plus Jakarta Sans).
 * Values mirror the Stitch design tokens. Each entry carries its font family
 * so weights render correctly with runtime-loaded fonts.
 */
export const TypeScale = {
  // Display — hero headers
  displayLarge: { fontFamily: FontFamily.extrabold, fontSize: 48, lineHeight: 54, fontWeight: '800' as const, letterSpacing: -1.4 },
  displayMedium: { fontFamily: FontFamily.bold, fontSize: 36, lineHeight: 44, fontWeight: '700' as const, letterSpacing: -0.7 },

  // Headlines — screen titles, section headers
  headlineLarge: { fontFamily: FontFamily.bold, fontSize: 32, lineHeight: 40, fontWeight: '700' as const, letterSpacing: -0.6 },
  headlineMedium: { fontFamily: FontFamily.bold, fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.3 },
  headlineSmall: { fontFamily: FontFamily.semibold, fontSize: 18, lineHeight: 24, fontWeight: '600' as const },

  // Titles
  titleMedium: { fontFamily: FontFamily.semibold, fontSize: 16, lineHeight: 22, fontWeight: '600' as const },

  // Body — main content
  bodyLarge: { fontFamily: FontFamily.regular, fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodyMedium: { fontFamily: FontFamily.regular, fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  bodySmall: { fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, fontWeight: '400' as const },

  // Labels — buttons, badges, compact UI
  labelLarge: { fontFamily: FontFamily.semibold, fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  labelMedium: { fontFamily: FontFamily.semibold, fontSize: 12, lineHeight: 16, fontWeight: '600' as const },
  labelSmall: { fontFamily: FontFamily.semibold, fontSize: 12, lineHeight: 16, fontWeight: '600' as const },
  /** Uppercase overline: "ACCOUNT", "AI PLAN", "SESSION" */
  labelCaps: { fontFamily: FontFamily.bold, fontSize: 11, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 0.88, textTransform: 'uppercase' as const },

  // Data / telemetry — large numeric readouts
  dataMetric: { fontFamily: FontFamily.extrabold, fontSize: 28, lineHeight: 32, fontWeight: '800' as const, letterSpacing: -0.56 },
  monoLarge: { fontFamily: FontFamily.extrabold, fontSize: 32, lineHeight: 40, fontWeight: '800' as const, letterSpacing: -0.6 },
  monoMedium: { fontFamily: FontFamily.bold, fontSize: 20, lineHeight: 28, fontWeight: '700' as const },
  monoSmall: { fontFamily: FontFamily.semibold, fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
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
 * Kinetic Obsidian roundedness — sleek athletic hardware aesthetic.
 * Cards: large/xl. Inputs & rows: medium. Badges/pills: full.
 */
export const Radii = {
  /** 4px - subtle rounding */
  small: 4,
  /** 8px - buttons, input fields, list rows */
  medium: 8,
  /** 12px - cards */
  large: 12,
  /** 16px - large cards, hero modules */
  xl: 16,
  /** 24px - large hero modules */
  xxl: 24,
  /** 9999px - pills, badges, avatars, floating dock */
  full: 9999,
} as const;

// ============================================================================
// SHADOWS & GLOW (dark mode: luminous glow; light mode: soft)
// ============================================================================

export const Shadows = {
  dark: {
    small: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 6,
      elevation: 3,
    },
    medium: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.45,
      shadowRadius: 16,
      elevation: 8,
    },
    /** Elevated floating dock */
    dock: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.6,
      shadowRadius: 40,
      elevation: 16,
    },
    /** Luminous cyan glow for active/primary elements */
    glow: {
      shadowColor: '#00f2fe',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 16,
      elevation: 6,
    },
    /** Softer cyan glow for CTA buttons */
    glowSoft: {
      shadowColor: '#00f2fe',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 5,
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
    dock: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
      elevation: 8,
    },
    glow: {
      shadowColor: '#0891b2',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 3,
    },
    glowSoft: {
      shadowColor: '#0891b2',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
      elevation: 3,
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

/**
 * Bottom padding a scroll view should reserve so its content clears the
 * floating tab dock (dock height + margin). Add safe-area inset on top of this.
 */
export const TabBarClearance = 96;
