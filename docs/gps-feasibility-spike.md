# Background GPS Feasibility Spike

**Date:** 2025-07-18
**Status:** Research complete — recommendation provided
**Validates:** Requirements 31.1, 31.2

## Context

Cadence Phase 2 adds background GPS route tracking for outdoor activities (running, walking, cycling). The app must continue recording GPS data when backgrounded and when the screen is locked. This document compares two viable approaches and recommends one for implementation.

**Key project context:** Cadence already uses an Expo Dev Client (custom native build via `expo prebuild`) because MVP requires native HealthKit and Health Connect integrations. This means we are NOT constrained by Expo Go limitations — both options below are technically feasible.

---

## Option A: expo-location (Expo Managed Background Location)

### How It Works

Uses `expo-location`'s `startLocationUpdatesAsync` paired with `expo-task-manager` to register a background task. The OS delivers location updates to the registered task even when the app is not in the foreground.

```typescript
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

const TASK_NAME = 'BACKGROUND_ROUTE_TRACKING';

TaskManager.defineTask(TASK_NAME, ({ data, error }) => {
  if (error) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  // Store points to local buffer, batch-upload to Supabase
});

await Location.startLocationUpdatesAsync(TASK_NAME, {
  accuracy: Location.Accuracy.BestForNavigation,
  distanceInterval: 5, // meters between updates
  deferredUpdatesInterval: 1000, // ms
  showsBackgroundLocationIndicator: true, // iOS blue bar
  foregroundService: {
    notificationTitle: 'Cadence',
    notificationBody: 'Recording your route...',
  },
});
```

### Pros

- **Included in Expo SDK** — no additional native dependency
- **Simpler setup** — standard Expo config plugin, well-documented
- **No license cost** — fully open source (MIT)
- **Familiar API** — widely used in Expo community, good Stack Overflow coverage
- **Works with EAS Build** — no custom native modules needed beyond what Expo provides

### Cons

- **Battery impact: Medium-High** — continuous GPS polling with no intelligent power management; the OS handles batching but has limited optimization levers
- **Limited accuracy controls** — provides accuracy presets but no sensor fusion, motion detection, or activity recognition
- **iOS background limitations** — Apple may throttle location updates in background; delivery frequency is not guaranteed
- **No built-in motion detection** — cannot pause tracking when user is stationary (standing at traffic light, tying shoes)
- **Manual reconnection handling** — if the OS kills the task, recovery logic is on you
- **No geofencing intelligence** — purely polling-based, no smart pause/resume

### Battery Impact

**Rating: Medium-High**

Continuous GPS at `BestForNavigation` accuracy draws significant power. On a typical 1-hour run:
- iPhone: ~8-12% battery drain from GPS alone
- Android: ~10-15% battery drain (foreground service keeps process alive but GPS is always on)

No built-in optimizations to reduce polling when stationary or in low-movement phases.

### Accuracy

**Rating: Standard GPS (10-20m typical, 3-5m clear sky)**

Uses the device's raw GPS hardware at the requested accuracy level. No additional processing or sensor fusion. Accuracy depends entirely on device hardware, satellite visibility, and environmental factors (urban canyons, tree cover).

### Background Behavior

| Platform | Mechanism | Notes |
|----------|-----------|-------|
| iOS | `UIBackgroundModes: location` | Blue indicator bar shown; Apple may still throttle |
| Android | Foreground Service with notification | Keeps process alive; required for Android 8+ |

---

## Option B: react-native-background-geolocation

### How It Works

A dedicated background location library by Transistor Software that uses platform-native location services with sophisticated power management. It employs motion detection, activity recognition, and adaptive polling to minimize battery usage while maintaining accuracy.

```typescript
import BackgroundGeolocation from 'react-native-background-geolocation';

await BackgroundGeolocation.ready({
  desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_NAVIGATION,
  distanceFilter: 5,
  stopOnTerminate: false,
  startOnBoot: false,
  enableHeadless: true,
  // Intelligent power management
  preventSuspend: true,
  heartbeatInterval: 60,
  // Motion detection
  isMoving: true,
  stopTimeout: 5, // minutes of stillness before pausing
  // Android-specific
  foregroundService: true,
  notification: {
    title: 'Cadence',
    text: 'Recording your route...',
  },
});

BackgroundGeolocation.onLocation((location) => {
  // High-accuracy location with speed, heading, activity type
  // Store to local buffer, batch-upload to Supabase
});

await BackgroundGeolocation.start();
```

### Pros

- **Excellent battery optimization** — motion detection pauses GPS when stationary, accelerometer-based activity recognition adapts polling frequency
- **High accuracy** — sensor fusion combining GPS, accelerometer, gyroscope, and barometer for elevation
- **Proven track record** — used by major fitness and logistics apps, battle-tested over 8+ years
- **Robust background behavior** — handles OS kills, app termination, device reboots with headless mode
- **Geofencing support** — useful for future features (auto-start when leaving home)
- **Detailed telemetry** — speed, heading, activity type, battery level, motion state included with each point
- **Cross-platform consistency** — same API and behavior on iOS and Android

### Cons

- **Paid license for production** — free for development/testing, ~$299/year per app for production use (or one-time enterprise license)
- **Adds native complexity** — requires Dev Client (which we already have), but adds another native dependency to manage
- **Larger dependency footprint** — more native code means longer build times and more potential for version conflicts
- **Steeper learning curve** — more configuration options, more concepts to understand
- **Vendor lock-in** — dependent on Transistor Software for updates and compatibility with new OS versions

### Battery Impact

**Rating: Low-Medium**

Intelligent power management significantly reduces drain:
- Motion detection pauses GPS when user stops moving
- Activity recognition adapts accuracy (walking vs. running vs. driving)
- On a typical 1-hour run: ~3-6% battery drain (roughly half of Option A)
- Stationary periods consume almost zero additional power

### Accuracy

**Rating: High (configurable, sensor fusion)**

Combines GPS with device sensors for improved accuracy:
- Clear sky: 3-5m (same as raw GPS)
- Urban areas: improved via sensor fusion, typically 5-10m
- Elevation: barometer-assisted altitude (where available) instead of GPS-only altitude
- Speed/heading: accelerometer-smoothed, less GPS jitter

### Background Behavior

| Platform | Mechanism | Notes |
|----------|-----------|-------|
| iOS | Significant location change + motion APIs | Intelligent wake from suspend; handles termination |
| Android | Foreground Service + headless task | Survives doze mode; headless JS for terminated state |
| Both | Activity recognition | Adapts behavior to walking/running/cycling/stationary |

---

## Recommendation

### Recommended approach: expo-location (Option A)

**Rationale:**

While `react-native-background-geolocation` offers superior battery optimization and advanced features, **expo-location is the right choice for Cadence** given the following factors:

1. **Good enough for the use case** — Cadence tracks routes during intentional workouts (30-90 minutes). Users actively start and stop tracking. The battery impact of continuous GPS during a single run is acceptable (8-12% for an hour). This is not an all-day tracking app.

2. **No additional cost** — The $299/year license for `react-native-background-geolocation` is significant for a BYOK app with no subscription revenue model. `expo-location` is free and included in the Expo SDK.

3. **Simpler dependency management** — Fewer native dependencies means fewer version conflicts, faster builds, and less maintenance burden. The app already has HealthKit and Health Connect native deps; adding another complex native library increases surface area.

4. **Expo ecosystem alignment** — Staying within the Expo SDK means better compatibility guarantees with Expo updates, EAS Build, and future Expo features. `expo-location` will always be tested and updated alongside the rest of the SDK.

5. **Sufficient accuracy** — Standard GPS accuracy (3-20m depending on conditions) is fine for running route visualization and distance calculation. Cadence is not a turn-by-turn navigation app requiring sub-meter precision.

6. **Simpler App Store review** — Using a standard Expo background location approach is well-understood by Apple/Google reviewers. The justification is straightforward: "fitness app recording outdoor workout routes."

### When to reconsider

Revisit this decision if:
- Users report significant battery drain during typical workout tracking sessions
- Background tracking reliability issues emerge on specific devices/OS versions
- A future feature requires all-day passive tracking (e.g., daily step routes)
- The app adds a subscription model that could absorb the library license cost

---

## Implementation Considerations

### iOS Info.plist Requirements

```xml
<key>UIBackgroundModes</key>
<array>
  <string>location</string>
</array>

<key>NSLocationWhenInUseUsageDescription</key>
<string>Cadence uses your location to record your running and walking routes during workouts.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Cadence needs background location access to continue recording your route when the app is in the background during a workout.</string>
```

These are configured via `app.json` plugins:

```json
[
  "expo-location",
  {
    "locationAlwaysAndWhenInUsePermission": "Cadence needs background location access to continue recording your route when the app is in the background during a workout.",
    "locationWhenInUsePermission": "Cadence uses your location to record your running and walking routes during workouts.",
    "isIosBackgroundLocationEnabled": true,
    "isAndroidBackgroundLocationEnabled": true
  }
]
```

### Android Permissions

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

Android 10+ requires a separate runtime prompt for `ACCESS_BACKGROUND_LOCATION` after granting foreground location. The UX must guide users through this two-step permission flow.

### App Store Review Considerations

**Apple (iOS):**
- Background location usage requires a clear user-facing justification
- The app must show the blue location indicator bar when tracking in background
- Apple reviewers will verify the app genuinely needs "Always" location (for background tracking during active workouts — this is a standard approved use case)
- Include a privacy nutrition label entry for "Precise Location" collected for "App Functionality"

**Google (Android):**
- Background location access requires a prominent disclosure in the app before the permission prompt
- Google Play policy requires a "location access removed" notification flow if the user hasn't used the app in a while
- Foreground service notification must be visible and clearly describe what the app is doing

### User Consent and Privacy

1. **Progressive permission flow** — Request "When In Use" location first. Only prompt for "Always/Background" when the user starts their first outdoor route-tracked workout.
2. **Clear explanation** — Before requesting background permission, show an in-app explanation screen: "To record your route while your phone is in your pocket, Cadence needs background location access."
3. **Tracking indicator** — Always show a visible UI indicator when route tracking is active.
4. **Easy stop** — Provide a prominent "Stop Tracking" button accessible from the lock screen notification (Android) and within the app.
5. **Data minimization** — Only collect GPS data during active workout sessions. Never track outside of explicitly started sessions.
6. **Local buffering** — Store route points locally first, batch-upload to Supabase. If upload fails, retry on next app open. Never lose route data due to network issues.

---

## Summary Table

| Factor | expo-location | react-native-background-geolocation |
|--------|--------------|--------------------------------------|
| Battery (1hr run) | ~8-12% | ~3-6% |
| Accuracy | Standard GPS (3-20m) | Sensor fusion (3-10m) |
| Motion detection | None | Built-in |
| License cost | Free (MIT) | ~$299/year |
| Expo compatibility | Native SDK | Third-party native dep |
| Setup complexity | Low | Medium |
| Background reliability | Good (standard OS mechanisms) | Excellent (headless, reboot-safe) |
| **Recommendation** | **✅ Selected** | Not needed for current scope |
