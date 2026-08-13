/**
 * Edge Function: revenucat-webhook
 *
 * Processes RevenueCat subscription lifecycle events to manage user entitlements.
 * Validates webhook authenticity via Bearer token, then upserts/updates
 * the user_entitlements table based on event type.
 *
 * Events handled:
 * - INITIAL_PURCHASE / RENEWAL → activate Pro entitlement with expiry
 * - CANCELLATION / EXPIRATION → expire entitlement (fallback to Free)
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 11.3, 11.4
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RevenueCatWebhookPayload {
  event: {
    type: string;
    app_user_id: string;
    expiration_at_ms: number | null;
    product_id?: string;
    environment?: string;
  };
}

// ─── Environment ─────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REVENUCAT_WEBHOOK_SECRET = Deno.env.get('REVENUCAT_WEBHOOK_SECRET');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return errorResponse(405, 'Only POST requests are accepted');
  }

  // ─── Validate webhook secret ─────────────────────────────────────────────
  if (!REVENUCAT_WEBHOOK_SECRET) {
    console.error('REVENUCAT_WEBHOOK_SECRET environment variable not configured');
    return errorResponse(500, 'Webhook not configured');
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${REVENUCAT_WEBHOOK_SECRET}`) {
    return errorResponse(401, 'Unauthorized');
  }

  // ─── Parse event payload ─────────────────────────────────────────────────
  let payload: RevenueCatWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse(400, 'Invalid JSON payload');
  }

  const { event } = payload;
  if (!event || !event.type || !event.app_user_id) {
    return errorResponse(400, 'Missing required event fields');
  }

  const { type, app_user_id, expiration_at_ms } = event;

  console.log(`[revenucat-webhook] Processing event: ${type} for user: ${app_user_id}`);

  // ─── Look up Pro entitlement level ID ─────────────────────────────────────
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: proLevel, error: levelError } = await supabase
    .from('entitlement_levels')
    .select('id')
    .eq('name', 'premium')
    .single();

  if (levelError || !proLevel) {
    console.error('Failed to find "premium" entitlement level:', levelError?.message);
    return errorResponse(500, 'Internal configuration error');
  }

  // ─── Process event ────────────────────────────────────────────────────────
  const activationEvents = ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION'];
  const deactivationEvents = ['CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE'];

  if (activationEvents.includes(type)) {
    // Activate/renew Pro entitlement
    const validUntil = expiration_at_ms
      ? new Date(expiration_at_ms).toISOString()
      : null; // null = permanent (lifetime purchase)

    const { error: upsertError } = await supabase
      .from('user_entitlements')
      .upsert(
        {
          user_id: app_user_id,
          level_id: proLevel.id,
          valid_until: validUntil,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (upsertError) {
      console.error('Failed to upsert entitlement:', upsertError.message);
      return errorResponse(500, 'Failed to update entitlement');
    }

    console.log(`[revenucat-webhook] Activated Pro for ${app_user_id}, valid_until: ${validUntil}`);
  } else if (deactivationEvents.includes(type)) {
    // Expire the entitlement — user falls back to Free on next tier resolution
    const { error: updateError } = await supabase
      .from('user_entitlements')
      .update({
        valid_until: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', app_user_id);

    if (updateError) {
      console.error('Failed to expire entitlement:', updateError.message);
      return errorResponse(500, 'Failed to update entitlement');
    }

    console.log(`[revenucat-webhook] Expired Pro for ${app_user_id} (event: ${type})`);
  } else {
    // Unhandled event type — acknowledge but take no action
    console.log(`[revenucat-webhook] Ignoring unhandled event type: ${type}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
