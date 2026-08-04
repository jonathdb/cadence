-- Migration: Phase 2 Route Tracking Tables
-- Enables PostGIS, creates the routes table with spatial indexing,
-- and links routes to sessions and program_days.

-- ============================================================================
-- EXTENSION: PostGIS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- TABLE: routes
-- ============================================================================
CREATE TABLE routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  session_id uuid REFERENCES sessions,
  program_day_id uuid REFERENCES program_days,
  track geography(LineStringZ, 4326),
  point_stream jsonb NOT NULL DEFAULT '[]',
  distance_meters numeric,
  duration_seconds integer,
  avg_pace_seconds_per_km numeric,
  avg_speed_kmh numeric,
  elevation_gain_meters numeric,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- GIST spatial index on the track geometry column
CREATE INDEX idx_routes_track_gist ON routes USING GIST (track);

-- B-tree index on user_id for fast user-scoped queries
CREATE INDEX idx_routes_user_id ON routes(user_id);

-- Index on session_id for route-session lookups
CREATE INDEX idx_routes_session_id ON routes(session_id);

-- Index on program_day_id for program-day lookups
CREATE INDEX idx_routes_program_day_id ON routes(program_day_id);

-- ============================================================================
-- FK: sessions.route_id -> routes.id
-- The sessions table already has a route_id uuid column (Phase 2 placeholder).
-- Now we add the actual foreign key constraint.
-- ============================================================================
ALTER TABLE sessions
  ADD CONSTRAINT fk_sessions_route
  FOREIGN KEY (route_id) REFERENCES routes(id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access own routes"
  ON routes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
