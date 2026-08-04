-- Migration: Vault-based API Key Encryption
-- Enables pgsodium and vault extensions, then creates SECURITY DEFINER functions
-- for storing and retrieving encrypted API keys. Only service_role (Edge Functions)
-- can call these functions.
--
-- The user_api_keys table already exists (from core tables migration) with columns:
--   id, user_id, provider, encrypted_key, created_at
-- The encrypted_key column stores the vault secret_id (UUID reference) rather than
-- raw ciphertext — Vault manages the actual encryption/decryption transparently.

-- ============================================================================
-- EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgsodium;
CREATE EXTENSION IF NOT EXISTS "vault";

-- ============================================================================
-- FUNCTION: store_user_api_key
-- Encrypts the API key via Vault and stores the secret_id in user_api_keys.
-- Only callable from service_role (Edge Functions).
-- ============================================================================
CREATE OR REPLACE FUNCTION store_user_api_key(
  p_user_id uuid,
  p_provider text,
  p_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_id uuid;
  v_existing_secret_id text;
BEGIN
  -- Only allow service_role to call this function
  IF current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: only service_role can store API keys';
  END IF;

  -- Validate provider
  IF p_provider NOT IN ('openai', 'anthropic') THEN
    RAISE EXCEPTION 'Invalid provider: must be openai or anthropic';
  END IF;

  -- Check if the user already has a key for this provider
  SELECT encrypted_key INTO v_existing_secret_id
  FROM public.user_api_keys
  WHERE user_id = p_user_id AND provider = p_provider;

  IF v_existing_secret_id IS NOT NULL THEN
    -- Delete the old vault secret
    DELETE FROM vault.secrets WHERE id = v_existing_secret_id::uuid;
  END IF;

  -- Create a new vault secret with a descriptive name
  INSERT INTO vault.secrets (secret, name, description)
  VALUES (
    p_key,
    p_user_id::text || '/' || p_provider,
    'API key for user ' || p_user_id::text || ' provider ' || p_provider
  )
  RETURNING id INTO v_secret_id;

  -- Upsert the secret reference into user_api_keys
  INSERT INTO public.user_api_keys (user_id, provider, encrypted_key, created_at)
  VALUES (p_user_id, p_provider, v_secret_id::text, now())
  ON CONFLICT (user_id, provider)
  DO UPDATE SET encrypted_key = v_secret_id::text, created_at = now();
END;
$$;

-- ============================================================================
-- FUNCTION: get_user_api_key
-- Retrieves and decrypts the user's API key for the given provider.
-- Returns the plaintext key or NULL if not found.
-- Only callable from service_role (Edge Functions).
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_api_key(
  p_user_id uuid,
  p_provider text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_id text;
  v_decrypted_key text;
BEGIN
  -- Only allow service_role to call this function
  IF current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: only service_role can retrieve API keys';
  END IF;

  -- Get the vault secret_id stored in user_api_keys
  SELECT encrypted_key INTO v_secret_id
  FROM public.user_api_keys
  WHERE user_id = p_user_id AND provider = p_provider;

  -- Return NULL if no key found for this user/provider
  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Decrypt via Vault's decrypted_secrets view
  SELECT decrypted_secret INTO v_decrypted_key
  FROM vault.decrypted_secrets
  WHERE id = v_secret_id::uuid;

  RETURN v_decrypted_key;
END;
$$;

-- ============================================================================
-- FUNCTION: delete_user_api_key
-- Removes the user's API key for the given provider from both Vault and the table.
-- Only callable from service_role (Edge Functions).
-- ============================================================================
CREATE OR REPLACE FUNCTION delete_user_api_key(
  p_user_id uuid,
  p_provider text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_id text;
BEGIN
  -- Only allow service_role to call this function
  IF current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: only service_role can delete API keys';
  END IF;

  -- Get the vault secret_id
  SELECT encrypted_key INTO v_secret_id
  FROM public.user_api_keys
  WHERE user_id = p_user_id AND provider = p_provider;

  IF v_secret_id IS NOT NULL THEN
    -- Delete the vault secret
    DELETE FROM vault.secrets WHERE id = v_secret_id::uuid;
    -- Delete the user_api_keys row
    DELETE FROM public.user_api_keys
    WHERE user_id = p_user_id AND provider = p_provider;
  END IF;
END;
$$;

-- ============================================================================
-- PERMISSIONS: Restrict all functions to service_role only
-- ============================================================================

-- Revoke from public (covers anon and authenticated implicitly)
REVOKE EXECUTE ON FUNCTION store_user_api_key(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_user_api_key(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_user_api_key(uuid, text) FROM PUBLIC;

-- Explicitly revoke from anon and authenticated roles
REVOKE EXECUTE ON FUNCTION store_user_api_key(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION store_user_api_key(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION get_user_api_key(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION get_user_api_key(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION delete_user_api_key(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION delete_user_api_key(uuid, text) FROM authenticated;

-- Grant only to service_role
GRANT EXECUTE ON FUNCTION store_user_api_key(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION get_user_api_key(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION delete_user_api_key(uuid, text) TO service_role;

-- ============================================================================
-- COMMENT: Usage from Edge Functions
-- ============================================================================
COMMENT ON FUNCTION store_user_api_key IS
  'Stores an API key encrypted in Vault. Call from Edge Functions: '
  'SELECT store_user_api_key(user_id, ''openai'', ''sk-...'')';

COMMENT ON FUNCTION get_user_api_key IS
  'Retrieves a decrypted API key from Vault. Call from Edge Functions: '
  'SELECT get_user_api_key(user_id, ''openai'')';

COMMENT ON FUNCTION delete_user_api_key IS
  'Removes an API key from Vault and user_api_keys. Call from Edge Functions: '
  'SELECT delete_user_api_key(user_id, ''openai'')';
