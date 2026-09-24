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

// ---------------------------------------------------------------------------
// Pure selection / gating helpers (model picker rework — Requirement 6)
//
// Kept side-effect-free and independent of any UI framework so they can be
// property-tested directly (Design §6b/§6c/§6d).
// ---------------------------------------------------------------------------

/** A catalog model annotated with whether the current user may select it. */
export interface SelectableModel extends CatalogModel {
  selectable: boolean;
}

/** A provider entry with at least one selectable model to show. */
export interface ModelsProviderEntry {
  kind: 'models';
  provider: AiProvider;
  /** At most 5 models, curated-first then recency (see `selectVisibleModels`). */
  models: SelectableModel[];
}

/**
 * A provider with no user key and no curated/backend-runnable models —
 * collapsed to a single row instead of an empty model list (Design §6b).
 */
export interface UnavailableProviderEntry {
  kind: 'unavailable';
  provider: AiProvider;
  message: string;
}

export type ProviderEntry = ModelsProviderEntry | UnavailableProviderEntry;

/**
 * Whether `model` may be selected by the current user for its provider.
 * BYOK (the user has their own key for the provider) → any listed model is
 * selectable. Otherwise → only curated models, and only when the backend has
 * a key to run them (Design §6d, Requirements 6.8/6.9).
 */
export function isModelSelectable(
  model: CatalogModel,
  provider: ProviderCatalog
): boolean {
  if (provider.hasUserKey) return true;
  return model.curated && provider.hasBackendKey;
}

/** Count of models in `provider` that `isModelSelectable` would allow. */
export function countSelectableModels(provider: ProviderCatalog): number {
  return provider.models.reduce(
    (count, m) => (isModelSelectable(m, provider) ? count + 1 : count),
    0
  );
}

/**
 * Orders selectable models curated-first, then by the server-provided
 * recency order (list order is the recency signal — see design "Recency
 * source"). Stable: models within the same curated-group keep their
 * relative server order.
 */
function compareCuratedThenRecency(
  a: SelectableModel,
  b: SelectableModel,
  order: Map<string, number>
): number {
  if (a.curated !== b.curated) return a.curated ? -1 : 1;
  return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
}

/**
 * Selects at most 5 selectable models per provider, curated-first then
 * recency (Requirements 6.5–6.7). `models` should already carry the
 * `selectable` flag (via `isModelSelectable`); non-selectable models are
 * filtered out before capping.
 */
export function selectVisibleModels(models: SelectableModel[]): SelectableModel[] {
  const selectable = models.filter((m) => m.selectable);
  const order = new Map(selectable.map((m, i) => [m.id, i]));
  const ordered = [...selectable].sort((a, b) => compareCuratedThenRecency(a, b, order));
  return ordered.slice(0, 5);
}

/**
 * Builds the picker's entry for a single provider: either a bounded list of
 * selectable models (capped via `selectVisibleModels`), or a single
 * collapsed "unavailable" entry when the provider has no user key AND no
 * curated/backend-runnable models (Design §6b, Requirements 6.2–6.4).
 */
export function buildProviderEntry(
  provider: AiProvider,
  catalog: ProviderCatalog,
  label: string
): ProviderEntry {
  const selectableCount = countSelectableModels(catalog);

  if (!catalog.hasUserKey && selectableCount === 0) {
    return {
      kind: 'unavailable',
      provider,
      message: `Add a ${label} key in Settings to use these models.`,
    };
  }

  const annotated: SelectableModel[] = catalog.models.map((m) => ({
    ...m,
    selectable: isModelSelectable(m, catalog),
  }));

  return {
    kind: 'models',
    provider,
    models: selectVisibleModels(annotated),
  };
}

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
