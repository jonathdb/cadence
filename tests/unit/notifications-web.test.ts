/**
 * Unit tests for Notification Service on web platform.
 * Verifies graceful degradation (no-op behavior) on unsupported platforms.
 *
 * Requirements: 23.2 (cross-platform graceful degradation)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock react-native Platform as web
vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

// Mock AsyncStorage (should never be called on web)
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock expo-notifications (should never be called on web)
vi.mock('expo-notifications', () => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(),
  SchedulableTriggerInputTypes: {
    TIME_INTERVAL: 'timeInterval',
  },
}));

import * as Notifications from 'expo-notifications';

import {
    cancelNotification,
    getStoredPermissionStatus,
    initNotificationService,
    requestPermission,
    resetNotificationService,
    scheduleTimerNotification,
} from '@/services/notifications';

const mockScheduleNotificationAsync = Notifications.scheduleNotificationAsync as ReturnType<typeof vi.fn>;

describe('Notification Service (Web Platform)', () => {
  beforeEach(() => {
    resetNotificationService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetNotificationService();
  });

  it('always returns denied permission status on web', () => {
    expect(getStoredPermissionStatus()).toBe('denied');
  });

  it('initNotificationService sets status to denied on web', async () => {
    await initNotificationService();
    expect(getStoredPermissionStatus()).toBe('denied');
  });

  it('requestPermission always returns denied on web', async () => {
    await initNotificationService();
    const result = await requestPermission();
    expect(result).toBe('denied');
  });

  it('scheduleTimerNotification always returns null on web', async () => {
    await initNotificationService();
    const result = await scheduleTimerNotification(60, 'Timer Done');
    expect(result).toBeNull();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancelNotification is a no-op on web', async () => {
    await initNotificationService();
    await expect(cancelNotification('some-id')).resolves.toBeUndefined();
  });
});
