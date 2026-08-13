/**
 * Tier Resolver for Cadence AI Chat.
 *
 * Determines the user's effective AI tier based on:
 * 1. BYOK: user has a stored personal API key → unlimited, uses their key
 * 2. Pro: user has a valid rank-1 entitlement (not expired) → backend key, premium models
 * 3. Free: default → backend key, cost-efficient models
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 10.1
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AiTier = 'byok' | 'pro' | 'free';

export interface TierResolution {
  tier: AiTier;
  apiKey: string;
  apiKeySource: 'user' | 'backend';
}

// ─── Environment Keys ────────────────────────────────────────────────────────

const BACKEND_KEYS: Record<'openai' | 'anthropic', string> = {
  openai: 'CADENCE_OPENAI_KEY',
  anthropic: 'CADENCE_ANTHROPIC_KEY',
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve the user's AI tier and determine which API key to use.
 *
 * Resolution order:
 * 1. Check if user has a stored personal API key for the provider → BYOK
 * 2. Check if user has a valid Pro entitlement (rank >= 1, not expired) → Pro
 * 3. Default → Free
 *
 * @param supabase - Service-role Supabase client
 * @param userId - Authenticated user's ID
 * @param provider - AI provider ('openai' or 'anthropic')
 * @returns TierResolution with tier classification and the API key to use
 * @throws Error if backend key is not configured and user is not BYOK
 */
export async function resolveTier(
  supabase: SupabaseClient,
  userId: string,
  provider: 'openai' | 'anthropic'
): Promise<TierResolution> {
  // 1. Check for BYOK — user has their own API key stored
  const { data: userApiKey } = await supabase.rpc('get_user_api_key', {
    p_user_id: userId,
    p_provider: provider,
  });

  if (userApiKey) {
    return {
      tier: 'byok',
      apiKey: userApiKey as string,
      apiKeySource: 'user',
    };
  }

  // 2. Check for Pro entitlement — valid rank-1 entry in user_entitlements
  const { data: entitlement } = await supabase
    .from('user_entitlements')
    .select('level_id, valid_until, entitlement_levels(rank)')
    .eq('user_id', userId)
    .maybeSingle();

  const isProEntitled = isValidProEntitlement(entitlement);

  // 3. Resolve backend key
  const backendKeyEnvVar = BACKEND_KEYS[provider];
  const backendKey = Deno.env.get(backendKeyEnvVar);

  if (!backendKey) {
    throw new Error(
      `Backend API key not configured: ${backendKeyEnvVar}. ` +
      `Please set the ${backendKeyEnvVar} environment variable.`
    );
  }

  if (isProEntitled) {
    return {
      tier: 'pro',
      apiKey: backendKey,
      apiKeySource: 'backend',
    };
  }

  // 4. Default to Free tier
  return {
    tier: 'free',
    apiKey: backendKey,
    apiKeySource: 'backend',
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Check if an entitlement record represents a valid Pro subscription.
 * Pro = rank >= 1 AND (valid_until is null OR valid_until is in the future).
 */
function isValidProEntitlement(
  entitlement: {
    level_id: string;
    valid_until: string | null;
    entitlement_levels: { rank: number } | null;
  } | null
): boolean {
  if (!entitlement) return false;

  const rank = (entitlement.entitlement_levels as unknown as { rank: number } | null)?.rank;
  if (rank === undefined || rank === null || rank < 1) return false;

  // Check expiry
  if (entitlement.valid_until) {
    const expiryDate = new Date(entitlement.valid_until);
    if (expiryDate <= new Date()) {
      return false; // Expired
    }
  }

  // valid_until is null (permanent) or in the future
  return true;
}
