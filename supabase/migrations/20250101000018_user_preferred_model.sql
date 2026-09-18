-- Migration: user_settings.preferred_model
-- Stores the user's chosen AI model (chosen in the chat model picker). The
-- provider is implied by the model, so this complements preferred_ai_provider.
-- Nullable: null means "use the tier default" (server falls back to MODEL_MAP).

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS preferred_model text
  CHECK (preferred_model IS NULL OR char_length(preferred_model) <= 128);
