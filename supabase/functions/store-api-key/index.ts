/**
 * Edge Function: store-api-key
 *
 * Receives an API key from the authenticated client and stores it
 * encrypted server-side via Supabase Vault. Runs with service_role
 * so it can call the Vault functions that require elevated privileges.
 *
 * Requirements: 3.1, 3.2, 29.1, 29.2
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RequestBody {
  provider: 'openai' | 'anthropic';
  key: string;
}

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(
    JSON.stringify({ error: { code, message } }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Only POST requests are accepted');
  }

  // Authenticate the request
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(401, 'unauthorized', 'Missing or invalid authorization header');
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData.user) {
    return errorResponse(401, 'unauthorized', 'Invalid or expired token');
  }

  const userId = authData.user.id;

  // Parse request body
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'invalid_body', 'Request body must be valid JSON');
  }

  if (!body.provider || !['openai', 'anthropic'].includes(body.provider)) {
    return errorResponse(400, 'invalid_provider', 'Provider must be "openai" or "anthropic"');
  }

  if (!body.key || typeof body.key !== 'string' || body.key.trim().length === 0) {
    return errorResponse(400, 'invalid_key', 'API key is required');
  }

  const keyColumn = body.provider === 'openai'
    ? 'openai_key_encrypted'
    : 'anthropic_key_encrypted';

  try {
    // Check if user already has a record in user_api_keys
    const { data: existing } = await supabase
      .from('user_api_keys')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existing) {
      // Update existing record
      const { error: updateError } = await supabase
        .from('user_api_keys')
        .update({ [keyColumn]: body.key.trim(), updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      if (updateError) {
        console.error('Failed to update API key:', updateError.message);
        return errorResponse(500, 'storage_error', 'Failed to store API key');
      }
    } else {
      // Insert new record
      const { error: insertError } = await supabase
        .from('user_api_keys')
        .insert({
          user_id: userId,
          [keyColumn]: body.key.trim(),
        });

      if (insertError) {
        console.error('Failed to insert API key:', insertError.message);
        return errorResponse(500, 'storage_error', 'Failed to store API key');
      }
    }

    return new Response(
      JSON.stringify({ success: true, provider: body.provider }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Unexpected error storing API key:', err);
    return errorResponse(500, 'internal_error', 'An unexpected error occurred');
  }
});
