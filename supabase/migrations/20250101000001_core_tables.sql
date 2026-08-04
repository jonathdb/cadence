-- Migration: Core Tables for Cadence Fitness App
-- Creates all Phase 1 (MVP) tables, indexes, constraints, and functions.

-- ============================================================================
-- TABLE: exercises
-- ============================================================================
CREATE TABLE exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL,
  primary_muscle_group text NOT NULL,
  secondary_muscle_groups text[] DEFAULT '{}',
  instructions text,
  is_global boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_exercises_user_id ON exercises(user_id);
CREATE INDEX idx_exercises_is_global ON exercises(is_global) WHERE is_global = true;

-- ============================================================================
-- TABLE: programs
-- ============================================================================
CREATE TABLE programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_programs_user_id ON programs(user_id);

-- Enforce single active program per user
CREATE UNIQUE INDEX idx_one_active_program_per_user ON programs(user_id) WHERE status = 'active';

-- ============================================================================
-- TABLE: program_days
-- ============================================================================
CREATE TABLE program_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs ON DELETE CASCADE,
  day_number integer NOT NULL,
  name text NOT NULL
);

CREATE INDEX idx_program_days_program_id ON program_days(program_id);

-- ============================================================================
-- TABLE: blocks
-- ============================================================================
CREATE TABLE blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_day_id uuid NOT NULL REFERENCES program_days ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('circuit', 'superset', 'amrap', 'custom')),
  timer_config jsonb
);

CREATE INDEX idx_blocks_program_day_id ON blocks(program_day_id);

-- ============================================================================
-- TABLE: program_day_items
-- ============================================================================
CREATE TABLE program_day_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_day_id uuid NOT NULL REFERENCES program_days ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('exercise', 'block')),
  "order" integer NOT NULL,
  exercise_id uuid REFERENCES exercises,
  block_id uuid REFERENCES blocks,
  target_sets integer NOT NULL DEFAULT 3,
  target_reps text NOT NULL DEFAULT '8-12',
  target_weight numeric,
  target_rpe numeric,
  timer_config jsonb,
  notes text
);

CREATE INDEX idx_program_day_items_program_day_id ON program_day_items(program_day_id);
CREATE INDEX idx_program_day_items_exercise_id ON program_day_items(exercise_id);
CREATE INDEX idx_program_day_items_block_id ON program_day_items(block_id);

-- ============================================================================
-- TABLE: sessions
-- ============================================================================
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  program_day_id uuid NOT NULL REFERENCES program_days,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  total_duration_seconds integer,
  route_id uuid -- Phase 2 FK, no constraint yet
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_program_day_id ON sessions(program_day_id);

-- ============================================================================
-- TABLE: logged_sets
-- ============================================================================
CREATE TABLE logged_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises,
  set_number integer NOT NULL,
  reps integer NOT NULL,
  weight numeric NOT NULL DEFAULT 0,
  rpe numeric,
  notes text,
  is_pr boolean DEFAULT false,
  pr_type text CHECK (pr_type IN ('weight', 'reps_at_weight', 'estimated_1rm')),
  actual_duration_seconds integer,
  logged_at timestamptz DEFAULT now()
);

CREATE INDEX idx_logged_sets_session_id ON logged_sets(session_id);
CREATE INDEX idx_logged_sets_exercise_id ON logged_sets(exercise_id);

-- ============================================================================
-- TABLE: block_completions
-- ============================================================================
CREATE TABLE block_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES blocks,
  actual_duration_seconds integer NOT NULL,
  actual_rounds integer NOT NULL,
  completed_at timestamptz DEFAULT now()
);

CREATE INDEX idx_block_completions_session_id ON block_completions(session_id);
CREATE INDEX idx_block_completions_block_id ON block_completions(block_id);

-- ============================================================================
-- TABLE: personal_records
-- ============================================================================
CREATE TABLE personal_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises,
  pr_type text NOT NULL CHECK (pr_type IN ('weight', 'reps_at_weight', 'estimated_1rm')),
  value numeric NOT NULL,
  logged_set_id uuid REFERENCES logged_sets,
  achieved_at timestamptz DEFAULT now()
);

CREATE INDEX idx_personal_records_user_id ON personal_records(user_id);
CREATE INDEX idx_personal_records_exercise_id ON personal_records(exercise_id);

-- ============================================================================
-- TABLE: user_settings
-- ============================================================================
CREATE TABLE user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  permission_program_edits text NOT NULL DEFAULT 'approval_required',
  permission_journal_edits text NOT NULL DEFAULT 'approval_required',
  permission_spotify_actions text NOT NULL DEFAULT 'approval_required',
  permission_health_access text NOT NULL DEFAULT 'approval_required',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- TABLE: user_api_keys
-- ============================================================================
CREATE TABLE user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  provider text NOT NULL,
  encrypted_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX idx_user_api_keys_user_id ON user_api_keys(user_id);

-- ============================================================================
-- TABLE: user_spotify_tokens
-- ============================================================================
CREATE TABLE user_spotify_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scopes text[] NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- TABLE: chat_messages
-- ============================================================================
CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content text NOT NULL,
  tool_calls jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(user_id, created_at DESC);

-- ============================================================================
-- TABLE: journal_entries
-- ============================================================================
CREATE TABLE journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  content text NOT NULL,
  agent_drafted boolean DEFAULT false,
  session_id uuid REFERENCES sessions,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_journal_entries_user_id ON journal_entries(user_id);
CREATE INDEX idx_journal_entries_session_id ON journal_entries(session_id);

-- ============================================================================
-- TABLE: audit_log
-- ============================================================================
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  timestamp timestamptz DEFAULT now(),
  action_type text NOT NULL,
  permission_category text NOT NULL,
  parameters jsonb DEFAULT '{}',
  approval_status text NOT NULL CHECK (approval_status IN ('approved', 'auto_applied', 'rejected')),
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure')),
  error_message text
);

CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(user_id, timestamp DESC);

-- ============================================================================
-- TABLE: modification_history
-- ============================================================================
CREATE TABLE modification_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  change_type text NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  source text NOT NULL CHECK (source IN ('user', 'agent')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_modification_history_program_id ON modification_history(program_id);
CREATE INDEX idx_modification_history_user_id ON modification_history(user_id);

-- ============================================================================
-- FUNCTION: activate_program
-- Atomically archives the current active program and activates the new one.
-- Eliminates race conditions around the partial unique index.
-- ============================================================================
CREATE OR REPLACE FUNCTION activate_program(p_user_id uuid, p_program_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Archive the currently active program (if any)
  UPDATE programs SET status = 'archived', updated_at = now()
  WHERE user_id = p_user_id AND status = 'active';

  -- Activate the requested program
  UPDATE programs SET status = 'active', updated_at = now()
  WHERE id = p_program_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program not found or not owned by user';
  END IF;
END;
$$;
