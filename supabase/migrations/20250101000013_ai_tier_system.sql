-- Migration: AI Tier System
-- Adds daily usage tracking table and provider preference to user_settings.
-- Validates: Requirements 4.1, 4.2, 4.3, 4.4, 5.1

-- ============================================================================
-- TABLE: ai_daily_usage
-- Tracks per-user daily message counts for rate limiting.
-- Uses composite primary key (user_id, usage_date) for efficient UPSERT.
-- ============================================================================
CREATE TABLE ai_daily_usage (
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  message_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

CREATE INDEX idx_ai_daily_usage_user_date ON ai_daily_usage(user_id, usage_date);

-- ============================================================================
-- RLS: ai_daily_usage
-- Users can read their own usage. Service role handles writes (Edge Functions).
-- ============================================================================
ALTER TABLE ai_daily_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_daily_usage_select_own"
  ON ai_daily_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Grant access
GRANT SELECT ON ai_daily_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ai_daily_usage TO service_role;

-- ============================================================================
-- ALTER TABLE: user_settings — Add preferred AI provider column
-- ============================================================================
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS preferred_ai_provider text NOT NULL DEFAULT 'openai'
  CHECK (preferred_ai_provider IN ('openai', 'anthropic'));
