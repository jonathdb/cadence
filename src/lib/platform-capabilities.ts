/**
 * Centralized platform capability detection for Cadence.
 *
 * Provides runtime detection of native-only features and a React hook
 * (`usePlatformCapabilities`) that components use to conditionally render
 * native-only UI elements.
 *
 * Pattern mirrors the existing guards in:
 * - src/services/haptics.ts (Platform.OS !== 'web' guard)
 * - src/services/notifications.ts (web → no-op)
 * - src/services/health/adapter.ts (getHealthProvider → null on web)
 *
 * Requirements: 23.2, 23.3
 */

import { Platform } from 'react-native';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PlatformType = 'ios' | 'android' | 'web';

/**
 * Represents the availability of each native-only capability on the current platform.
 * `true` means the capability is available and can be used.
 * `false` means it should be hidden/disabled.
 */
export interface PlatformCapabilities {
  /** Haptic feedback (vibration patterns) */
  haptics: boolean;
  /** Local push notifications (expo-notifications) */
  notifications: boolean;
  /** Health data integration (HealthKit / Health Connect) */
  health: boolean;
  /** Background GPS route tracking (expo-location) */
  gps: boolean;
  /** Biometric authentication (Face ID / fingerprint) */
  biometrics: boolean;
  /** The current platform identifier */
  platform: PlatformType;
  /** Whether the current platform is native (iOS or Android) */
  isNative: boolean;
  /** Whether the current platform is web */
  isWeb: boolean;
}

// ─── Platform Detection ──────────────────────────────────────────────────────

/**
 * Returns the current platform as a typed value.
 */
export function getCurrentPlatform(): PlatformType {
  const os = Platform.OS;
  if (os === 'ios') return 'ios';
  if (os === 'android') return 'android';
  return 'web';
}

/**
 * Detect platform capabilities at runtime.
 * This is a synchronous, pure function — safe to call at module load time
 * or within a React render.
 *
 * Capability rules:
 * - haptics: iOS and Android only
 * - notifications: iOS and Android only (web has no expo-notifications support)
 * - health: iOS (HealthKit) and Android (Health Connect) only
 * - gps: iOS and Android only (requires expo-location background tasks)
 * - biometrics: iOS and Android only
 */
export function detectCapabilities(): PlatformCapabilities {
  const platform = getCurrentPlatform();
  const isNative = platform === 'ios' || platform === 'android';
  const isWeb = platform === 'web';

  return {
    haptics: isNative,
    notifications: isNative,
    health: isNative,
    gps: isNative,
    biometrics: isNative,
    platform,
    isNative,
    isWeb,
  };
}

// ─── Singleton (avoids repeated object allocation) ───────────────────────────

let _cached: PlatformCapabilities | null = null;

/**
 * Returns the cached platform capabilities singleton.
 * Since platform doesn't change at runtime, we compute once and reuse.
 */
export function getPlatformCapabilities(): PlatformCapabilities {
  if (!_cached) {
    _cached = detectCapabilities();
  }
  return _cached;
}

// ─── Capability Checks (convenience) ────────────────────────────────────────

/** Returns true if haptic feedback is available on this platform. */
export function supportsHaptics(): boolean {
  return getPlatformCapabilities().haptics;
}

/** Returns true if local notifications are available on this platform. */
export function supportsNotifications(): boolean {
  return getPlatformCapabilities().notifications;
}

/** Returns true if health integration is available on this platform. */
export function supportsHealth(): boolean {
  return getPlatformCapabilities().health;
}

/** Returns true if GPS/location tracking is available on this platform. */
export function supportsGps(): boolean {
  return getPlatformCapabilities().gps;
}

/** Returns true if biometric authentication is available on this platform. */
export function supportsBiometrics(): boolean {
  return getPlatformCapabilities().biometrics;
}

// ─── Reset (for testing) ─────────────────────────────────────────────────────

/**
 * Reset the cached capabilities. For unit testing only.
 */
export function resetPlatformCapabilities(): void {
  _cached = null;
}
