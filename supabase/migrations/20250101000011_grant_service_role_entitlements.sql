-- Grant service_role access to tables used by execute-tool-call edge function.
-- The service_role bypasses RLS but still needs table-level grants in local Supabase.

GRANT SELECT ON user_api_keys TO service_role;
GRANT SELECT ON feature_entitlements TO service_role;
GRANT SELECT ON entitlement_levels TO service_role;
GRANT SELECT ON user_entitlements TO service_role;

-- Also grant access to all tables the tool handlers may need to read/write
GRANT SELECT, INSERT, UPDATE, DELETE ON programs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON program_days TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON program_day_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON logged_sets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON blocks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON block_completions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON personal_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON exercises TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_spotify_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON journal_entries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON routes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON health_data_raw TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON modification_history TO service_role;
