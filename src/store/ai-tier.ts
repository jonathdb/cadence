/**
 * AI Tier Store
 *
 * Manages client-side state for the AI tier system:
 * - Current tier (free, pro, byok)
 * - Daily usage count and limit
 * - Preferred AI provider
 * - Loading states
 *
 * This is a separate store from the main CadenceStore to keep
 * concerns cleanly separated (AI tier has no WAL/sync dependencies).
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 9.1, 9.2
 */
import { create } from 'zustand';

import { supabase } from '@/utils/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AiTier = 'byok' | 'pro' | 'free';
export type AiProvider = 'openai' | 'anthropic';

export interface AiTierState {
  /** The user's current AI tier */
  currentTier: AiTier;
  /** Messages used today */
  dailyUsed: number;
  /** Daily message limit (null = unlimited for BYOK) */
  dailyLimit: number | null;
  /** Preferred AI provider */
  preferredProvider: AiProvider;
  /** Whether tier info is being loaded */
  isLoading: boolean;
  /** Whether the user has hit the daily limit */
  isRateLimited: boolean;
}

export interface AiTierActions {
  /** Set tier info from server response */
  setTierInfo: (tier: AiTier, used: number, limit: number | null) => void;
  /** Update preferred provider */
  setPreferredProvider: (provider: AiProvider) => void;
  /** Update usage from X-Rate-Limit-Remaining header */
  updateUsageFromHeader: (remaining: number) => void;
  /** Mark as rate limited */
  setRateLimited: (limited: boolean) => void;
  /** Fetch current tier info from the server */
  fetchTierInfo: (userId: string) => Promise<void>;
  /** Persist provider preference to user_settings */
  saveProviderPreference: (userId: string, provider: AiProvider) => Promise<void>;
}

export type AiTierStore = AiTierState & AiTierActions;

// ─── Constants ───────────────────────────────────────────────────────────────

const TIER_LIMITS: Record<AiTier, number | null> = {
  byok: null,
  pro: 200,
  free: 20,
};

// ─── Store ───────────────────────────────────────────────────────────────────

export const useAiTierStore = create<AiTierStore>((set, get) => ({
  // ── Initial State ──────────────────────────────────────────────────────────
  currentTier: 'free',
  dailyUsed: 0,
  dailyLimit: 20,
  preferredProvider: 'openai',
  isLoading: false,
  isRateLimited: false,

  // ── Actions ────────────────────────────────────────────────────────────────

  setTierInfo: (tier, used, limit) => {
    set({
      currentTier: tier,
      dailyUsed: used,
      dailyLimit: limit,
      isRateLimited: limit !== null && used >= limit,
    });
  },

  setPreferredProvider: (provider) => {
    set({ preferredProvider: provider });
  },

  updateUsageFromHeader: (remaining) => {
    const { dailyLimit } = get();
    if (dailyLimit !== null) {
      const used = dailyLimit - remaining;
      set({
        dailyUsed: Math.max(0, used),
        isRateLimited: remaining <= 0,
      });
    }
  },

  setRateLimited: (limited) => {
    set({ isRateLimited: limited });
  },

  fetchTierInfo: async (userId) => {
    set({ isLoading: true });

    try {
      // 1. Check if user has BYOK key
      const { data: apiKeyRecord } = await supabase
        .from('user_api_keys')
        .select('id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (apiKeyRecord) {
        set({
          currentTier: 'byok',
          dailyUsed: 0,
          dailyLimit: null,
          isRateLimited: false,
          isLoading: false,
        });
        return;
      }

      // 2. Check entitlement level
      const { data: entitlement } = await supabase
        .from('user_entitlements')
        .select('level_id, valid_until, entitlement_levels(rank)')
        .eq('user_id', userId)
        .maybeSingle();

      let tier: AiTier = 'free';
      if (entitlement) {
        const rank = (entitlement.entitlement_levels as unknown as { rank: number } | null)?.rank ?? 0;
        const validUntil = entitlement.valid_until;
        const isExpired = validUntil ? new Date(validUntil) <= new Date() : false;

        if (rank >= 1 && !isExpired) {
          tier = 'pro';
        }
      }

      // 3. Get today's usage
      const today = new Date().toISOString().split('T')[0];
      const { data: usage } = await supabase
        .from('ai_daily_usage')
        .select('message_count')
        .eq('user_id', userId)
        .eq('usage_date', today)
        .maybeSingle();

      const used = usage?.message_count ?? 0;
      const limit = TIER_LIMITS[tier];

      set({
        currentTier: tier,
        dailyUsed: used,
        dailyLimit: limit,
        isRateLimited: limit !== null && used >= limit,
        isLoading: false,
      });

      // 4. Fetch provider preference
      const { data: settings } = await supabase
        .from('user_settings')
        .select('preferred_ai_provider')
        .eq('user_id', userId)
        .maybeSingle();

      if (settings?.preferred_ai_provider) {
        set({ preferredProvider: settings.preferred_ai_provider as AiProvider });
      }
    } catch (err) {
      console.error('[AiTierStore] Failed to fetch tier info:', err);
      set({ isLoading: false });
    }
  },

  saveProviderPreference: async (userId, provider) => {
    set({ preferredProvider: provider });

    const { error } = await supabase
      .from('user_settings')
      .update({
        preferred_ai_provider: provider,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      console.error('[AiTierStore] Failed to save provider preference:', error.message);
    }
  },
}));
