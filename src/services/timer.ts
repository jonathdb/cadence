/**
 * Timer service for Cadence fitness app.
 * Supports timer types: none, rest, countdown, interval, duration.
 * Uses setInterval for UI countdown and expo-notifications for background alerts.
 */

import type { TimerConfig, TimerType } from '@/types/program';

// --- Types ---

export type TimerPhase = 'idle' | 'work' | 'rest' | 'countdown' | 'completed';

export interface TimerState {
  type: TimerType;
  phase: TimerPhase;
  remaining_seconds: number;
  elapsed_seconds: number;
  current_round: number;
  total_rounds: number;
  is_running: boolean;
}

export interface TimerCompletionResult {
  actual_duration_seconds: number;
  actual_rounds: number;
}

export interface TimerController {
  stop: () => TimerCompletionResult;
  pause: () => void;
  resume: () => void;
  getState: () => TimerState;
}

// --- Pure functions for state initialization and tick ---

/**
 * Creates the initial TimerState from a TimerConfig.
 * Returns null for type 'none' since no timer is needed.
 */
export function initializeTimerState(config: TimerConfig): TimerState | null {
  switch (config.type) {
    case 'none':
      return null;

    case 'rest':
      return {
        type: 'rest',
        phase: 'rest',
        remaining_seconds: config.rest_seconds ?? 0,
        elapsed_seconds: 0,
        current_round: 1,
        total_rounds: 1,
        is_running: false,
      };

    case 'countdown':
      return {
        type: 'countdown',
        phase: 'countdown',
        remaining_seconds: config.duration_seconds ?? 0,
        elapsed_seconds: 0,
        current_round: 1,
        total_rounds: 1,
        is_running: false,
      };

    case 'interval':
      return {
        type: 'interval',
        phase: 'work',
        remaining_seconds: config.work_seconds ?? 0,
        elapsed_seconds: 0,
        current_round: 1,
        total_rounds: config.rounds ?? 1,
        is_running: false,
      };

    case 'duration':
      return {
        type: 'duration',
        phase: 'work',
        remaining_seconds: 0, // count-up, no countdown limit
        elapsed_seconds: 0,
        current_round: 1,
        total_rounds: 1,
        is_running: false,
      };

    default:
      return null;
  }
}

/**
 * Advances the timer state by 1 second.
 * Returns the new state (immutable update).
 * For countdown-style timers, decrements remaining_seconds.
 * For duration timers, increments elapsed_seconds.
 * Handles phase transitions for interval timers (work → rest → next round).
 */
export function tick(state: TimerState, config: TimerConfig): TimerState {
  if (state.phase === 'completed' || state.phase === 'idle') {
    return state;
  }

  const newElapsed = state.elapsed_seconds + 1;

  switch (state.type) {
    case 'rest': {
      const newRemaining = state.remaining_seconds - 1;
      if (newRemaining <= 0) {
        return {
          ...state,
          remaining_seconds: 0,
          elapsed_seconds: newElapsed,
          phase: 'completed',
          is_running: false,
        };
      }
      return {
        ...state,
        remaining_seconds: newRemaining,
        elapsed_seconds: newElapsed,
      };
    }

    case 'countdown': {
      const newRemaining = state.remaining_seconds - 1;
      if (newRemaining <= 0) {
        return {
          ...state,
          remaining_seconds: 0,
          elapsed_seconds: newElapsed,
          phase: 'completed',
          is_running: false,
        };
      }
      return {
        ...state,
        remaining_seconds: newRemaining,
        elapsed_seconds: newElapsed,
      };
    }

    case 'interval': {
      const newRemaining = state.remaining_seconds - 1;

      if (newRemaining <= 0) {
        // Phase transition
        if (state.phase === 'work') {
          // Work phase ended → transition to rest phase
          const restSeconds = config.rest_seconds ?? 0;
          if (restSeconds <= 0) {
            // No rest period, go directly to next round or complete
            if (state.current_round >= state.total_rounds) {
              return {
                ...state,
                remaining_seconds: 0,
                elapsed_seconds: newElapsed,
                phase: 'completed',
                is_running: false,
              };
            }
            // Next round, start work phase
            return {
              ...state,
              phase: 'work',
              remaining_seconds: config.work_seconds ?? 0,
              elapsed_seconds: newElapsed,
              current_round: state.current_round + 1,
            };
          }
          return {
            ...state,
            phase: 'rest',
            remaining_seconds: restSeconds,
            elapsed_seconds: newElapsed,
          };
        } else {
          // Rest phase ended → next round or complete
          if (state.current_round >= state.total_rounds) {
            return {
              ...state,
              remaining_seconds: 0,
              elapsed_seconds: newElapsed,
              phase: 'completed',
              is_running: false,
            };
          }
          // Next round, start work phase
          return {
            ...state,
            phase: 'work',
            remaining_seconds: config.work_seconds ?? 0,
            elapsed_seconds: newElapsed,
            current_round: state.current_round + 1,
          };
        }
      }

      return {
        ...state,
        remaining_seconds: newRemaining,
        elapsed_seconds: newElapsed,
      };
    }

    case 'duration': {
      // Count-up timer: just increment elapsed, no completion condition
      return {
        ...state,
        elapsed_seconds: newElapsed,
      };
    }

    default:
      return state;
  }
}

// --- Notification helpers (optional, graceful degradation) ---

let Notifications: typeof import('expo-notifications') | null = null;

/**
 * Attempt to load expo-notifications. If not installed, notifications
 * will be silently skipped (graceful degradation).
 */
async function getNotifications(): Promise<typeof import('expo-notifications') | null> {
  if (Notifications) return Notifications;
  try {
    Notifications = await import('expo-notifications');
    return Notifications;
  } catch {
    // expo-notifications not available
    return null;
  }
}

/**
 * Schedules a local notification to fire after `seconds` from now.
 * Returns the notification identifier (or null if notifications unavailable).
 */
export async function scheduleTimerNotification(
  seconds: number,
  title: string = 'Timer Complete',
  body: string = 'Your timer has finished!'
): Promise<string | null> {
  const notif = await getNotifications();
  if (!notif || seconds <= 0) return null;

  try {
    const identifier = await notif.scheduleNotificationAsync({
      content: {
        title,
        body,
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
 * Cancels a previously scheduled notification by identifier.
 */
export async function cancelTimerNotification(identifier: string | null): Promise<void> {
  if (!identifier) return;
  const notif = await getNotifications();
  if (!notif) return;

  try {
    await notif.cancelScheduledNotificationAsync(identifier);
  } catch {
    // Ignore cancellation errors
  }
}

// --- Timer controller (setInterval-based) ---

/**
 * Calculates the total duration in seconds for a given TimerConfig.
 * Used to schedule the background notification at timer start.
 * Returns 0 for 'duration' type (no fixed end) and 'none'.
 */
export function calculateTotalSeconds(config: TimerConfig): number {
  switch (config.type) {
    case 'none':
      return 0;
    case 'rest':
      return config.rest_seconds ?? 0;
    case 'countdown':
      return config.duration_seconds ?? 0;
    case 'interval': {
      const workSeconds = config.work_seconds ?? 0;
      const restSeconds = config.rest_seconds ?? 0;
      const rounds = config.rounds ?? 1;
      return (workSeconds + restSeconds) * rounds;
    }
    case 'duration':
      return 0; // No fixed end time
    default:
      return 0;
  }
}

/**
 * Starts a timer based on the given config.
 * Calls onTick every second with the updated state.
 * Calls onComplete when the timer finishes (not for 'duration' type which runs indefinitely).
 * Schedules a background notification for alerting when the app is backgrounded.
 * Returns a TimerController for pausing, resuming, and stopping.
 */
export function startTimer(
  config: TimerConfig,
  onTick: (state: TimerState) => void,
  onComplete: (result: TimerCompletionResult) => void
): TimerController | null {
  const initialState = initializeTimerState(config);
  if (!initialState) return null;

  let state: TimerState = { ...initialState, is_running: true };
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let notificationId: string | null = null;
  let stopped = false;

  // Schedule background notification (fire-and-forget)
  const totalSeconds = calculateTotalSeconds(config);
  if (totalSeconds > 0) {
    scheduleTimerNotification(totalSeconds).then((id) => {
      if (!stopped) {
        notificationId = id;
      } else if (id) {
        // Timer was stopped before notification was scheduled
        cancelTimerNotification(id);
      }
    });
  }

  // Emit initial state
  onTick(state);

  // Start interval
  intervalId = setInterval(() => {
    if (!state.is_running || state.phase === 'completed') {
      return;
    }

    state = tick(state, config);
    onTick(state);

    if (state.phase === 'completed') {
      cleanup();
      onComplete({
        actual_duration_seconds: state.elapsed_seconds,
        actual_rounds: state.current_round,
      });
    }
  }, 1000);

  function cleanup() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  const controller: TimerController = {
    stop: () => {
      stopped = true;
      cleanup();
      // Cancel the scheduled notification since timer was manually stopped
      if (notificationId) {
        cancelTimerNotification(notificationId);
        notificationId = null;
      }
      const result: TimerCompletionResult = {
        actual_duration_seconds: state.elapsed_seconds,
        actual_rounds: state.current_round,
      };
      state = { ...state, is_running: false, phase: 'completed' };
      return result;
    },

    pause: () => {
      state = { ...state, is_running: false };
    },

    resume: () => {
      if (state.phase !== 'completed') {
        state = { ...state, is_running: true };
      }
    },

    getState: () => ({ ...state }),
  };

  return controller;
}
