-- Grant table-level access to authenticated and anon roles.
-- RLS policies still control row-level access — these grants just allow
-- the roles to interact with the tables at all.

-- Core tables
GRANT SELECT, INSERT, UPDATE, DELETE ON exercises TO authenticated;
GRANT SELECT ON exercises TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON programs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON program_days TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON program_day_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON blocks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON logged_sets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON block_completions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON personal_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_api_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_spotify_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON journal_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON modification_history TO authenticated;

-- Health data tables
GRANT SELECT, INSERT, UPDATE, DELETE ON health_data_raw TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON imported_workouts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON imported_sleep_summaries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON imported_activity_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON imported_heart_rate_summaries TO authenticated;

-- Route tracking
GRANT SELECT, INSERT, UPDATE, DELETE ON routes TO authenticated;
