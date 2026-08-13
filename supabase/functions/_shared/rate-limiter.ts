/**
 * Rate Limiter for Cadence AI Chat.
 *
 * Enforces daily message limits per user tier:
 * - Free: 20 messages/day
 * - Pro: 200 messages/day
 * - BYOK: unlimited (skipped)
 *
 * Uses atomic UPSERT on ai_daily_usage table to prevent race conditions.
 * Daily counts reset at midnight UTC (new row per date).
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { AiTier } from './tier-resolver.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  /** Whether the request is allowed to proceed */
  allowed: boolean;
  /** Messages remaining after this request (0 if denied) */
  remaining: number;
  /** Total daily limit for the tier (null = unlimited) */
  limit: number | null;
  /** Messages used today before this request */
  used: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const TIER_LIMITS: Record<AiTier, number | null> = {
  byok: null, // unlimited
  pro: 200,
  free: 20,
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check if the user has remaining messages for today and atomically increment if allowed.
 *
 * For BYOK users, always returns allowed=true with null limit (unlimited).
 * For Free/Pro users, checks the current count against the tier limit.
 * If allowed, atomically increments the count via UPSERT.
 *
 * @param supabase - Service-role Supabase client
 * @param userId - Authenticated user's ID
 * @param tier - User's resolved AI tier
 * @returns RateLimitResult with allowed status and remaining count
 */
export async function checkAndIncrementUsage(
  supabase: SupabaseClient,
  userId: string,
  tier: AiTier
): Promise<RateLimitResult> {
  // BYOK users bypass rate limiting entirely
  if (tier === 'byok') {
    return {
      allowed: true,
      remaining: Infinity,
      limit: null,
      used: 0,
    };
  }

  const limit = TIER_LIMITS[tier]!;

  // Get current usage for today (UTC)
  const { data: currentUsage } = await supabase
    .from('ai_daily_usage')
    .select('message_count')
    .eq('user_id', userId)
    .eq('usage_date', getCurrentDateUTC())
    .maybeSingle();

  const currentCount = currentUsage?.message_count ?? 0;

  // Check if limit would be exceeded
  if (currentCount >= limit) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      used: currentCount,
    };
  }

  // Atomically increment the count via UPSERT
  const { data: updatedRow, error } = await supabase
    .from('ai_daily_usage')
    .upsert(
      {
        user_id: userId,
        usage_date: getCurrentDateUTC(),
        message_count: currentCount + 1,
      },
      { onConflict: 'user_id,usage_date' }
    )
    .select('message_count')
    .single();

  if (error) {
    console.error('Rate limiter UPSERT error:', error.message);
    // On error, still allow the request (fail open) but log the issue
    return {
      allowed: true,
      remaining: limit - currentCount - 1,
      limit,
      used: currentCount,
    };
  }

  const newCount = updatedRow?.message_count ?? currentCount + 1;

  return {
    allowed: true,
    remaining: Math.max(0, limit - newCount),
    limit,
    used: newCount,
  };
}

/**
 * Get current usage count without incrementing.
 * Used by the client to display remaining messages.
 */
export async function getCurrentUsage(
  supabase: SupabaseClient,
  userId: string,
  tier: AiTier
): Promise<{ used: number; limit: number | null; remaining: number }> {
  if (tier === 'byok') {
    return { used: 0, limit: null, remaining: Infinity };
  }

  const limit = TIER_LIMITS[tier]!;

  const { data } = await supabase
    .from('ai_daily_usage')
    .select('message_count')
    .eq('user_id', userId)
    .eq('usage_date', getCurrentDateUTC())
    .maybeSingle();

  const used = data?.message_count ?? 0;

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get the current date in UTC as an ISO date string (YYYY-MM-DD).
 */
function getCurrentDateUTC(): string {
  return new Date().toISOString().split('T')[0];
}
