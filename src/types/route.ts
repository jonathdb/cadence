/**
 * Route tracking types for Cadence fitness app (Phase 2).
 * GPS-tracked running/walking routes linked to sessions and program days.
 */

export interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  elevation?: number;
  speed?: number;
}

export interface Route {
  id: string;
  user_id: string;
  session_id?: string;
  program_day_id?: string;
  points: RoutePoint[];
  distance_meters: number;
  duration_seconds: number;
  average_pace_seconds_per_km: number;
  average_speed_kmh: number;
  elevation_gain_meters?: number;
  created_at: string;
}
