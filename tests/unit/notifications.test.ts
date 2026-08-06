/**
 * Unit tests for the Notification Service.
 * Tests permission management and scheduling guard logic.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock react-native Platform and AppState
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

// Mock AsyncStorage with inline functions (vi.mock is hoisted)
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock expo-notifications
vi.mock('expo-notifications', () => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(),
  SchedulableTriggerInputTypes: {
    TIME_INTERVAL: 'timeInterval',
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import {
    cancelNotification,
    getStoredPermissionStatus,
    initNotificationService,
    refreshPermissionStatus,
    requestPermission,
    resetNotificationService,
    scheduleTimerNotification,
} from '@/services/notifications';

// Typed mock references
const mockGetItem = AsyncStorage.getItem as ReturnType<typeof vi.fn>;
const mockSetItem = AsyncStorage.setItem as ReturnType<typeof vi.fn>;
const mockGetPermissionsAsync = Notifications.getPermissionsAsync as ReturnType<typeof vi.fn>;
const mockRequestPermissionsAsync = Notifications.requestPermissionsAsync as ReturnType<typeof vi.fn>;
const mockScheduleNotificationAsync = Notifications.scheduleNotificationAsync as ReturnType<typeof vi.fn>;
const mockCancelScheduledNotificationAsync = Notifications.cancelScheduledNotificationAsync as ReturnType<typeof vi.fn>;

describe('Notification Service', () => {
  beforeEach(() => {
    resetNotificationService();
    vi.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetNotificationService();
  });

  describe('initNotificationService', () => {
    it('initializes with undetermined status when no stored value', async () => {
      mockGetItem.mockResolvedValue(null);
      await initNotificationService();
      expect(getStoredPermissionStatus()).toBe('undetermined');
    });

    it('restores granted status from storage', async () => {
      mockGetItem.mockResolvedValue('granted');
      await initNotificationService();
      expect(getStoredPermissionStatus()).toBe('granted');
    });

    it('restores denied status from storage', async () => {
      mockGetItem.mockResolvedValue('denied');
      await initNotificationService();
      expect(getStoredPermissionStatus()).toBe('denied');
    });

    it('defaults to undetermined for invalid stored values', async () => {
      mockGetItem.mockResolvedValue('invalid-value');
      await initNotificationService();
      expect(getStoredPermissionStatus()).toBe('undetermined');
    });

    it('registers AppState listener for resume re-check (Req 3.5)', async () => {
      const { AppState } = await import('react-native');
      await initNotificationService();
      expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });
  });

  describe('requestPermission (Req 3.1, 3.4)', () => {
    it('returns granted and persists when OS grants permission', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
      mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });

      await initNotificationService();
      const result = await requestPermission();

      expect(result).toBe('granted');
      expect(mockRequestPermissionsAsync).toHaveBeenCalled();
      expect(mockSetItem).toHaveBeenCalledWith(
        '@cadence/notification_permission_status',
        'granted'
      );
    });

    it('returns denied when OS denies permission (Req 3.2)', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
      mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });

      await initNotificationService();
      const result = await requestPermission();

      expect(result).toBe('denied');
      expect(mockSetItem).toHaveBeenCalledWith(
        '@cadence/notification_permission_status',
        'denied'
      );
    });

    it('returns granted without re-prompting when already granted', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });

      await initNotificationService();
      const result = await requestPermission();

      expect(result).toBe('granted');
      expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('returns denied without re-prompting when OS says denied', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'denied' });

      await initNotificationService();
      const result = await requestPermission();

      expect(result).toBe('denied');
      expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    });
  });

  describe('scheduleTimerNotification (Req 3.3)', () => {
    it('never schedules when permission is not granted', async () => {
      mockGetItem.mockResolvedValue('denied');
      await initNotificationService();

      const result = await scheduleTimerNotification(60, 'Rest Complete');

      expect(result).toBeNull();
      expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('never schedules when permission is undetermined', async () => {
      mockGetItem.mockResolvedValue(null);
      await initNotificationService();

      const result = await scheduleTimerNotification(60, 'Rest Complete');

      expect(result).toBeNull();
      expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('schedules notification when permission is granted', async () => {
      mockGetItem.mockResolvedValue('granted');
      mockScheduleNotificationAsync.mockResolvedValue('notif-id-123');
      await initNotificationService();

      const result = await scheduleTimerNotification(60, 'Rest Complete');

      expect(result).toBe('notif-id-123');
      expect(mockScheduleNotificationAsync).toHaveBeenCalledWith({
        content: {
          title: 'Rest Complete',
          body: 'Your timer has finished!',
          sound: true,
        },
        trigger: {
          type: 'timeInterval',
          seconds: 60,
        },
      });
    });

    it('returns null for zero or negative seconds', async () => {
      mockGetItem.mockResolvedValue('granted');
      await initNotificationService();

      expect(await scheduleTimerNotification(0, 'Test')).toBeNull();
      expect(await scheduleTimerNotification(-5, 'Test')).toBeNull();
      expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('returns null and degrades gracefully when scheduling fails', async () => {
      mockGetItem.mockResolvedValue('granted');
      mockScheduleNotificationAsync.mockRejectedValue(new Error('Native error'));
      await initNotificationService();

      const result = await scheduleTimerNotification(60, 'Rest Complete');

      expect(result).toBeNull();
    });
  });

  describe('cancelNotification', () => {
    it('cancels a scheduled notification by id', async () => {
      mockCancelScheduledNotificationAsync.mockResolvedValue(undefined);
      await initNotificationService();

      await cancelNotification('notif-id-123');

      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-id-123');
    });

    it('handles cancellation errors gracefully', async () => {
      mockCancelScheduledNotificationAsync.mockRejectedValue(new Error('Not found'));
      await initNotificationService();

      // Should not throw
      await expect(cancelNotification('bad-id')).resolves.toBeUndefined();
    });
  });

  describe('refreshPermissionStatus (Req 3.5)', () => {
    it('detects revocation when was granted but OS now says denied', async () => {
      mockGetItem.mockResolvedValue('granted');
      await initNotificationService();

      expect(getStoredPermissionStatus()).toBe('granted');

      // OS now says denied (user revoked in settings)
      mockGetPermissionsAsync.mockResolvedValue({ status: 'denied' });
      await refreshPermissionStatus();

      expect(getStoredPermissionStatus()).toBe('denied');
      expect(mockSetItem).toHaveBeenCalledWith(
        '@cadence/notification_permission_status',
        'denied'
      );
    });

    it('detects grant when was denied but OS now says granted', async () => {
      mockGetItem.mockResolvedValue('denied');
      await initNotificationService();

      // User went to settings and granted
      mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
      await refreshPermissionStatus();

      expect(getStoredPermissionStatus()).toBe('granted');
    });

    it('does not update storage when status unchanged', async () => {
      mockGetItem.mockResolvedValue('granted');
      await initNotificationService();

      mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockSetItem.mockClear();

      await refreshPermissionStatus();

      expect(mockSetItem).not.toHaveBeenCalled();
    });

    it('handles errors gracefully without throwing', async () => {
      mockGetItem.mockResolvedValue('granted');
      await initNotificationService();

      mockGetPermissionsAsync.mockRejectedValue(new Error('Permission check failed'));

      await expect(refreshPermissionStatus()).resolves.toBeUndefined();
      // Status remains unchanged
      expect(getStoredPermissionStatus()).toBe('granted');
    });
  });
});
