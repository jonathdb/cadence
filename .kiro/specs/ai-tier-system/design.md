# Technical Design Document: AI Tier System

## Overview

The AI Tier System introduces tiered access control for the Cadence fitness app's AI chat functionality. It adds server-side tier resolution, rate limiting, model selection, subscription lifecycle management via RevenueCat webhooks, and client-side UI for plan visibility and upgrades.

The design reuses the existing `entitlement_levels` and `user_entitlements` tables, adds a new `ai_daily_usage` tracking table, modifies the `agent-chat` Edge Function with a three-phase pipeline (resolve → rate-check → model-select), and introduces a new `revenucat-webhook` Edge Function.

## Architecture

### High-Level Flow

```
┌─────────────┐         ┌────────────────────────────────────────────┐
│  React Native│         │        Supabase Edge Functions             │
│   Client     │         │                                            │
│              │  POST   │  ┌─────────────────────────────────┐       │
│  Chat Screen ├────────►│  │        agent-chat                │       │
│              │         │  │  1. Authenticate                 │       │
│              │         │  │  2. Resolve Tier                 │       │
│              │         │  │  3. Check Rate Limit             │       │
│              │         │  │  4. Select Model                 │       │
│              │         │  │  5. Call AI Provider              │       │
│              │◄────────┤  │  6. Stream SSE + Rate Header     │       │
│              │   SSE   │  └─────────────────────────────────┘       │
│              │         │                                            │
│  Settings    │         │  ┌─────────────────────────────────┐       │
│  AI Plan Card│         │  │     revenucat-webhook            │       │
│              │         │  │  1. Validate Secret              │       │
│              │         │  │  2. Parse Event                  │       │
└──────┬───────┘         │  │  3. Upsert/Update Entitlement    │       │
       │                 │  └─────────────────────────────────┘       │
       │                 └────────────────────────────────────────────┘
       │
       │  RevenueCat SDK
       ▼
┌──────────────┐
│  App Store / │
│  Play Store  │
└──────────────┘
```

### Component Breakdown

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Tier Resolver | `supabase/functions/_shared/tier-resolver.ts` | Classify user as BYOK, Pro, or Free |
| Rate Limiter | `supabase/functions/_shared/rate-limiter.ts` | Check/increment daily usage, enforce limits |
| Model Selector | `supabase/functions/_shared/model-selector.ts` | Map (tier, provider) → model name |
| agent-chat (modified) | `supabase/functions/agent-chat/index.ts` | Orchestrate pipeline, stream responses |
| revenucat-webhook (new) | `supabase/functions/revenucat-webhook/index.ts` | Process subscription lifecycle events |
| AI Tier Store Slice | `src/store/aiTierSlice.ts` | Client state for tier, usage, provider pref |
| AI Plan Card | `src/components/AIPlanCard.tsx` | Settings UI for plan visibility |
| Chat Indicator | `src/components/ChatUsageIndicator.tsx` | Remaining messages display in chat |
| DB Migration | `supabase/migrations/2025XXXX_ai_tier_system.sql` | ai_daily_usage table + preferred_ai_provider column |

## Data Models

### New Table: `ai_daily_usage`

```sql
CREATE TABLE ai_daily_usage (
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  message_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

CREATE INDEX idx_ai_daily_usage_user_date ON ai_daily_usage(user_id, usage_date);

ALTER TABLE ai_daily_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage
CREATE POLICY "ai_daily_usage_select"
  ON ai_daily_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Service role handles inserts/updates (Edge Function uses service_role key)
GRANT SELECT ON ai_daily_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ai_daily_usage TO service_role;
```

### Schema Modification: `user_settings`

```sql
ALTER TABLE user_settings
  ADD COLUMN preferred_ai_provider text NOT NULL DEFAULT 'openai'
  CHECK (preferred_ai_provider IN ('openai', 'anthropic'));
```

### Existing Tables (Reused)

- **`entitlement_levels`**: `free` (rank 0), `premium` (rank 1, repurposed as Pro)
- **`user_entitlements`**: Maps `user_id` → `level_id` with optional `valid_until`
- **`user_api_keys`**: Presence of a record indicates BYOK status

## Components and Interfaces

### Tier Resolver

```typescript
// supabase/functions/_shared/tier-resolver.ts

export type AiTier = 'byok' | 'pro' | 'free';

export interface TierResolution {
  tier: AiTier;
  apiKey: string;          // The key to use for the provider call
  apiKeySource: 'user' | 'backend';
}

/**
 * Resolve the user's AI tier based on:
 * 1. BYOK: user has a stored personal API key for the given provider
 * 2. Pro: user has a valid rank-1 entitlement (not expired)
 * 3. Free: default fallback
 */
export async function resolveTier(
  supabase: SupabaseClient,
  userId: string,
  provider: 'openai' | 'anthropic'
): Promise<TierResolution>;
```

### Rate Limiter

```typescript
// supabase/functions/_shared/rate-limiter.ts

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;   // messages remaining after this request
  limit: number;       // total daily limit for the tier
  used: number;        // messages used today (before this request)
}

const TIER_LIMITS: Record<AiTier, number | null> = {
  byok: null,  // unlimited
  pro: 200,
  free: 20,
};

/**
 * Check if the user has remaining messages for today.
 * If allowed, atomically increments the count.
 * Uses UPSERT with (user_id, usage_date) to handle first-message-of-day.
 */
export async function checkAndIncrementUsage(
  supabase: SupabaseClient,
  userId: string,
  tier: AiTier
): Promise<RateLimitResult>;
```

The UPSERT operation:

```sql
INSERT INTO ai_daily_usage (user_id, usage_date, message_count)
VALUES ($1, CURRENT_DATE, 1)
ON CONFLICT (user_id, usage_date)
DO UPDATE SET message_count = ai_daily_usage.message_count + 1
RETURNING message_count;
```

### Model Selector

```typescript
// supabase/functions/_shared/model-selector.ts

export interface ModelConfig {
  model: string;
  provider: 'openai' | 'anthropic';
}

const MODEL_MAP: Record<AiTier, Record<'openai' | 'anthropic', string>> = {
  free: {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-haiku-4-5-20251001',
  },
  pro: {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-20250514',
  },
  byok: {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-20250514',
  },
};

/**
 * Select the AI model based on tier and provider preference.
 */
export function selectModel(tier: AiTier, provider: 'openai' | 'anthropic'): ModelConfig;
```

### RevenueCat Webhook

```typescript
// supabase/functions/revenucat-webhook/index.ts

interface RevenueCatEvent {
  event: {
    type: 'INITIAL_PURCHASE' | 'RENEWAL' | 'CANCELLATION' | 'EXPIRATION' | string;
    app_user_id: string;
    expiration_at_ms: number | null;
  };
}

/**
 * Validate the webhook request using the shared secret.
 * On INITIAL_PURCHASE/RENEWAL: upsert entitlement with Pro level + expiry.
 * On CANCELLATION/EXPIRATION: set valid_until to now (triggers Free fallback).
 */
```

### Client Store Slice

```typescript
// src/store/aiTierSlice.ts

export interface AiTierSlice {
  // State
  currentTier: AiTier;
  dailyUsed: number;
  dailyLimit: number | null;  // null = unlimited (BYOK)
  preferredProvider: 'openai' | 'anthropic';
  isLoadingTier: boolean;

  // Actions
  setTierInfo: (tier: AiTier, used: number, limit: number | null) => void;
  setPreferredProvider: (provider: 'openai' | 'anthropic') => void;
  updateUsageFromHeader: (remaining: number) => void;
  fetchTierInfo: () => Promise<void>;
}
```

## Detailed Component Design

### Modified `agent-chat` Pipeline

The existing `agent-chat` Edge Function is refactored from a BYOK-only model to a tiered pipeline:

```typescript
// Simplified main handler flow
Deno.serve(async (req: Request): Promise<Response> => {
  // 1. CORS + method check (unchanged)
  // 2. Authenticate (unchanged)
  const { userId } = authResult;

  // 3. Resolve provider preference
  const provider = body.provider || await getPreferredProvider(supabase, userId);

  // 4. Resolve tier (NEW)
  const tierResolution = await resolveTier(supabase, userId, provider);

  // 5. Rate limit check (NEW — skipped for BYOK)
  let rateLimitResult: RateLimitResult | null = null;
  if (tierResolution.tier !== 'byok') {
    rateLimitResult = await checkAndIncrementUsage(supabase, userId, tierResolution.tier);
    if (!rateLimitResult.allowed) {
      return errorResponse(429, 'rate_limit_exceeded', 'Daily message limit reached.');
    }
  }

  // 6. Select model (NEW)
  const { model } = selectModel(tierResolution.tier, provider);

  // 7. Call AI provider with resolved key and model
  const upstreamResponse = await callProvider(
    tierResolution.apiKey,
    provider,
    model,
    messages,
    controller.signal
  );

  // 8. Stream response with X-Rate-Limit-Remaining header (NEW)
  const headers = { ...corsHeaders, 'Content-Type': 'text/event-stream' };
  if (rateLimitResult) {
    headers['X-Rate-Limit-Remaining'] = String(rateLimitResult.remaining);
  }

  return createSSEStream(upstreamResponse, provider, userId, headers);
});
```

### RevenueCat Webhook Function

```typescript
// supabase/functions/revenucat-webhook/index.ts

Deno.serve(async (req: Request): Promise<Response> => {
  // 1. Validate webhook secret
  const authHeader = req.headers.get('authorization');
  const expectedSecret = Deno.env.get('REVENUCAT_WEBHOOK_SECRET');

  if (!expectedSecret) {
    console.error('REVENUCAT_WEBHOOK_SECRET not configured');
    return new Response('Internal error', { status: 500 });
  }

  if (authHeader !== `Bearer ${expectedSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Parse event
  const { event }: RevenueCatEvent = await req.json();

  // 3. Look up Pro entitlement level ID
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: proLevel } = await supabase
    .from('entitlement_levels')
    .select('id')
    .eq('name', 'premium')
    .single();

  // 4. Process based on event type
  if (event.type === 'INITIAL_PURCHASE' || event.type === 'RENEWAL') {
    const validUntil = event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : null;

    await supabase.from('user_entitlements').upsert(
      {
        user_id: event.app_user_id,
        level_id: proLevel.id,
        valid_until: validUntil,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } else if (event.type === 'CANCELLATION' || event.type === 'EXPIRATION') {
    await supabase
      .from('user_entitlements')
      .update({ valid_until: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('user_id', event.app_user_id);
  }

  return new Response('OK', { status: 200 });
});
```

### Client Integration

#### RevenueCat SDK Setup

```typescript
// src/services/purchases.ts
import Purchases from 'react-native-purchases';

export async function initPurchases(userId: string) {
  Purchases.configure({
    apiKey: Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY!
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY!,
    appUserID: userId,
  });
}

export async function purchasePro(): Promise<boolean> {
  const offerings = await Purchases.getOfferings();
  const proPackage = offerings.current?.availablePackages[0];
  if (!proPackage) throw new Error('Pro package not available');

  const { customerInfo } = await Purchases.purchasePackage(proPackage);
  return customerInfo.entitlements.active['pro'] !== undefined;
}

export function openManageSubscriptions() {
  Purchases.showManageSubscriptions();
}
```

#### Zustand Store Slice Integration

The `AiTierSlice` is added to the existing `CadenceStore` via a slice pattern:

```typescript
// src/store/aiTierSlice.ts
import { StateCreator } from 'zustand';

export interface AiTierSlice {
  currentTier: 'byok' | 'pro' | 'free';
  dailyUsed: number;
  dailyLimit: number | null;
  preferredProvider: 'openai' | 'anthropic';
  isLoadingTier: boolean;

  setTierInfo: (tier: 'byok' | 'pro' | 'free', used: number, limit: number | null) => void;
  setPreferredProvider: (provider: 'openai' | 'anthropic') => void;
  updateUsageFromHeader: (remaining: number) => void;
}

export const createAiTierSlice: StateCreator<AiTierSlice> = (set, get) => ({
  currentTier: 'free',
  dailyUsed: 0,
  dailyLimit: 20,
  preferredProvider: 'openai',
  isLoadingTier: false,

  setTierInfo: (tier, used, limit) => set({ currentTier: tier, dailyUsed: used, dailyLimit: limit }),

  setPreferredProvider: (provider) => set({ preferredProvider: provider }),

  updateUsageFromHeader: (remaining) => {
    const { dailyLimit } = get();
    if (dailyLimit !== null) {
      set({ dailyUsed: dailyLimit - remaining });
    }
  },
});
```

#### Chat Service Integration

After each successful chat response, the client reads the `X-Rate-Limit-Remaining` header and updates the store:

```typescript
// In the chat service / hook
const response = await fetch(`${SUPABASE_URL}/functions/v1/agent-chat`, { ... });
const remaining = response.headers.get('X-Rate-Limit-Remaining');
if (remaining !== null) {
  store.getState().updateUsageFromHeader(parseInt(remaining, 10));
}
```

## Error Handling

| Scenario | HTTP Status | Error Code | Client Behavior |
|----------|-------------|------------|-----------------|
| Daily limit reached | 429 | `rate_limit_exceeded` | Disable input, show upgrade prompt |
| Invalid/expired API key (BYOK) | 400 | `api_key_invalid` | Prompt user to update key |
| Missing backend env var | 500 | `internal_error` | Generic retry message |
| Webhook invalid secret | 401 | — | RevenueCat retries (exponential backoff) |
| AI provider error | 502 | `provider_error` | Generic retry message |
| AI provider timeout | 504 | `timeout` | Suggest retry |

## Security Considerations

- **Webhook Validation**: The `revenucat-webhook` function validates the `Authorization: Bearer <secret>` header against the `REVENUCAT_WEBHOOK_SECRET` env var before processing any event.
- **RLS on ai_daily_usage**: Users can only SELECT their own rows. All writes happen via the service role within Edge Functions.
- **Backend API Keys**: `CADENCE_OPENAI_KEY` and `CADENCE_ANTHROPIC_KEY` are never exposed to the client. Only the Edge Function accesses them.
- **Atomic Increment**: The UPSERT with `message_count + 1` prevents race conditions on concurrent requests from the same user.

## Testing Strategy

### Property-Based Tests (via fast-check)

Property-based tests target the pure-logic components that are amenable to universal quantification:

- **Tier Resolver** (`resolveTier`): Generate random user states (API key presence, entitlement rank, valid_until timestamps) and verify correct tier classification.
- **Model Selector** (`selectModel`): Exhaustive over the finite domain of (tier × provider) combinations.
- **Rate Limiter** (`checkAndIncrementUsage`): Generate random tiers and usage counts, verify allow/deny boundary correctness and remaining calculation.
- **Webhook Handler** (parsing + mutation logic): Generate random RevenueCat event payloads and verify correct entitlement mutation output.

### Unit Tests (example-based)

- Provider preference fallback (request without explicit provider uses stored preference)
- UI components render correct state for each tier (Free, Pro, BYOK)
- Chat input disabled when remaining = 0
- Error/cancellation message display on failed purchase

### Integration Tests

- `ai_daily_usage` unique constraint enforcement
- RLS policies on `ai_daily_usage` (user isolation)
- Service role UPSERT behavior
- End-to-end webhook → entitlement update → tier resolution flow

### Smoke Tests

- Required environment variables present and readable
- `ai_daily_usage` table exists with correct schema
- `preferred_ai_provider` column exists with CHECK constraint

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Tier Resolution Correctness

*For any* user state (presence/absence of API key, entitlement level, valid_until value), the `resolveTier` function SHALL classify the user as: BYOK if a personal API key exists for the given provider, Pro if no API key exists but a valid rank-1 entitlement is present (valid_until is null or in the future), and Free otherwise.

**Validates: Requirements 1.1, 1.2, 1.3, 10.1**

### Property 2: Model Selection Determinism

*For any* combination of AI tier (free, pro, byok) and provider preference (openai, anthropic), the `selectModel` function SHALL return exactly one predetermined model string: free+openai→gpt-4o-mini, free+anthropic→claude-haiku-4-5-20251001, pro+openai→gpt-4o, pro+anthropic→claude-sonnet-4-20250514, byok uses the same models as pro.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

### Property 3: Rate Limit Enforcement

*For any* AI tier and daily message count, the rate limiter SHALL allow the request if and only if: the tier is BYOK (always allowed), OR the current message count is strictly less than the tier's daily limit (20 for free, 200 for pro).

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

### Property 4: Usage Count Increment and Remaining Header

*For any* successful chat request from a Free or Pro user with N messages already used today, the rate limiter SHALL atomically increment the count to N+1 and the response SHALL include an `X-Rate-Limit-Remaining` header with value (limit - N - 1).

**Validates: Requirements 3.5, 3.6**

### Property 5: Webhook Event to Entitlement Mutation

*For any* valid RevenueCat webhook event with a recognized event type, the handler SHALL: on INITIAL_PURCHASE or RENEWAL, upsert the user's entitlement with Pro level and the event's expiration timestamp as valid_until; on CANCELLATION or EXPIRATION, set valid_until to the current timestamp.

**Validates: Requirements 7.1, 7.2**

### Property 6: Webhook Authentication Guard

*For any* incoming request to the revenucat-webhook function, if the Authorization header does not match `Bearer <REVENUCAT_WEBHOOK_SECRET>`, the function SHALL return HTTP 401 and perform no database mutations.

**Validates: Requirements 7.3, 7.4**

### Property 7: Provider Preference Fallback

*For any* chat request that does not include an explicit `provider` parameter, the agent-chat function SHALL use the user's `preferred_ai_provider` value from the user_settings table as the provider for tier resolution and model selection.

**Validates: Requirements 5.2**
