-- Migration: user_profiles
-- Adds a rich per-user training profile that the AI coach injects into its
-- system prompt and progression engine (goal, experience, bodyweight, injuries,
-- equipment, preferred training days/frequency, free-text notes).
--
-- Also grants service_role write access to personal_records so the analytics
-- PR-history backfill (get_pr_history) can persist records via the edge function.

-- ============================================================================
-- TABLE: user_profiles
-- One row per user. FK to auth.users.
-- ============================================================================
CREATE TABLE user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,

  -- Primary training goal driving progression + plan generation.
  goal text CHECK (goal IN (
    'strength', 'hypertrophy', 'endurance', 'general_fitness',
    'weight_loss', 'athletic_performance'
  )),

  -- Experience level scales progression increments and plan complexity.
  experience_level text CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),

  -- Bodyweight + unit (unit independent of user_settings.weight_unit so the
  -- profile is self-describing for the coach).
  bodyweight numeric CHECK (bodyweight IS NULL OR (bodyweight > 0 AND bodyweight < 1000)),
  bodyweight_unit text NOT NULL DEFAULT 'kg' CHECK (bodyweight_unit IN ('kg', 'lbs')),

  -- Free-text injuries / limitations the coach must always respect.
  injuries text CHECK (injuries IS NULL OR char_length(injuries) <= 2000),

  -- Available equipment (free-text tags, e.g. 'dumbbells', 'barbell', 'kettlebell').
  equipment text[] NOT NULL DEFAULT '{}',

  -- Preferred training days (e.g. 'mon','wed','fri') and weekly frequency.
  preferred_training_days text[] NOT NULL DEFAULT '{}',
  weekly_frequency integer CHECK (weekly_frequency IS NULL OR (weekly_frequency >= 1 AND weekly_frequency <= 14)),

  -- Free-text "about my training" notes the coach always sees.
  training_notes text CHECK (training_notes IS NULL OR char_length(training_notes) <= 4000),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- One profile per user; the UNIQUE constraint above already indexes user_id,
-- but keep an explicit index name consistent with the rest of the schema.
CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);

-- ============================================================================
-- RLS: enable + owner-only policies
-- ============================================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_select"
  ON user_profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "user_profiles_insert"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "user_profiles_update"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "user_profiles_delete"
  ON user_profiles FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON user_profiles TO authenticated;
-- service_role reads the profile when building the agent system prompt.
GRANT SELECT, INSERT, UPDATE, DELETE ON user_profiles TO service_role;

-- personal_records: allow service_role to backfill PR history via the edge function.
GRANT SELECT, INSERT, UPDATE, DELETE ON personal_records TO service_role;
