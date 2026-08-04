-- Migration: Row Level Security Policies for Core Tables
-- Validates: Requirements 28.1, 28.2, 7.3, 7.4
-- Enables RLS and creates access policies for all core tables.
-- Health data tables have their own RLS in 20250101000002_health_tables.sql.

-- =============================================================================
-- Enable RLS on all core tables
-- =============================================================================

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_day_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE logged_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_spotify_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE modification_history ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- exercises: Global read access, user-only write for non-global exercises
-- =============================================================================

-- SELECT: users can see global exercises OR their own
CREATE POLICY "exercises_select"
  ON exercises FOR SELECT
  USING (is_global = true OR auth.uid() = user_id);

-- INSERT: users can only insert their own non-global exercises
CREATE POLICY "exercises_insert"
  ON exercises FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_global = false);

-- UPDATE: users can only update their own non-global exercises
CREATE POLICY "exercises_update"
  ON exercises FOR UPDATE
  USING (auth.uid() = user_id AND is_global = false)
  WITH CHECK (auth.uid() = user_id AND is_global = false);

-- DELETE: users can only delete their own non-global exercises
CREATE POLICY "exercises_delete"
  ON exercises FOR DELETE
  USING (auth.uid() = user_id AND is_global = false);

-- =============================================================================
-- programs: Direct user_id ownership
-- =============================================================================

CREATE POLICY "programs_select"
  ON programs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "programs_insert"
  ON programs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "programs_update"
  ON programs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "programs_delete"
  ON programs FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- program_days: Access via program ownership
-- =============================================================================

CREATE POLICY "program_days_select"
  ON program_days FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM programs
    WHERE programs.id = program_days.program_id
      AND programs.user_id = auth.uid()
  ));

CREATE POLICY "program_days_insert"
  ON program_days FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM programs
    WHERE programs.id = program_days.program_id
      AND programs.user_id = auth.uid()
  ));

CREATE POLICY "program_days_update"
  ON program_days FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM programs
    WHERE programs.id = program_days.program_id
      AND programs.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM programs
    WHERE programs.id = program_days.program_id
      AND programs.user_id = auth.uid()
  ));

CREATE POLICY "program_days_delete"
  ON program_days FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM programs
    WHERE programs.id = program_days.program_id
      AND programs.user_id = auth.uid()
  ));

-- =============================================================================
-- blocks: Access via program_day → program ownership
-- =============================================================================

CREATE POLICY "blocks_select"
  ON blocks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM program_days
    JOIN programs ON programs.id = program_days.program_id
    WHERE program_days.id = blocks.program_day_id
      AND programs.user_id = auth.uid()
  ));

CREATE POLICY "blocks_insert"
  ON blocks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM program_days
    JOIN programs ON programs.id = program_days.program_id
    WHERE program_days.id = blocks.program_day_id
      AND programs.user_id = auth.uid()
  ));

CREATE POLICY "blocks_update"
  ON blocks FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM program_days
    JOIN programs ON programs.id = program_days.program_id
    WHERE program_days.id = blocks.program_day_id
      AND programs.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM program_days
    JOIN programs ON programs.id = program_days.program_id
    WHERE program_days.id = blocks.program_day_id
      AND programs.user_id = auth.uid()
  ));

CREATE POLICY "blocks_delete"
  ON blocks FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM program_days
    JOIN programs ON programs.id = program_days.program_id
    WHERE program_days.id = blocks.program_day_id
      AND programs.user_id = auth.uid()
  ));

-- =============================================================================
-- program_day_items: Access via program_day → program ownership
-- =============================================================================

CREATE POLICY "program_day_items_select"
  ON program_day_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM program_days
    JOIN programs ON programs.id = program_days.program_id
    WHERE program_days.id = program_day_items.program_day_id
      AND programs.user_id = auth.uid()
  ));

CREATE POLICY "program_day_items_insert"
  ON program_day_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM program_days
    JOIN programs ON programs.id = program_days.program_id
    WHERE program_days.id = program_day_items.program_day_id
      AND programs.user_id = auth.uid()
  ));

CREATE POLICY "program_day_items_update"
  ON program_day_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM program_days
    JOIN programs ON programs.id = program_days.program_id
    WHERE program_days.id = program_day_items.program_day_id
      AND programs.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM program_days
    JOIN programs ON programs.id = program_days.program_id
    WHERE program_days.id = program_day_items.program_day_id
      AND programs.user_id = auth.uid()
  ));

CREATE POLICY "program_day_items_delete"
  ON program_day_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM program_days
    JOIN programs ON programs.id = program_days.program_id
    WHERE program_days.id = program_day_items.program_day_id
      AND programs.user_id = auth.uid()
  ));

-- =============================================================================
-- sessions: Direct user_id ownership
-- =============================================================================

CREATE POLICY "sessions_select"
  ON sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "sessions_insert"
  ON sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sessions_update"
  ON sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sessions_delete"
  ON sessions FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- logged_sets: Access via session ownership
-- =============================================================================

CREATE POLICY "logged_sets_select"
  ON logged_sets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sessions
    WHERE sessions.id = logged_sets.session_id
      AND sessions.user_id = auth.uid()
  ));

CREATE POLICY "logged_sets_insert"
  ON logged_sets FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM sessions
    WHERE sessions.id = logged_sets.session_id
      AND sessions.user_id = auth.uid()
  ));

CREATE POLICY "logged_sets_update"
  ON logged_sets FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM sessions
    WHERE sessions.id = logged_sets.session_id
      AND sessions.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM sessions
    WHERE sessions.id = logged_sets.session_id
      AND sessions.user_id = auth.uid()
  ));

CREATE POLICY "logged_sets_delete"
  ON logged_sets FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM sessions
    WHERE sessions.id = logged_sets.session_id
      AND sessions.user_id = auth.uid()
  ));

-- =============================================================================
-- block_completions: Access via session ownership
-- =============================================================================

CREATE POLICY "block_completions_select"
  ON block_completions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sessions
    WHERE sessions.id = block_completions.session_id
      AND sessions.user_id = auth.uid()
  ));

CREATE POLICY "block_completions_insert"
  ON block_completions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM sessions
    WHERE sessions.id = block_completions.session_id
      AND sessions.user_id = auth.uid()
  ));

CREATE POLICY "block_completions_update"
  ON block_completions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM sessions
    WHERE sessions.id = block_completions.session_id
      AND sessions.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM sessions
    WHERE sessions.id = block_completions.session_id
      AND sessions.user_id = auth.uid()
  ));

CREATE POLICY "block_completions_delete"
  ON block_completions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM sessions
    WHERE sessions.id = block_completions.session_id
      AND sessions.user_id = auth.uid()
  ));

-- =============================================================================
-- personal_records: Direct user_id ownership
-- =============================================================================

CREATE POLICY "personal_records_select"
  ON personal_records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "personal_records_insert"
  ON personal_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "personal_records_update"
  ON personal_records FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "personal_records_delete"
  ON personal_records FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- user_settings: Direct user_id ownership
-- =============================================================================

CREATE POLICY "user_settings_select"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_settings_insert"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_settings_update"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_settings_delete"
  ON user_settings FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- user_api_keys: Direct user_id ownership
-- =============================================================================

CREATE POLICY "user_api_keys_select"
  ON user_api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_api_keys_insert"
  ON user_api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_api_keys_update"
  ON user_api_keys FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_api_keys_delete"
  ON user_api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- user_spotify_tokens: Direct user_id ownership
-- =============================================================================

CREATE POLICY "user_spotify_tokens_select"
  ON user_spotify_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_spotify_tokens_insert"
  ON user_spotify_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_spotify_tokens_update"
  ON user_spotify_tokens FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_spotify_tokens_delete"
  ON user_spotify_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- chat_messages: Direct user_id ownership
-- =============================================================================

CREATE POLICY "chat_messages_select"
  ON chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "chat_messages_insert"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_messages_update"
  ON chat_messages FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_messages_delete"
  ON chat_messages FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- journal_entries: Direct user_id ownership
-- =============================================================================

CREATE POLICY "journal_entries_select"
  ON journal_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "journal_entries_insert"
  ON journal_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "journal_entries_update"
  ON journal_entries FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "journal_entries_delete"
  ON journal_entries FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- audit_log: Direct user_id ownership
-- =============================================================================

CREATE POLICY "audit_log_select"
  ON audit_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "audit_log_insert"
  ON audit_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "audit_log_update"
  ON audit_log FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "audit_log_delete"
  ON audit_log FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- modification_history: Direct user_id ownership
-- =============================================================================

CREATE POLICY "modification_history_select"
  ON modification_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "modification_history_insert"
  ON modification_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "modification_history_update"
  ON modification_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "modification_history_delete"
  ON modification_history FOR DELETE
  USING (auth.uid() = user_id);
