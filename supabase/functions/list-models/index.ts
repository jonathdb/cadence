/**
 * Edge Function: list-models
 *
 * Returns the live catalog of chat-capable models from OpenAI and Anthropic,
 * grouped by provider, so the client model picker never hardcodes model IDs.
 *
 * For each provider it lists using the best available key:
 *   - the user's BYOK key if one is stored for that provider, else
 *   - the shared Cadence backend key.
 *
 * The response also reports, per provider:
 *   - hasUserKey: the user has a stored BYOK key for this provider
 *   - hasBackendKey: a Cadence backend key exists (free/pro can use curated models)
 * so the client can decide which models to offer and when to warn/block.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { fetchProviderCatalog, curatedModelIds, type Provider } from '../_shared/model-catalog.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BACKEND_KEYS: Record<Provider, string> = {
  openai: 'CADENCE_OPENAI_KEY',
  anthropic: 'CADENCE_ANTHROPIC_KEY',
};

const PROVIDERS: Provider[] = ['openai', 'anthropic'];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status);
}

async function authenticateRequest(
  authHeader: string | null
): Promise<{ userId: string } | { error: Response }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: errorResponse(401, 'unauthorized', 'Missing or invalid authorization header') };
  }
  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { error: errorResponse(401, 'unauthorized', 'Invalid or expired token') };
  }
  return { userId: data.user.id };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Only POST requests are accepted');

  const authResult = await authenticateRequest(req.headers.get('authorization'));
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const providers: Record<string, unknown> = {};

  for (const provider of PROVIDERS) {
    // Per-provider BYOK key presence.
    const { data: userKey } = await supabase.rpc('get_user_api_key', {
      p_user_id: userId,
      p_provider: provider,
    });
    const hasUserKey = typeof userKey === 'string' && userKey.length > 0;

    const backendKey = Deno.env.get(BACKEND_KEYS[provider]);
    const hasBackendKey = typeof backendKey === 'string' && backendKey.length > 0;

    // Use the user's key if present (reflects exactly what they can run),
    // otherwise the backend key. If neither exists we can't list live models.
    const listingKey = hasUserKey ? (userKey as string) : backendKey;

    let models = listingKey ? await fetchProviderCatalog(provider, listingKey) : [];

    // Non-BYOK users can only run curated models on the backend key, so mark
    // which live models they're allowed to select. BYOK users may use any.
    const curated = new Set(curatedModelIds(provider));

    providers[provider] = {
      hasUserKey,
      hasBackendKey,
      curatedModelIds: [...curated],
      models,
    };
  }

  return jsonResponse({ providers });
});
