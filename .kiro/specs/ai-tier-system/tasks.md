# Implementation Plan: AI Tier System

## Overview

Implement a three-tier AI access system (Free, Pro, BYOK) for the Cadence fitness app. This involves adding a database migration for daily usage tracking, creating shared Edge Function modules (tier resolver, rate limiter, model selector), refactoring the `agent-chat` function to a tiered pipeline, adding a `revenucat-webhook` function, integrating a Zustand store slice for client state, and building UI components for plan visibility and chat usage indicators.

## Tasks

- [ ] 1. Database migration and schema changes
  - [ ] 1.1 Create the `ai_daily_usage` table migration
    - Create `supabase/migrations/2025XXXX_ai_tier_system.sql`
    - Add `ai_daily_usage` table with `user_id`, `usage_date`, `message_count` columns
    - Add composite primary key on `(user_id, usage_date)`
    - Add index `idx_ai_daily_usage_user_date`
    - Enable RLS with SELECT policy for authenticated users (own rows only)
    - Grant SELECT to `authenticated`, SELECT/INSERT/UPDATE to `service_role`
    - Add `preferred_ai_provider` column to `user_settings` with CHECK constraint (`openai`, `anthropic`) and default `openai`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1_

- [ ] 2. Shared Edge Function modules
  - [ ] 2.1 Implement the Tier Resolver module
    - Create `supabase/functions/_shared/tier-resolver.ts`
    - Export `AiTier` type (`'byok' | 'pro' | 'free'`) and `TierResolution` interface
    - Implement `resolveTier(supabase, userId, provider)` function:
      - Check `user_api_keys` via `get_user_api_key` RPC → BYOK if key exists
      - Check `user_entitlements` for rank-1 with valid `valid_until` → Pro
      - Default to Free
    - Return the appropriate API key (user's own or backend env var)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 10.1_

  - [ ]* 2.2 Write property test for Tier Resolver
    - **Property 1: Tier Resolution Correctness**
    - Generate random user states (API key presence, entitlement rank, valid_until timestamps)
    - Verify: BYOK if personal key exists, Pro if valid rank-1 entitlement, Free otherwise
    - **Validates: Requirements 1.1, 1.2, 1.3, 10.1**

  - [ ] 2.3 Implement the Rate Limiter module
    - Create `supabase/functions/_shared/rate-limiter.ts`
    - Export `RateLimitResult` interface and `TIER_LIMITS` constant
    - Implement `checkAndIncrementUsage(supabase, userId, tier)` function:
      - Return allowed=true immediately for BYOK (unlimited)
      - For Free/Pro: query current usage, check against limit
      - If allowed: atomically increment via UPSERT
      - Return `{ allowed, remaining, limit, used }`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 2.4 Write property test for Rate Limiter
    - **Property 3: Rate Limit Enforcement**
    - Generate random tier and message count combinations
    - Verify: BYOK always allowed, Free allowed iff count < 20, Pro allowed iff count < 200
    - **Property 4: Usage Count Increment and Remaining Header**
    - Verify: remaining = limit - used - 1 for each allowed request
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

  - [ ] 2.5 Implement the Model Selector module
    - Create `supabase/functions/_shared/model-selector.ts`
    - Export `ModelConfig` interface and `MODEL_MAP` constant
    - Implement `selectModel(tier, provider)` function:
      - free+openai → `gpt-4o-mini`
      - free+anthropic → `claude-haiku-4-5-20251001`
      - pro+openai → `gpt-4o`
      - pro+anthropic → `claude-sonnet-4-20250514`
      - byok uses same as pro
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 2.6 Write property test for Model Selector
    - **Property 2: Model Selection Determinism**
    - Exhaustively verify all (tier × provider) combinations map to correct model string
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

- [ ] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Refactor `agent-chat` Edge Function
  - [ ] 4.1 Integrate tier pipeline into `agent-chat`
    - Modify `supabase/functions/agent-chat/index.ts`
    - Add provider preference resolution: read `preferred_ai_provider` from `user_settings` when no explicit `provider` in request body
    - Insert Tier Resolver call after authentication
    - Insert Rate Limiter check after tier resolution (skip for BYOK)
    - Return 429 with `rate_limit_exceeded` error when limit reached
    - Insert Model Selector call to determine model dynamically
    - Pass resolved API key and model to provider call functions (`callOpenAI`/`callAnthropic`)
    - Remove hardcoded model strings from `callOpenAI` and `callAnthropic`
    - Remove the current "API key required" error for users without personal keys (they now fall to Free/Pro)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 3.4, 5.2_

  - [ ] 4.2 Add `X-Rate-Limit-Remaining` header to SSE response
    - Modify `createSSEStream` to accept custom headers parameter
    - Include `X-Rate-Limit-Remaining` header for Free and Pro tier responses
    - _Requirements: 3.6_

  - [ ]* 4.3 Write property test for Provider Preference Fallback
    - **Property 7: Provider Preference Fallback**
    - Verify: when no explicit provider in request, stored `preferred_ai_provider` is used
    - **Validates: Requirements 5.2**

- [ ] 5. RevenueCat Webhook Edge Function
  - [ ] 5.1 Create the `revenucat-webhook` function
    - Create `supabase/functions/revenucat-webhook/index.ts`
    - Validate `Authorization: Bearer <secret>` against `REVENUCAT_WEBHOOK_SECRET` env var
    - Return 401 if validation fails, perform no DB mutations
    - Parse the RevenueCat event payload
    - On `INITIAL_PURCHASE` / `RENEWAL`: upsert `user_entitlements` with Pro level + `valid_until`
    - On `CANCELLATION` / `EXPIRATION`: set `valid_until` to current timestamp
    - Return 200 on success
    - Log error if `REVENUCAT_WEBHOOK_SECRET` is not configured
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 11.3, 11.4_

  - [ ]* 5.2 Write property test for Webhook Authentication Guard
    - **Property 6: Webhook Authentication Guard**
    - Generate random authorization headers
    - Verify: non-matching headers always produce 401 with no DB mutations
    - **Validates: Requirements 7.3, 7.4**

  - [ ]* 5.3 Write property test for Webhook Event Processing
    - **Property 5: Webhook Event to Entitlement Mutation**
    - Generate random valid event payloads with various event types
    - Verify: INITIAL_PURCHASE/RENEWAL → upsert Pro entitlement with expiry; CANCELLATION/EXPIRATION → set valid_until to now
    - **Validates: Requirements 7.1, 7.2**

- [ ] 6. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Client state management
  - [ ] 7.1 Create the AI Tier Zustand store slice
    - Create `src/store/aiTierSlice.ts`
    - Implement `AiTierSlice` interface with state: `currentTier`, `dailyUsed`, `dailyLimit`, `preferredProvider`, `isLoadingTier`
    - Implement actions: `setTierInfo`, `setPreferredProvider`, `updateUsageFromHeader`, `fetchTierInfo`
    - Integrate slice into `src/store/index.ts` by adding to the combined store type
    - _Requirements: 8.1, 8.2, 8.3, 9.1, 9.2_

  - [ ] 7.2 Create RevenueCat purchases service
    - Create `src/services/purchases.ts`
    - Implement `initPurchases(userId)` with platform-specific API keys
    - Implement `purchasePro()` to present offerings and execute purchase
    - Implement `openManageSubscriptions()` wrapper
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 7.3 Integrate `X-Rate-Limit-Remaining` header reading in chat service
    - Modify the existing chat service/hook to read the `X-Rate-Limit-Remaining` header from responses
    - Call `updateUsageFromHeader` on the store after each successful response
    - _Requirements: 9.2_

- [ ] 8. Client UI components
  - [ ] 8.1 Create the AI Plan Card component
    - Create `src/components/AIPlanCard.tsx`
    - Display current tier name (Free, Pro, BYOK)
    - Display usage as "X / Y messages today" for Free/Pro, "Unlimited" for BYOK
    - Include provider preference toggle (OpenAI / Anthropic) that persists to `user_settings`
    - Show "Upgrade to Pro" button for Free tier (calls `purchasePro()`)
    - Show "Manage Subscription" button for Pro tier (calls `openManageSubscriptions()`)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ] 8.2 Create the Chat Usage Indicator component
    - Create `src/components/ChatUsageIndicator.tsx`
    - Display remaining messages for Free and Pro users
    - Hide completely for BYOK users
    - Update dynamically from store state (driven by `X-Rate-Limit-Remaining` header)
    - _Requirements: 9.1, 9.2, 9.5_

  - [ ] 8.3 Implement rate limit reached state in chat screen
    - Disable message input when remaining = 0
    - Display "Daily limit reached. Upgrade to Pro or add your own API key." message
    - _Requirements: 9.3, 9.4_

  - [ ]* 8.4 Write unit tests for UI components
    - Test AI Plan Card renders correctly for each tier state
    - Test Chat Usage Indicator visibility rules
    - Test disabled input state when limit reached
    - _Requirements: 8.1, 8.2, 8.3, 9.1, 9.3, 9.4, 9.5_

- [ ] 9. Integration and wiring
  - [ ] 9.1 Wire AI Plan Card into Settings screen
    - Add `AIPlanCard` to the existing settings/account screen
    - Fetch tier info on mount via `fetchTierInfo` store action
    - Handle loading states
    - _Requirements: 8.1, 10.2_

  - [ ] 9.2 Wire Chat Usage Indicator into Chat screen
    - Add `ChatUsageIndicator` to the chat screen layout
    - Connect to store state for reactive updates
    - _Requirements: 9.1, 9.2_

  - [ ] 9.3 Initialize RevenueCat on app startup
    - Call `initPurchases(userId)` in the auth provider after successful login
    - Handle Pro purchase success by refreshing tier info in store
    - _Requirements: 6.2_

- [ ] 10. Environment configuration validation
  - [ ] 10.1 Add environment variable validation to Edge Functions
    - In `agent-chat`: validate `CADENCE_OPENAI_KEY` and `CADENCE_ANTHROPIC_KEY` presence, log error if missing
    - In `revenucat-webhook`: validate `REVENUCAT_WEBHOOK_SECRET` presence, log error if missing
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [ ] 11. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses TypeScript with Vitest + fast-check for property-based testing
- Edge Functions run on Deno (Supabase Edge Functions runtime)
- Client uses React Native with Expo Router, Zustand for state management

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.3", "2.5"] },
    { "id": 2, "tasks": ["2.2", "2.4", "2.6"] },
    { "id": 3, "tasks": ["4.1", "5.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "5.2", "5.3"] },
    { "id": 5, "tasks": ["7.1", "7.2", "10.1"] },
    { "id": 6, "tasks": ["7.3", "8.1", "8.2"] },
    { "id": 7, "tasks": ["8.3", "8.4"] },
    { "id": 8, "tasks": ["9.1", "9.2", "9.3"] }
  ]
}
```
