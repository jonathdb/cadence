/**
 * Route Tracking Service for Cadence (Phase 2).
 *
 * Uses expo-location with TaskManager for background GPS recording.
 * Records GPS points during active workouts, computes derived stats
 * (distance, duration, pace, speed, elevation gain), and persists
 * routes to Supabase via PostGIS geography + point_stream JSONB.
 *
 * Requirements: 30.1, 30.2, 30.3, 32.1, 32.2, 32.3
 */

import { RoutePoint } from '@/types/route';
import { supabase } from '@/utils/supabase';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BACKGROUND_ROUTE_TASK = 'BACKGROUND_ROUTE_TRACKING';

// ---------------------------------------------------------------------------
// Module State (in-memory buffer while tracking is active)
// ---------------------------------------------------------------------------

interface TrackingState {
  isTracking: boolean;
  userId: string | null;
  sessionId: string | null;
  programDayId: string | null;
  startedAt: string | null;
  points: RoutePoint[];
}

let trackingState: TrackingState = {
  isTracking: false,
  userId: null,
  sessionId: null,
  programDayId: null,
  startedAt: null,
  points: [],
};

// ---------------------------------------------------------------------------
// Background Task Definition
// ---------------------------------------------------------------------------

TaskManager.defineTask(BACKGROUND_ROUTE_TASK, ({ data, error }) => {
  if (error) {
    console.error('[RouteTracking] Background task error:', error.message);
    return;
  }

  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };

  if (!locations || locations.length === 0) return;

  for (const location of locations) {
    const point: RoutePoint = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      timestamp: new Date(location.timestamp).toISOString(),
      elevation: location.coords.altitude ?? undefined,
      speed: location.coords.speed != null && location.coords.speed >= 0
        ? location.coords.speed
        : undefined,
    };

    trackingState.points.push(point);
  }
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start recording GPS points for a route.
 *
 * Requests foreground/background location permissions, then starts
 * background location updates via expo-location + TaskManager.
 */
export async function startRouteTracking(
  userId: string,
  sessionId?: string,
  programDayId?: string,
): Promise<{ success: boolean; error?: string }> {
  if (trackingState.isTracking) {
    return { success: false, error: 'Route tracking is already active' };
  }

  // Request foreground permission first
  const { status: foregroundStatus } =
    await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    return { success: false, error: 'Foreground location permission denied' };
  }

  // Request background permission
  const { status: backgroundStatus } =
    await Location.requestBackgroundPermissionsAsync();
  if (backgroundStatus !== 'granted') {
    return { success: false, error: 'Background location permission denied' };
  }

  // Reset state
  trackingState = {
    isTracking: true,
    userId,
    sessionId: sessionId ?? null,
    programDayId: programDayId ?? null,
    startedAt: new Date().toISOString(),
    points: [],
  };

  // Start background location updates
  await Location.startLocationUpdatesAsync(BACKGROUND_ROUTE_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 5, // meters between updates
    deferredUpdatesInterval: 1000, // ms
    showsBackgroundLocationIndicator: true, // iOS blue bar
    foregroundService: {
      notificationTitle: 'Cadence',
      notificationBody: 'Recording your route...',
      notificationColor: '#208AEF',
    },
  });

  return { success: true };
}

/**
 * Stop recording, compute derived stats, and save the route to Supabase.
 *
 * Returns the saved route ID on success. Falls back to pace/speed only
 * if full stats (elevation gain) are unavailable.
 */
export async function stopRouteTracking(): Promise<{
  success: boolean;
  routeId?: string;
  error?: string;
}> {
  if (!trackingState.isTracking) {
    return { success: false, error: 'No active route tracking session' };
  }

  // Stop background updates
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_ROUTE_TASK);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_ROUTE_TASK);
  }

  const { userId, sessionId, programDayId, startedAt, points } = trackingState;
  const completedAt = new Date().toISOString();

  // Reset tracking state
  trackingState = {
    isTracking: false,
    userId: null,
    sessionId: null,
    programDayId: null,
    startedAt: null,
    points: [],
  };

  if (!userId || !startedAt) {
    return { success: false, error: 'Invalid tracking state: missing userId or startedAt' };
  }

  if (points.length < 2) {
    // Not enough points to compute a meaningful route
    return { success: false, error: 'Insufficient GPS points recorded (need at least 2)' };
  }

  // Compute derived stats
  const stats = computeRouteStats(points);

  // Save to database
  const routeId = await saveRoute({
    userId,
    sessionId,
    programDayId,
    startedAt,
    completedAt,
    points,
    stats,
  });

  if (!routeId) {
    return { success: false, error: 'Failed to save route to database' };
  }

  return { success: true, routeId };
}

/**
 * Returns the current tracking status: whether active, point count, elapsed time.
 */
export function getRouteTrackingStatus(): {
  isTracking: boolean;
  pointCount: number;
  elapsedSeconds: number;
  currentDistance: number;
} {
  if (!trackingState.isTracking || !trackingState.startedAt) {
    return { isTracking: false, pointCount: 0, elapsedSeconds: 0, currentDistance: 0 };
  }

  const elapsed = Math.floor(
    (Date.now() - new Date(trackingState.startedAt).getTime()) / 1000
  );

  const distance = trackingState.points.length >= 2
    ? computeTotalDistance(trackingState.points)
    : 0;

  return {
    isTracking: true,
    pointCount: trackingState.points.length,
    elapsedSeconds: elapsed,
    currentDistance: distance,
  };
}

// ---------------------------------------------------------------------------
// Stats Computation
// ---------------------------------------------------------------------------

export interface RouteStats {
  distanceMeters: number;
  durationSeconds: number;
  avgPaceSecondsPerKm: number;
  avgSpeedKmh: number;
  elevationGainMeters: number | null;
}

/**
 * Compute derived route statistics from a GPS point array.
 *
 * - Distance: sum of haversine distances between consecutive points
 * - Duration: difference between first and last timestamp
 * - Avg pace: seconds per km
 * - Avg speed: km/h
 * - Elevation gain: sum of positive elevation differences (null if elevation data missing)
 *
 * Falls back to pace/speed only if full stats unavailable (Req 32.3).
 */
export function computeRouteStats(points: RoutePoint[]): RouteStats {
  if (points.length < 2) {
    return {
      distanceMeters: 0,
      durationSeconds: 0,
      avgPaceSecondsPerKm: 0,
      avgSpeedKmh: 0,
      elevationGainMeters: null,
    };
  }

  const distanceMeters = computeTotalDistance(points);

  const firstTimestamp = new Date(points[0].timestamp).getTime();
  const lastTimestamp = new Date(points[points.length - 1].timestamp).getTime();
  const durationSeconds = Math.max(0, Math.floor((lastTimestamp - firstTimestamp) / 1000));

  const distanceKm = distanceMeters / 1000;

  // Avg speed in km/h
  const avgSpeedKmh = durationSeconds > 0
    ? (distanceKm / durationSeconds) * 3600
    : 0;

  // Avg pace in seconds per km
  const avgPaceSecondsPerKm = distanceKm > 0
    ? durationSeconds / distanceKm
    : 0;

  // Elevation gain: sum of positive elevation differences
  const elevationGainMeters = computeElevationGain(points);

  return {
    distanceMeters,
    durationSeconds,
    avgPaceSecondsPerKm,
    avgSpeedKmh,
    elevationGainMeters,
  };
}

/**
 * Compute total distance by summing haversine distances between consecutive points.
 */
export function computeTotalDistance(points: RoutePoint[]): number {
  let totalDistance = 0;

  for (let i = 1; i < points.length; i++) {
    totalDistance += haversineDistance(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude,
    );
  }

  return totalDistance;
}

/**
 * Haversine formula to compute the great-circle distance between two points
 * on the Earth's surface, given lat/lng in decimal degrees.
 *
 * Returns distance in meters.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const EARTH_RADIUS_METERS = 6_371_000;

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Compute total elevation gain (sum of positive elevation deltas).
 * Returns null if no points have elevation data.
 */
export function computeElevationGain(points: RoutePoint[]): number | null {
  const pointsWithElevation = points.filter(
    (p) => p.elevation != null
  );

  if (pointsWithElevation.length < 2) {
    return null;
  }

  let gain = 0;
  for (let i = 1; i < pointsWithElevation.length; i++) {
    const diff = pointsWithElevation[i].elevation! - pointsWithElevation[i - 1].elevation!;
    if (diff > 0) {
      gain += diff;
    }
  }

  return gain;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

interface SaveRouteParams {
  userId: string;
  sessionId: string | null;
  programDayId: string | null;
  startedAt: string;
  completedAt: string;
  points: RoutePoint[];
  stats: RouteStats;
}

/**
 * Format route data for PostGIS and save to the `routes` table.
 *
 * Stores:
 * - `track`: PostGIS geography(LineStringZ, 4326) for spatial queries
 * - `point_stream`: full JSONB array of RoutePoints for client consumption
 * - Derived summary stats as numeric columns
 */
async function saveRoute(params: SaveRouteParams): Promise<string | null> {
  const { userId, sessionId, programDayId, startedAt, completedAt, points, stats } = params;

  // Build WKT LineStringZ for PostGIS geography column
  // Format: LINESTRING Z(lon lat elevation, lon lat elevation, ...)
  const hasElevation = points.some((p) => p.elevation != null);
  const wktCoords = points
    .map((p) => {
      const elev = p.elevation ?? 0;
      return `${p.longitude} ${p.latitude} ${elev}`;
    })
    .join(', ');
  const wkt = `SRID=4326;LINESTRING Z(${wktCoords})`;

  const { data, error } = await supabase
    .from('routes')
    .insert({
      user_id: userId,
      session_id: sessionId,
      program_day_id: programDayId,
      track: hasElevation ? wkt : null, // Only store track if we have valid 3D data
      point_stream: points,
      distance_meters: stats.distanceMeters,
      duration_seconds: stats.durationSeconds,
      avg_pace_seconds_per_km: stats.avgPaceSecondsPerKm,
      avg_speed_kmh: stats.avgSpeedKmh,
      elevation_gain_meters: stats.elevationGainMeters,
      started_at: startedAt,
      completed_at: completedAt,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[RouteTracking] Failed to save route:', error.message);
    return null;
  }

  return data?.id ?? null;
}
