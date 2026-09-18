/**
 * Model Selector for Cadence AI Chat.
 *
 * Maps (tier, provider) → model name.
 * Deterministic — same inputs always produce the same model.
 *
 * Tier model assignments:
 * - Free: GPT-4o-mini (OpenAI) / Claude Haiku (Anthropic) — cost-efficient
 * - Pro: GPT-4o (OpenAI) / Claude Sonnet (Anthropic) — premium
 * - BYOK: Same as Pro (user pays for their own usage)
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 */

import type { AiTier } from './tier-resolver.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ModelConfig {
  model: string;
  provider: 'openai' | 'anthropic';
}

// ─── Model Map ───────────────────────────────────────────────────────────────

export const MODEL_MAP: Record<AiTier, Record<'openai' | 'anthropic', string>> = {
  free: {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-haiku-4-5-20251001',
  },
  pro: {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-5-20250929',
  },
  byok: {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-5-20250929',
  },
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Select the AI model based on the user's tier and provider preference.
 *
 * @param tier - The user's resolved AI tier (free, pro, or byok)
 * @param provider - The AI provider (openai or anthropic)
 * @returns ModelConfig with the model name and provider
 */
export function selectModel(
  tier: AiTier,
  provider: 'openai' | 'anthropic'
): ModelConfig {
  return {
    model: MODEL_MAP[tier][provider],
    provider,
  };
}
