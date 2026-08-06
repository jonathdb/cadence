/**
 * Client-side entitlement check for UI gating.
 * Determines whether a user has sufficient entitlement to access a given feature/tool.
 *
 * Algorithm:
 *   1. BYOK bypass — if user has a record in `user_api_keys`, grant full access
 *   2. Look up required level for the feature in `feature_entitlements`
 *      → if not found, allow (feature not gated)
 *   3. Look up user's level from `user_entitlements`
 *      → if not found, default to free (rank 0)
 *   4. Compare ranks — user rank >= required rank → allowed
 *
 * Validates: Requirements 21.2, 21.3, 21.5
 */

import { Database } from '@/types/database.generated';
import { SupabaseClient } from '@supabase/supabase-js';

export interface EntitlementResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check whether a user is entitled to access a specific feature/tool.
 * Client-side version using the typed Supabase client.
 *
 * @param supabase - Typed Supabase client
 * @param userId - The authenticated user's ID
 * @param featureName - The tool/feature name to check
 * @returns EntitlementResult indicating whether access is granted
 */
export async function checkEntitlement(
  supabase: SupabaseClient<Database>,
  userId: string,
  featureName: string
): Promise<EntitlementResult> {
  // 1. BYOK bypass: user with their own API key gets full access
  const { data: apiKeyRecord, error: apiKeyError } = await supabase
    .from('user_api_keys')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (apiKeyError) {
    console.error('Error checking BYOK status:', apiKeyError.message);
  }

  if (apiKeyRecord) {
    return { allowed: true };
  }

  // 2. Look up the required level for this feature
  const { data: featureEntitlement, error: featureError } = await supabase
    .from('feature_entitlements')
    .select('required_level_id, entitlement_levels(rank)')
    .eq('feature_name', featureName)
    .maybeSingle();

  if (featureError) {
    console.error('Error checking feature entitlement:', featureError.message);
    return { allowed: true };
  }

  // If the feature is not in the entitlements table, it's not gated
  if (!featureEntitlement) {
    return { allowed: true };
  }

  const requiredRank = (featureEntitlement.entitlement_levels as unknown as { rank: number } | null)?.rank;
  if (requiredRank === undefined || requiredRank === null) {
    return { allowed: true };
  }

  // 3. Look up user's entitlement level
  const { data: userEntitlement, error: userError } = await supabase
    .from('user_entitlements')
    .select('level_id, valid_until, entitlement_levels(rank)')
    .eq('user_id', userId)
    .maybeSingle();

  if (userError) {
    console.error('Error checking user entitlement:', userError.message);
  }

  // Default to free tier (rank 0) if no entitlement record exists
  let userRank = 0;

  if (userEntitlement) {
    // Check if entitlement has expired
    if (userEntitlement.valid_until) {
      const expiryDate = new Date(userEntitlement.valid_until);
      if (expiryDate < new Date()) {
        userRank = 0;
      } else {
        userRank = (userEntitlement.entitlement_levels as unknown as { rank: number } | null)?.rank ?? 0;
      }
    } else {
      // No expiry (permanent entitlement)
      userRank = (userEntitlement.entitlement_levels as unknown as { rank: number } | null)?.rank ?? 0;
    }
  }

  // 4. Compare ranks
  if (userRank >= requiredRank) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason:
      'This feature requires a premium subscription or your own API key.',
  };
}
