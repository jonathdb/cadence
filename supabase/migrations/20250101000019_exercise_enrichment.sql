-- Migration: exercise enrichment + exercise_media
-- Enriches the exercise library with descriptive/provenance columns and adds a
-- normalized exercise_media table (still images now, gif/video later) so the
-- client can render a description, beginner-friendly explanation, and
-- demonstration media per exercise.
--
-- All new exercises columns are nullable so existing/legacy records keep
-- rendering without error (Requirement 2.6). Provenance columns (source,
-- source_license, external_ref) support an idempotent one-time import of the
-- free-exercise-db dataset and future attributed sources.

-- ============================================================================
-- exercises: descriptive + provenance columns (all nullable)
-- ============================================================================
ALTER TABLE exercises
  ADD COLUMN description text,                                        -- what the exercise is
  ADD COLUMN explanation text,                                       -- beginner-friendly how-to
  ADD COLUMN level text CHECK (level IS NULL OR level IN ('beginner', 'intermediate', 'advanced')),
  ADD COLUMN mechanic text,                                          -- 'compound' | 'isolation' | null
  ADD COLUMN force text,                                             -- 'push' | 'pull' | 'static' | null
  ADD COLUMN category text,                                          -- source category
  ADD COLUMN source text,                                            -- e.g. 'free-exercise-db'
  ADD COLUMN source_license text,                                    -- e.g. 'Unlicense'
  ADD COLUMN external_ref text;                                      -- source slug/id for idempotent re-import

-- Index to support filtering/grouping imported exercises by source.
CREATE INDEX idx_exercises_source ON exercises(source) WHERE source IS NOT NULL;

-- Unique partial index enforcing idempotent import: one row per (source, external_ref).
CREATE UNIQUE INDEX idx_exercises_source_ref
  ON exercises(source, external_ref)
  WHERE source IS NOT NULL AND external_ref IS NOT NULL;

-- ============================================================================
-- TABLE: exercise_media
-- 1..N media per exercise, ordered, typed for future gif/video. Media belongs
-- to global/public exercises, so it is readable by all authenticated users and
-- writable only by service_role (the import path).
-- ============================================================================
CREATE TABLE exercise_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id uuid NOT NULL REFERENCES exercises ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('image', 'gif', 'video')),
  storage_path text NOT NULL,                                        -- path within the 'exercise-media' bucket
  public_url text,                                                   -- resolved public URL (denormalized)
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_exercise_media_exercise_id ON exercise_media(exercise_id);

-- ============================================================================
-- RLS: enable + read-only-for-authenticated policy
-- Media describes global/public exercises, so any authenticated user may read
-- it; writes are restricted to service_role (import only, via table grants).
-- ============================================================================
ALTER TABLE exercise_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercise_media_select"
  ON exercise_media FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT ON exercise_media TO authenticated;
-- service_role imports media (bypasses RLS but still needs table-level grants).
GRANT SELECT, INSERT, UPDATE, DELETE ON exercise_media TO service_role;

-- ============================================================================
-- programs: hidden flag (declutter the archived list without destroying data)
-- Archive-first delete model keeps program structure + linked history; "hidden"
-- lets users hide archived programs from the default list. Defaults false so
-- existing programs stay visible.
-- ============================================================================
ALTER TABLE programs ADD COLUMN hidden boolean NOT NULL DEFAULT false;

-- ============================================================================
-- sessions: soft-delete marker + session-level notes
-- deleted_at supports soft-deleting a session (hidden from all lists/queries)
-- while its logged_sets remain intact as an independent record of past activity
-- (Requirement 4.12). notes holds session-level notes editable via the session
-- edit affordance (Requirement 4.2); sessions had no notes column previously.
-- ============================================================================
ALTER TABLE sessions
  ADD COLUMN deleted_at timestamptz,                                 -- soft-delete marker; NULL = active
  ADD COLUMN notes text;                                             -- session-level notes (Requirement 4.2)

-- ============================================================================
-- sessions: re-point program_day_id FK to ON DELETE SET NULL
-- The original inline FK (migration 1: program_day_id NOT NULL REFERENCES
-- program_days) was auto-named sessions_program_day_id_fkey; migration 8 dropped
-- the NOT NULL so the column is nullable. Converting the FK to ON DELETE SET
-- NULL lets a program's days be purged while the sessions (and their logged_sets)
-- survive with program_day_id nulled out, preserving logged history (Req 4.12).
-- ============================================================================
ALTER TABLE sessions DROP CONSTRAINT sessions_program_day_id_fkey;
ALTER TABLE sessions
  ADD CONSTRAINT sessions_program_day_id_fkey
  FOREIGN KEY (program_day_id) REFERENCES program_days(id) ON DELETE SET NULL;

-- ============================================================================
-- user_profiles: onboarding_status (server-persisted first-run state)
-- Persisted server-side so the skippable onboarding flow survives reinstall and
-- cross-device login and never reshows once resolved (Requirement 5.5).
-- ============================================================================
ALTER TABLE user_profiles
  ADD COLUMN onboarding_status text NOT NULL DEFAULT 'pending'
    CHECK (onboarding_status IN ('pending', 'completed', 'skipped'));

-- ============================================================================
-- user_settings: permission_session_edits (agent approval category)
-- Gives session_update/session_delete agent tools their own approval-gate
-- category, mirroring the existing permission_* columns. Defaults to
-- 'approval_required' so agent session edits are gated by default.
-- ============================================================================
ALTER TABLE user_settings
  ADD COLUMN permission_session_edits text NOT NULL DEFAULT 'approval_required';
