-- Migration: Entitlement Tables, User Settings Columns, and Sessions Nullable FK
-- Validates: Requirements 21.1, 21.4, 22.1, 22.2, 28.1

-- ============================================================================
-- TABLE: entitlement_levels
-- Defines available entitlement tiers (free, premium, etc.)
-- Extensible via new rows without schema changes.
-- ============================================================================
CREATE TABLE entitlement_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(name) <= 64),
  rank integer NOT NULL UNIQUE,  -- higher = more access
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_entitlement_levels_rank ON entitlement_levels(rank);

-- ============================================================================
-- TABLE: feature_entitlements
-- Maps feature identifiers to the minimum required entitlement level.
-- ============================================================================
CREATE TABLE feature_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_name text NOT NULL UNIQUE CHECK (char_length(feature_name) <= 64),
  required_level_id uuid NOT NULL REFERENCES entitlement_levels ON DELETE RESTRICT,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_feature_entitlements_required_level ON feature_entitlements(required_level_id);

-- ============================================================================
-- TABLE: user_entitlements
-- Maps users to their entitlement level. FK to auth.users.
-- ============================================================================
CREATE TABLE user_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  level_id uuid NOT NULL REFERENCES entitlement_levels ON DELETE RESTRICT,
  valid_until timestamptz,  -- null = permanent
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_user_entitlements_user_id ON user_entitlements(user_id);
CREATE INDEX idx_user_entitlements_level_id ON user_entitlements(level_id);

-- ============================================================================
-- SEED DATA: Insert free (rank 0) and premium (rank 1) entitlement levels
-- ============================================================================
INSERT INTO entitlement_levels (name, rank) VALUES
  ('free', 0),
  ('premium', 1);

-- ============================================================================
-- ALTER TABLE: user_settings — Add new preference columns
-- ============================================================================
ALTER TABLE user_settings
  ADD COLUMN rest_timer_auto_start boolean NOT NULL DEFAULT true,
  ADD COLUMN weight_unit text NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'lbs')),
  ADD COLUMN notification_permission_status text DEFAULT null,
  ADD COLUMN health_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN health_provider text DEFAULT null;

-- ============================================================================
-- ALTER TABLE: sessions — Make program_day_id nullable for freestyle support
-- ============================================================================
ALTER TABLE sessions ALTER COLUMN program_day_id DROP NOT NULL;

-- ============================================================================
-- RLS: Enable on new tables
-- ============================================================================
ALTER TABLE entitlement_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_entitlements ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES: entitlement_levels (public read for authenticated users)
-- Structured so future coach_athletes policy can grant coach read access (Req 22.2)
-- ============================================================================
CREATE POLICY "entitlement_levels_select"
  ON entitlement_levels FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- RLS POLICIES: feature_entitlements (public read for authenticated users)
-- ============================================================================
CREATE POLICY "feature_entitlements_select"
  ON feature_entitlements FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- RLS POLICIES: user_entitlements (user_id = auth.uid() for all operations)
-- Structured so future policy can grant coach read access (Req 22.2)
-- ============================================================================
CREATE POLICY "user_entitlements_select"
  ON user_entitlements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_entitlements_insert"
  ON user_entitlements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_entitlements_update"
  ON user_entitlements FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_entitlements_delete"
  ON user_entitlements FOR DELETE
  USING (auth.uid() = user_id);
