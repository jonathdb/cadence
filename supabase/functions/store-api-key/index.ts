/**
 * Edge Function: store-api-key
 *
 * Receives an API key from the authenticated client and stores it
 * via the store_user_api_key RPC (which runs as SECURITY DEFINER).
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

  try {
    // Use the store_user_api_key RPC function (runs as SECURITY DEFINER with service_role)
    const { error: rpcError } = await supabase.rpc('store_user_api_key', {
      p_user_id: userId,
      p_provider: body.provider,
      p_key: body.key.trim(),
    });

    if (rpcError) {
      console.error('store_user_api_key RPC error:', rpcError.message);
      return errorResponse(500, 'storage_error', 'Failed to store API key');
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
