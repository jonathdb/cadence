# Timer Background Notification Test Plan

## Overview

This test plan validates that timer completion alerts fire correctly when the Cadence app is backgrounded or the screen is locked, on both iOS and Android physical devices.

**Validates: Requirements 19.1, 19.2**

- 19.1: WHEN a timer reaches zero and the app is backgrounded or the screen is locked, THE Cadence_App SHALL deliver a completion alert with sound using scheduled local notifications
- 19.2: THE Cadence_App SHALL NOT require background GPS capabilities or continuous background execution for timer alerts

## Prerequisites

- Physical iOS device (iPhone) running iOS 16+
- Physical Android device running Android 13+
- Expo Dev Client build installed on both devices (not Expo Go — required for native notification support)
- Notification permissions granted to the Cadence app on both platforms
- Device volume turned up (to verify sound)
- Do Not Disturb / Focus mode disabled

## Implementation Reference

The timer notification system is implemented in `src/services/timer.ts`:

- `scheduleTimerNotification(seconds, title, body)` — Schedules a local notification via `expo-notifications` `scheduleNotificationAsync` with:
  - `content.sound: true`
  - `trigger.type: TIME_INTERVAL`
  - `trigger.seconds: <countdown duration>`
- `cancelTimerNotification(identifier)` — Cancels a previously scheduled notification
- `startTimer(config, onTick, onComplete)` — On start, calculates total seconds and schedules the background notification
- `controller.stop()` — On manual stop, cancels the scheduled notification

## Test Scenarios

### Scenario A: App Backgrounded — Notification Should Fire

**Steps:**
1. Open the Cadence app
2. Navigate to a session with a timed exercise (e.g., rest timer of 30 seconds)
3. Start the timer
4. Immediately press the Home button to background the app
5. Wait for the timer duration to elapse

**Expected Results:**
- [ ] A notification appears in the notification center / lock screen
- [ ] The notification title reads "Timer Complete"
- [ ] The notification body reads "Your timer has finished!"
- [ ] A notification sound plays
- [ ] The notification arrives within ±2 seconds of the expected completion time

### Scenario B: Screen Locked — Notification Should Fire with Sound

**Steps:**
1. Open the Cadence app
2. Start a timer (e.g., countdown of 30 seconds)
3. Immediately lock the screen (press power button)
4. Wait for the timer duration to elapse

**Expected Results:**
- [ ] The notification sound plays while the screen is locked
- [ ] The notification appears on the lock screen
- [ ] Notification content matches the expected title and body
- [ ] The notification arrives within ±2 seconds of the expected completion time

### Scenario C: Timer Manually Stopped — Notification Should NOT Fire

**Steps:**
1. Open the Cadence app
2. Start a timer (e.g., countdown of 60 seconds)
3. Background the app or lock the screen
4. Bring the app back to the foreground within 10 seconds
5. Manually stop the timer

**Expected Results:**
- [ ] No notification fires after the original timer duration elapses
- [ ] The scheduled notification was successfully cancelled

### Scenario D: App Force-Killed — Notification Should Still Fire

**Steps:**
1. Open the Cadence app
2. Start a timer (e.g., countdown of 30 seconds)
3. Immediately force-kill the app (swipe away from app switcher)
4. Wait for the timer duration to elapse

**Expected Results:**
- [ ] The notification still fires at the correct time (scheduled notifications persist in the OS notification system even after app termination)
- [ ] Sound plays as expected
- [ ] This works because `scheduleNotificationAsync` registers the notification with the OS, not with the app process

### Scenario E: Interval Timer — Multiple Phases

**Steps:**
1. Configure an interval timer (e.g., 20s work / 10s rest × 3 rounds = 90s total)
2. Start the timer
3. Background the app immediately
4. Wait for the full interval duration to elapse

**Expected Results:**
- [ ] A single notification fires when the entire interval sequence completes (after 90s total)
- [ ] No intermediate notifications for phase transitions (work → rest or rest → next round)
- [ ] Sound plays as expected

**Note:** The current implementation schedules one notification at the total calculated duration. Phase transitions are only audible/visible when the app is in the foreground.

### Scenario F: Duration Timer — No Notification Expected

**Steps:**
1. Start a duration-type timer (count-up, no fixed end)
2. Background the app

**Expected Results:**
- [ ] No notification is scheduled (duration timers have no fixed end time)
- [ ] The timer continues counting up when the app returns to the foreground

## Platform-Specific Notes

### iOS
- Notifications require explicit user permission (`requestPermissionsAsync`)
- iOS may delay notifications slightly if the device is in Low Power Mode
- Critical alerts (which bypass Do Not Disturb) are not used — standard alert notifications are used
- The notification sound uses the default system sound

### Android
- Notifications require the `POST_NOTIFICATIONS` permission (Android 13+)
- Exact alarm scheduling may require `SCHEDULE_EXACT_ALARM` permission on Android 12+
- Battery optimization (Doze mode) may delay notifications if the device has been idle for extended periods — this is an OS-level limitation
- Some OEMs (Xiaomi, Huawei, Samsung) have aggressive background process killing; the scheduled notification should still fire since it's registered with the AlarmManager, but behaviour may vary

## Known Limitations

1. **No intermediate phase notifications**: For interval timers, only the final completion fires a notification. Work/rest phase transitions are only visible in-app.
2. **Single notification per timer**: Only one notification is scheduled per timer start. If an interval timer has multiple rounds, they all resolve to a single total-duration notification.
3. **Graceful degradation**: If `expo-notifications` fails to load or schedule, the timer still functions for in-app use but no background alert fires.
4. **Timing precision**: The OS notification system provides "best effort" timing. Expect ±1-2 seconds variance.
5. **No background execution required**: The implementation uses scheduled local notifications (registered with the OS at timer start), satisfying Requirement 19.2 — no continuous background execution or background GPS is needed.

## Code Verification Checklist

Based on review of `src/services/timer.ts`:

- [x] `scheduleTimerNotification` uses `scheduleNotificationAsync` with `TIME_INTERVAL` trigger
- [x] Notification content includes `sound: true`
- [x] `startTimer` calculates `totalSeconds` from config and schedules notification on start
- [x] `controller.stop()` calls `cancelTimerNotification` to cancel pending notifications
- [x] Duration-type timers (`totalSeconds === 0`) do not schedule notifications
- [x] If scheduling fails, the timer degrades gracefully (no crash)
- [x] Race condition handled: if timer is stopped before async schedule completes, the notification is cancelled in the `.then()` callback
