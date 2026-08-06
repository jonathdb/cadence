/**
 * Unit tests for platform capabilities detection module.
 * Verifies correct capability detection for each platform (iOS, Android, web).
 *
 * Requirements: 23.2, 23.3
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// We need to test different platform values, so we'll mock react-native Platform
// and re-import the module for each test suite.

describe('Platform Capabilities', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  describe('on web platform', () => {
    it('detects all native capabilities as unavailable', async () => {
      vi.doMock('react-native', () => ({
        Platform: { OS: 'web' },
      }));

      const { detectCapabilities } = await import('@/lib/platform-capabilities');
      const caps = detectCapabilities();

      expect(caps.platform).toBe('web');
      expect(caps.isWeb).toBe(true);
      expect(caps.isNative).toBe(false);
      expect(caps.haptics).toBe(false);
      expect(caps.notifications).toBe(false);
      expect(caps.health).toBe(false);
      expect(caps.gps).toBe(false);
      expect(caps.biometrics).toBe(false);
    });

    it('convenience functions return false on web', async () => {
      vi.doMock('react-native', () => ({
        Platform: { OS: 'web' },
      }));

      const {
        supportsHaptics,
        supportsNotifications,
        supportsHealth,
        supportsGps,
        supportsBiometrics,
        resetPlatformCapabilities,
      } = await import('@/lib/platform-capabilities');

      resetPlatformCapabilities();

      expect(supportsHaptics()).toBe(false);
      expect(supportsNotifications()).toBe(false);
      expect(supportsHealth()).toBe(false);
      expect(supportsGps()).toBe(false);
      expect(supportsBiometrics()).toBe(false);
    });
  });

  describe('on iOS platform', () => {
    it('detects all native capabilities as available', async () => {
      vi.doMock('react-native', () => ({
        Platform: { OS: 'ios' },
      }));

      const { detectCapabilities } = await import('@/lib/platform-capabilities');
      const caps = detectCapabilities();

      expect(caps.platform).toBe('ios');
      expect(caps.isWeb).toBe(false);
      expect(caps.isNative).toBe(true);
      expect(caps.haptics).toBe(true);
      expect(caps.notifications).toBe(true);
      expect(caps.health).toBe(true);
      expect(caps.gps).toBe(true);
      expect(caps.biometrics).toBe(true);
    });
  });

  describe('on Android platform', () => {
    it('detects all native capabilities as available', async () => {
      vi.doMock('react-native', () => ({
        Platform: { OS: 'android' },
      }));

      const { detectCapabilities } = await import('@/lib/platform-capabilities');
      const caps = detectCapabilities();

      expect(caps.platform).toBe('android');
      expect(caps.isWeb).toBe(false);
      expect(caps.isNative).toBe(true);
      expect(caps.haptics).toBe(true);
      expect(caps.notifications).toBe(true);
      expect(caps.health).toBe(true);
      expect(caps.gps).toBe(true);
      expect(caps.biometrics).toBe(true);
    });
  });

  describe('getPlatformCapabilities caching', () => {
    it('returns the same object on subsequent calls', async () => {
      vi.doMock('react-native', () => ({
        Platform: { OS: 'ios' },
      }));

      const { getPlatformCapabilities, resetPlatformCapabilities } = await import('@/lib/platform-capabilities');
      resetPlatformCapabilities();

      const first = getPlatformCapabilities();
      const second = getPlatformCapabilities();

      expect(first).toBe(second); // Same object reference
    });

    it('resets cache when resetPlatformCapabilities is called', async () => {
      vi.doMock('react-native', () => ({
        Platform: { OS: 'android' },
      }));

      const { getPlatformCapabilities, resetPlatformCapabilities } = await import('@/lib/platform-capabilities');

      const first = getPlatformCapabilities();
      resetPlatformCapabilities();
      const second = getPlatformCapabilities();

      // Different object references after reset
      expect(first).not.toBe(second);
      // But same values
      expect(first).toEqual(second);
    });
  });

  describe('getCurrentPlatform', () => {
    it('returns web for unknown Platform.OS values', async () => {
      vi.doMock('react-native', () => ({
        Platform: { OS: 'windows' },
      }));

      const { getCurrentPlatform } = await import('@/lib/platform-capabilities');
      expect(getCurrentPlatform()).toBe('web');
    });
  });
});
