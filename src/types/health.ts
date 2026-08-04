/**
 * Health data types for Cadence fitness app.
 * Supports HealthKit (iOS) and Health Connect (Android) data import and normalization.
 */

export type HealthProvider = 'apple_healthkit' | 'health_connect';

export type HealthDataType = 'workout' | 'heart_rate' | 'sleep' | 'activity' | 'body_metrics';

export type SyncStatus = 'synced' | 'pending';

/** Raw ingestion layer — provider data stored verbatim */
export interface RawHealthRecord {
  id: string;
  user_id: string;
  provider: HealthProvider;
  provider_record_id: string;
  data_type: HealthDataType;
  raw_payload: Record<string, unknown>;
  recorded_at: string;
  synced_at: string;
  sync_status: SyncStatus;
}

/** Normalized domain models — typed, queryable by features and Agent */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface ImportedWorkout {
  id: string;
  user_id: string;
  raw_record_id: string;
  provider: HealthProvider;
  provider_record_id: string;
  workout_type: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  distance_meters?: number;
  average_pace_seconds_per_km?: number;
  average_speed_kmh?: number;
  elevation_gain_meters?: number;
  route_data?: GeoPoint[]; // read-only in MVP
  synced_at: string;
}

export interface ImportedSleepSummary {
  id: string;
  user_id: string;
  raw_record_id: string;
  provider: HealthProvider;
  date: string;
  total_duration_minutes: number;
  deep_minutes?: number;
  light_minutes?: number;
  rem_minutes?: number;
  awake_minutes?: number;
  synced_at: string;
}

export interface ImportedActivitySnapshot {
  id: string;
  user_id: string;
  raw_record_id: string;
  provider: HealthProvider;
  date: string;
  steps?: number;
  active_calories?: number;
  hrv_ms?: number;
  vo2_max?: number;
  synced_at: string;
}

export interface ImportedHeartRateSummary {
  id: string;
  user_id: string;
  raw_record_id: string;
  provider: HealthProvider;
  date: string;
  resting_bpm?: number;
  average_bpm?: number;
  max_bpm?: number;
  synced_at: string;
}

/** Convenience aggregate for UI and Agent consumption */
export interface NormalizedHealthData {
  workouts: ImportedWorkout[];
  heart_rate: ImportedHeartRateSummary | null;
  sleep: ImportedSleepSummary | null;
  activity: ImportedActivitySnapshot | null;
}
