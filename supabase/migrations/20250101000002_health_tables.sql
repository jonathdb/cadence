-- Migration: Health Data Tables
-- Validates: Requirements 13.1, 13.2, 14.1, 14.2, 14.3
-- Creates the raw ingestion layer and normalized domain tables for imported health data.

-- =============================================================================
-- Table: health_data_raw
-- Raw ingestion layer — provider data stored verbatim
-- =============================================================================
CREATE TABLE health_data_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('apple_healthkit', 'health_connect')),
  provider_record_id text NOT NULL,
  data_type text NOT NULL CHECK (data_type IN ('workout', 'heart_rate', 'sleep', 'activity', 'body_metrics')),
  raw_payload jsonb NOT NULL,
  recorded_at timestamptz NOT NULL,
  synced_at timestamptz DEFAULT now(),
  sync_status text NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending')),
  UNIQUE (user_id, provider, provider_record_id)
);

-- =============================================================================
-- Table: imported_workouts
-- Normalized workout records from health providers
-- =============================================================================
CREATE TABLE imported_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_record_id uuid NOT NULL REFERENCES health_data_raw(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_record_id text NOT NULL,
  workout_type text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  duration_seconds integer NOT NULL,
  distance_meters numeric,
  average_pace_seconds_per_km numeric,
  average_speed_kmh numeric,
  elevation_gain_meters numeric,
  route_data jsonb,
  synced_at timestamptz DEFAULT now()
);

-- =============================================================================
-- Table: imported_sleep_summaries
-- Normalized sleep data from health providers
-- =============================================================================
CREATE TABLE imported_sleep_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_record_id uuid NOT NULL REFERENCES health_data_raw(id) ON DELETE CASCADE,
  provider text NOT NULL,
  date date NOT NULL,
  total_duration_minutes integer NOT NULL,
  deep_minutes integer,
  light_minutes integer,
  rem_minutes integer,
  awake_minutes integer,
  synced_at timestamptz DEFAULT now()
);

-- =============================================================================
-- Table: imported_activity_snapshots
-- Normalized daily activity data from health providers
-- =============================================================================
CREATE TABLE imported_activity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_record_id uuid NOT NULL REFERENCES health_data_raw(id) ON DELETE CASCADE,
  provider text NOT NULL,
  date date NOT NULL,
  steps integer,
  active_calories integer,
  hrv_ms numeric,
  vo2_max numeric,
  synced_at timestamptz DEFAULT now()
);

-- =============================================================================
-- Table: imported_heart_rate_summaries
-- Normalized daily heart rate data from health providers
-- =============================================================================
CREATE TABLE imported_heart_rate_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_record_id uuid NOT NULL REFERENCES health_data_raw(id) ON DELETE CASCADE,
  provider text NOT NULL,
  date date NOT NULL,
  resting_bpm integer,
  average_bpm integer,
  max_bpm integer,
  synced_at timestamptz DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- health_data_raw indexes
CREATE INDEX idx_health_raw_user_provider ON health_data_raw(user_id, provider);
CREATE INDEX idx_health_raw_synced_at ON health_data_raw(synced_at);
CREATE INDEX idx_health_raw_data_type ON health_data_raw(user_id, data_type);

-- imported_workouts indexes
CREATE INDEX idx_imported_workouts_user_date ON imported_workouts(user_id, start_time);

-- imported_sleep_summaries indexes
CREATE INDEX idx_imported_sleep_user_date ON imported_sleep_summaries(user_id, date);

-- imported_activity_snapshots indexes
CREATE INDEX idx_imported_activity_user_date ON imported_activity_snapshots(user_id, date);

-- imported_heart_rate_summaries indexes
CREATE INDEX idx_imported_hr_user_date ON imported_heart_rate_summaries(user_id, date);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE health_data_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE imported_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE imported_sleep_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE imported_activity_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE imported_heart_rate_summaries ENABLE ROW LEVEL SECURITY;

-- health_data_raw RLS
CREATE POLICY "Users can only access own health_data_raw"
  ON health_data_raw FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- imported_workouts RLS
CREATE POLICY "Users can only access own imported_workouts"
  ON imported_workouts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- imported_sleep_summaries RLS
CREATE POLICY "Users can only access own imported_sleep_summaries"
  ON imported_sleep_summaries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- imported_activity_snapshots RLS
CREATE POLICY "Users can only access own imported_activity_snapshots"
  ON imported_activity_snapshots FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- imported_heart_rate_summaries RLS
CREATE POLICY "Users can only access own imported_heart_rate_summaries"
  ON imported_heart_rate_summaries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
