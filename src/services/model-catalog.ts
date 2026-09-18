/**
 * Client service for the live AI model catalog.
 *
 * Calls the `list-models` edge function, which returns chat-capable models from
 * OpenAI and Anthropic (live, so the picker never hardcodes model IDs), plus
 * per-provider key-presence flags used to decide what to offer and when to warn.
 */
import { supabase } from '@/utils/supabase';

export type AiProvider = 'openai' | 'anthropic';

export interface CatalogModel {
  id: string;
  label: string;
  provider: AiProvider;
  /** True when this model is in the curated backend set (allowed for non-BYOK). */
  curated: boolean;
}

export interface ProviderCatalog {
  hasUserKey: boolean;
  hasBackendKey: boolean;
  curatedModelIds: string[];
  models: CatalogModel[];
}

export interface ModelCatalog {
  openai: ProviderCatalog;
  anthropic: ProviderCatalog;
}

const EMPTY_PROVIDER: ProviderCatalog = {
  hasUserKey: false,
  hasBackendKey: false,
  curatedModelIds: [],
  models: [],
};

/**
 * Fetch the model catalog. Returns null on auth/network failure so the caller
 * can fall back to a static default without crashing the chat screen.
 */
export async function fetchModelCatalog(): Promise<ModelCatalog | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) return null;

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const response = await fetch(`${supabaseUrl}/functions/v1/list-models`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) return null;

    const body = (await response.json().catch(() => null)) as { providers?: Partial<ModelCatalog> } | null;
    if (!body?.providers) return null;

    return {
      openai: { ...EMPTY_PROVIDER, ...body.providers.openai },
      anthropic: { ...EMPTY_PROVIDER, ...body.providers.anthropic },
    };
  } catch {
    return null;
  }
}
