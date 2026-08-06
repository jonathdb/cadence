/**
 * Notification Service for Cadence fitness app.
 *
 * Manages notification permissions and scheduling for timer alerts.
 * Implements the NotificationService interface from the design document.
 *
 * Permission flow:
 * 1. On first timer start → check stored status
 * 2. If `undetermined` → request OS permission
 * 3. If `denied` → fall back to in-app visual + audio alerts
 * 4. If `granted` → persist status, schedule background notification
 * 5. On app resume → re-check OS status (user may revoke in settings)
 *
 * Platform behavior:
 * - iOS/Android: Full notification scheduling via expo-notifications
 * - Web: No-op for all notification operations (graceful degradation)
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface NotificationService {
  requestPermission(): Promise<PermissionStatus>;
  getStoredPermissionStatus(): PermissionStatus;
  refreshPermissionStatus(): Promise<void>;
  scheduleTimerNotification(seconds: number, title: string): Promise<string | null>;
  cancelNotification(id: string): Promise<void>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PERMISSION_STORAGE_KEY = '@cadence/notification_permission_status';

// ─── Lazy-loaded expo-notifications module ───────────────────────────────────

let Notifications: typeof import('expo-notifications') | null = null;

/**
 * Attempt to load expo-notifications dynamically.
 * Returns null on web or if the module is not available.
 */
async function getNotificationsModule(): Promise<typeof import('expo-notifications') | null> {
  if (Platform.OS === 'web') return null;
  if (Notifications) return Notifications;

  try {
    Notifications = await import('expo-notifications');
    return Notifications;
  } catch {
    // expo-notifications not available (graceful degradation)
    return null;
  }
}

// ─── Internal state ──────────────────────────────────────────────────────────

let cachedPermissionStatus: PermissionStatus = 'undetermined';
let initialized = false;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Load the stored permission status from AsyncStorage.
 * Must be called before using the service (typically at app startup).
 */
export async function initNotificationService(): Promise<void> {
  if (initialized) return;

  if (Platform.OS === 'web') {
    cachedPermissionStatus = 'denied';
    initialized = true;
    return;
  }

  try {
    const stored = await AsyncStorage.getItem(PERMISSION_STORAGE_KEY);
    if (stored === 'granted' || stored === 'denied') {
      cachedPermissionStatus = stored;
    } else {
      cachedPermissionStatus = 'undetermined';
    }
  } catch {
    cachedPermissionStatus = 'undetermined';
  }

  // Set up app state listener for re-checking permission on resume (Req 3.5)
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        await refreshPermissionStatus();
      }
    });
  }

  initialized = true;
}

// ─── Permission Management ───────────────────────────────────────────────────

/**
 * Get the currently stored permission status without hitting the OS.
 * Returns 'undetermined' if not yet initialized.
 */
export function getStoredPermissionStatus(): PermissionStatus {
  if (Platform.OS === 'web') return 'denied';
  return cachedPermissionStatus;
}

/**
 * Request notification permission from the OS.
 * - On first call (undetermined): prompts the user
 * - If already granted/denied: returns the stored value without re-prompting
 * - Persists granted status locally (Req 3.4)
 * - On web: always returns 'denied' (no-op)
 *
 * Requirements: 3.1, 3.4
 */
export async function requestPermission(): Promise<PermissionStatus> {
  if (Platform.OS === 'web') return 'denied';

  const notif = await getNotificationsModule();
  if (!notif) return 'denied';

  try {
    // First check existing permission without prompting
    const { status: existingStatus } = await notif.getPermissionsAsync();

    if (existingStatus === 'granted') {
      await persistPermissionStatus('granted');
      return 'granted';
    }

    // Only prompt if we haven't been denied before (undetermined state)
    // On iOS, once denied, the OS won't show the prompt again
    if (existingStatus === 'undetermined') {
      const { status } = await notif.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowSound: true,
          allowBadge: false,
        },
      });

      const result: PermissionStatus = status === 'granted' ? 'granted' : 'denied';
      await persistPermissionStatus(result);
      return result;
    }

    // Already denied by the OS
    await persistPermissionStatus('denied');
    return 'denied';
  } catch {
    // If permission check fails, assume denied
    return 'denied';
  }
}

/**
 * Re-check the current OS permission status and update stored status
 * if the user has revoked permission via system settings.
 *
 * This is called automatically on app resume (Req 3.5).
 */
export async function refreshPermissionStatus(): Promise<void> {
  if (Platform.OS === 'web') return;

  const notif = await getNotificationsModule();
  if (!notif) return;

  try {
    const { status } = await notif.getPermissionsAsync();
    const newStatus: PermissionStatus =
      status === 'granted' ? 'granted' :
      status === 'undetermined' ? 'undetermined' : 'denied';

    // Detect revocation: was granted, now isn't
    if (cachedPermissionStatus === 'granted' && newStatus !== 'granted') {
      await persistPermissionStatus(newStatus);
    } else if (cachedPermissionStatus !== newStatus) {
      // Also sync other transitions (e.g., user granted in settings)
      await persistPermissionStatus(newStatus);
    }
  } catch {
    // Silently fail — keep current cached status
  }
}

// ─── Notification Scheduling ─────────────────────────────────────────────────

/**
 * Schedule a timer notification to fire after the given number of seconds.
 * Returns the notification identifier, or null if:
 * - Permission is not granted (Req 3.3)
 * - Platform is web
 * - expo-notifications is unavailable
 * - seconds <= 0
 *
 * IMPORTANT: Never schedules background notifications when permission
 * is not 'granted' (Req 3.3).
 */
export async function scheduleTimerNotification(
  seconds: number,
  title: string = 'Timer Complete'
): Promise<string | null> {
  // Never schedule when permission not granted (Req 3.3)
  if (cachedPermissionStatus !== 'granted') return null;
  if (Platform.OS === 'web') return null;
  if (seconds <= 0) return null;

  const notif = await getNotificationsModule();
  if (!notif) return null;

  try {
    const identifier = await notif.scheduleNotificationAsync({
      content: {
        title,
        body: 'Your timer has finished!',
        sound: true,
      },
      trigger: {
        type: notif.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
      },
    });
    return identifier;
  } catch {
    // Notification scheduling failed, degrade gracefully
    return null;
  }
}

/**
 * Cancel a previously scheduled notification by its identifier.
 */
export async function cancelNotification(id: string): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!id) return;

  const notif = await getNotificationsModule();
  if (!notif) return;

  try {
    await notif.cancelScheduledNotificationAsync(id);
  } catch {
    // Ignore cancellation errors
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Persist the permission status both in memory and to AsyncStorage.
 */
async function persistPermissionStatus(status: PermissionStatus): Promise<void> {
  cachedPermissionStatus = status;
  try {
    await AsyncStorage.setItem(PERMISSION_STORAGE_KEY, status);
  } catch {
    // Storage write failure is non-critical
  }
}

// ─── Cleanup (for testing) ───────────────────────────────────────────────────

/**
 * Reset the notification service state. Used for testing purposes.
 */
export function resetNotificationService(): void {
  cachedPermissionStatus = 'undetermined';
  initialized = false;
  Notifications = null;
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}

/**
 * Get the full NotificationService interface object.
 * Convenience wrapper for consumers that prefer an object API.
 */
export function getNotificationService(): NotificationService {
  return {
    requestPermission,
    getStoredPermissionStatus,
    refreshPermissionStatus,
    scheduleTimerNotification,
    cancelNotification,
  };
}
