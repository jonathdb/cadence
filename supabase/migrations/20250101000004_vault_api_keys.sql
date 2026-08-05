-- Migration: API Key Storage Functions
-- Locally, keys are stored in plaintext in the encrypted_key column.
-- Access control is handled via REVOKE/GRANT (only service_role can execute).

-- ============================================================================
-- FUNCTION: store_user_api_key
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
BEGIN
  IF p_provider NOT IN ('openai', 'anthropic') THEN
    RAISE EXCEPTION 'Invalid provider: must be openai or anthropic';
  END IF;

  INSERT INTO public.user_api_keys (user_id, provider, encrypted_key, created_at)
  VALUES (p_user_id, p_provider, p_key, now())
  ON CONFLICT (user_id, provider)
  DO UPDATE SET encrypted_key = p_key, created_at = now();
END;
$$;

-- ============================================================================
-- FUNCTION: get_user_api_key
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
  v_key text;
BEGIN
  SELECT encrypted_key INTO v_key
  FROM public.user_api_keys
  WHERE user_id = p_user_id AND provider = p_provider;

  RETURN v_key;
END;
$$;

-- ============================================================================
-- FUNCTION: delete_user_api_key
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
BEGIN
  DELETE FROM public.user_api_keys
  WHERE user_id = p_user_id AND provider = p_provider;
END;
$$;

-- ============================================================================
-- FUNCTION: activate_program
-- ============================================================================
CREATE OR REPLACE FUNCTION activate_program(p_user_id uuid, p_program_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.programs
  SET status = 'archived', updated_at = now()
  WHERE user_id = p_user_id AND status = 'active';

  UPDATE public.programs
  SET status = 'active', updated_at = now()
  WHERE id = p_program_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program not found or not owned by user';
  END IF;
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================
REVOKE EXECUTE ON FUNCTION store_user_api_key(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_user_api_key(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_user_api_key(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION store_user_api_key(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION get_user_api_key(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION delete_user_api_key(uuid, text) TO service_role;

GRANT EXECUTE ON FUNCTION activate_program(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION activate_program(uuid, uuid) TO service_role;
