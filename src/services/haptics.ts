/**
 * Haptics service for Cadence fitness app.
 * Provides tactile feedback for key user actions.
 * Gracefully degrades on platforms without haptic support (web).
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Triggers a success haptic pattern when a personal record (PR) is achieved.
 * No-op on web or if haptics are unavailable.
 */
export async function prAchieved(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Silently fail on unsupported platforms
  }
}

/**
 * Triggers a light haptic pattern when a user logs a set.
 * No-op on web or if haptics are unavailable.
 */
export async function setLogged(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Silently fail on unsupported platforms
  }
}

/**
 * Triggers a warning haptic pattern when a user deletes a set via swipe.
 * No-op on web or if haptics are unavailable.
 */
export async function setDeleted(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Silently fail on unsupported platforms
  }
}
