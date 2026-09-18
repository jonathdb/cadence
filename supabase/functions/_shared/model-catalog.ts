/**
 * Model Catalog for Cadence AI Chat.
 *
 * Fetches the live list of chat-capable models from OpenAI and Anthropic so the
 * client model picker never hardcodes model IDs (which change often and caused
 * a stale-model 404). Also exposes the curated per-tier model set derived from
 * MODEL_MAP, which is what non-BYOK users are allowed to pick.
 *
 * Access rules the client enforces (and agent-chat re-validates):
 * - BYOK users may pick any live model for a provider they have a key for.
 * - Free/Pro users may only pick curated (MODEL_MAP) models, which run on the
 *   shared Cadence backend key.
 */

import { MODEL_MAP } from './model-selector.ts';

export type Provider = 'openai' | 'anthropic';

export interface CatalogModel {
  /** Model ID sent to the provider API (e.g. "gpt-4o", "claude-sonnet-4-5-20250929"). */
  id: string;
  /** Human-friendly label for the picker. */
  label: string;
  provider: Provider;
  /** True when this model is in the curated MODEL_MAP (allowed for non-BYOK). */
  curated: boolean;
}

// ─── Curated set (backend-key allowed) ───────────────────────────────────────

/**
 * The distinct set of models referenced by MODEL_MAP for a provider. Non-BYOK
 * users are limited to these because they run on the Cadence backend key.
 */
export function curatedModelIds(provider: Provider): string[] {
  const ids = new Set<string>();
  for (const tier of Object.keys(MODEL_MAP) as (keyof typeof MODEL_MAP)[]) {
    ids.add(MODEL_MAP[tier][provider]);
  }
  return [...ids];
}

// ─── Live listing ────────────────────────────────────────────────────────────

/** Keep only chat-capable OpenAI models; drop embeddings/audio/image/moderation/etc. */
function isOpenAiChatModel(id: string): boolean {
  if (!id.startsWith('gpt-') && !id.startsWith('o1') && !id.startsWith('o3') && !id.startsWith('o4')) {
    return false;
  }
  const excluded = ['embedding', 'whisper', 'tts', 'audio', 'realtime', 'image', 'moderation', 'search', 'transcribe', 'dall-e'];
  return !excluded.some((frag) => id.includes(frag));
}

async function listOpenAiModels(apiKey: string): Promise<string[]> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`OpenAI models list failed (${res.status})`);
  }
  const json = await res.json();
  const ids: string[] = (json.data ?? []).map((m: { id: string }) => m.id);
  return ids.filter(isOpenAiChatModel).sort();
}

async function listAnthropicModels(apiKey: string): Promise<{ id: string; label: string }[]> {
  const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
  });
  if (!res.ok) {
    throw new Error(`Anthropic models list failed (${res.status})`);
  }
  const json = await res.json();
  return (json.data ?? [])
    .map((m: { id: string; display_name?: string }) => ({ id: m.id, label: m.display_name ?? m.id }))
    .sort((a: { id: string }, b: { id: string }) => (a.id < b.id ? 1 : -1)); // newest-ish first
}

/**
 * Fetch the live catalog for one provider using the given API key.
 * Returns [] on any error so a single provider outage doesn't break the picker.
 */
export async function fetchProviderCatalog(provider: Provider, apiKey: string): Promise<CatalogModel[]> {
  const curated = new Set(curatedModelIds(provider));
  try {
    if (provider === 'openai') {
      const ids = await listOpenAiModels(apiKey);
      return ids.map((id) => ({ id, label: id, provider, curated: curated.has(id) }));
    }
    const models = await listAnthropicModels(apiKey);
    return models.map((m) => ({ id: m.id, label: m.label, provider, curated: curated.has(m.id) }));
  } catch (err) {
    console.error(`[model-catalog] ${provider} listing error:`, err instanceof Error ? err.message : err);
    return [];
  }
}
