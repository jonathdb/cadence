-- Grant service_role access to chat_messages so edge functions
-- (which use SUPABASE_SERVICE_ROLE_KEY) can store assistant messages.
-- The service_role bypasses RLS but still needs table-level grants.

GRANT SELECT, INSERT, UPDATE, DELETE ON chat_messages TO service_role;

-- Grant service_role access to tables used by execute-tool-call edge function
GRANT SELECT ON user_api_keys TO service_role;
GRANT SELECT ON feature_entitlements TO service_role;
GRANT SELECT ON entitlement_levels TO service_role;
GRANT SELECT ON user_entitlements TO service_role;
