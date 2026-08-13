# Cadence Development Roadmap

## Overview

This roadmap tracks the four major feature specs planned for the current development cycle. Execute in order — each builds on the previous.

---

## Spec 1: Stabilization & Hardening ✅ COMPLETE

**Spec path:** `.kiro/specs/stabilization-hardening/`

- [x] Fix 7 failing Spotify test mocks
- [x] GitHub Actions CI pipeline
- [x] Sentry error monitoring integration
- [x] Fix initWAL() import in StoreIntegrationProvider
- [x] EAS build configuration (eas.json)

---

## Spec 2: AI Tier System ✅ COMPLETE

**Spec path:** `.kiro/specs/ai-tier-system/`

Three-tier AI access: Free (rate-limited, backend key) → Pro (paid subscription) → BYOK (unlimited, user's own key).

### Tasks

- [x] **1. Database migration and schema changes**
  - [x] 1.1 Create `ai_daily_usage` table + `preferred_ai_provider` column

- [x] **2. Shared Edge Function modules**
  - [x] 2.1 Tier Resolver (`_shared/tier-resolver.ts`)
  - [x] 2.3 Rate Limiter (`_shared/rate-limiter.ts`)
  - [x] 2.5 Model Selector (`_shared/model-selector.ts`)

- [x] **3. Checkpoint** — all 451 tests pass ✅

- [x] **4. Refactor agent-chat Edge Function**
  - [x] 4.1 Integrate tier pipeline (resolve → rate check → model select)
  - [x] 4.2 Add `X-Rate-Limit-Remaining` header to SSE response

- [x] **5. RevenueCat Webhook Edge Function**
  - [x] 5.1 Create `revenucat-webhook` function

- [x] **6. Checkpoint** — all tests pass ✅

- [x] **7. Client state management**
  - [x] 7.1 AI Tier Zustand store slice (`src/store/ai-tier.ts`)
  - [x] 7.2 RevenueCat purchases service (`src/services/purchases.ts`)

- [x] **8. Client UI components**
  - [x] 8.1 AI Plan Card (`src/components/AIPlanCard.tsx`)
  - [x] 8.2 Chat Usage Indicator (`src/components/ChatUsageIndicator.tsx`)

- [x] **9. Integration and wiring**
  - [x] 9.1 Wire AI Plan Card into Settings screen
  - [x] 9.2 Wire Chat Usage Indicator into Chat screen
  - [x] 9.3 Initialize RevenueCat on app startup

- [x] **10. Environment configuration validation**
  - [x] 10.1 Validate required env vars in Edge Functions

- [x] **11. Final checkpoint** — all 451 tests pass ✅

**Note:** `react-native-purchases` package needs to be installed when RevenueCat account is set up.

### Tasks

- [x] **1. Database migration and schema changes**
  - [x] 1.1 Create `ai_daily_usage` table + `preferred_ai_provider` column

- [x] **2. Shared Edge Function modules**
  - [x] 2.1 Tier Resolver (`_shared/tier-resolver.ts`)
  - [ ] 2.2 Property test: Tier Resolution Correctness
  - [x] 2.3 Rate Limiter (`_shared/rate-limiter.ts`)
  - [ ] 2.4 Property test: Rate Limit Enforcement
  - [x] 2.5 Model Selector (`_shared/model-selector.ts`)
  - [ ] 2.6 Property test: Model Selection Determinism

- [x] **3. Checkpoint** — all 451 tests pass ✅

- [x] **4. Refactor agent-chat Edge Function**
  - [x] 4.1 Integrate tier pipeline (resolve → rate check → model select)
  - [x] 4.2 Add `X-Rate-Limit-Remaining` header to SSE response
  - [ ] 4.3 Property test: Provider Preference Fallback

- [x] **5. RevenueCat Webhook Edge Function**
  - [x] 5.1 Create `revenucat-webhook` function
  - [ ] 5.2 Property test: Webhook Authentication Guard
  - [ ] 5.3 Property test: Webhook Event Processing

- [x] **6. Checkpoint** — all tests pass ✅

- [x] **7. Client state management**
  - [x] 7.1 AI Tier Zustand store slice (`src/store/ai-tier.ts`)
  - [x] 7.2 RevenueCat purchases service (`src/services/purchases.ts`)
  - [ ] 7.3 Integrate `X-Rate-Limit-Remaining` header reading

- [x] **8. Client UI components**
  - [x] 8.1 AI Plan Card (`src/components/AIPlanCard.tsx`)
  - [x] 8.2 Chat Usage Indicator (`src/components/ChatUsageIndicator.tsx`)
  - [ ] 8.3 Rate limit reached state in chat (included in ChatUsageIndicator)
  - [ ] 8.4 Unit tests for UI components

- [x] **9. Integration and wiring**
  - [x] 9.1 Wire AI Plan Card into Settings screen
  - [x] 9.2 Wire Chat Usage Indicator into Chat screen
  - [ ] 9.3 Initialize RevenueCat on app startup

- [x] **10. Environment configuration validation**
  - [x] 10.1 Validate required env vars in Edge Functions

- [x] **11. Final checkpoint** — all 451 tests pass ✅

---

## Spec 3: Adaptive Programming ✅ SUBSTANTIALLY COMPLETE

**Spec path:** `.kiro/specs/adaptive-programming/`

AI agent tool (`suggest_progression`) with heuristic-based progression rules. Pure function, no DB changes.

### Tasks

- [x] 1.1 Create progression-engine.ts with types and interfaces
- [x] 1.2 Implement helper functions (roundToHalf, parseRepRange, isUpperBody, getWeightIncrement)
- [x] 2.1 Implement evaluateRecoveryConcern (sleep < 6h or HRV 20%+ below baseline)
- [x] 2.2 Implement evaluateDeload (RPE > 9 on >50% sets)
- [x] 2.3 Implement evaluateReduceWeight (missed reps 2+ sessions)
- [x] 2.4 Implement evaluateReduceVolume (weekly sets > 20 per muscle group)
- [x] 2.5 Implement evaluateIncreaseWeight (RPE < 7 for 2+ sessions)
- [x] 3.1 Implement scope handling + recovery concern global override
- [x] 3.2 Implement per-exercise rule evaluation with priority ordering
- [x] 5.1 Add tool definition schema to tool-definitions.ts
- [x] 5.2 Add tool handler in tool-handlers.ts
- [x] 5.3 Add permission mapping (suggest_progression → program_edits)
- [x] 6.1 Update system prompt with progression guidelines
- [x] 7. Checkpoint — all 451 tests pass ✅

**Remaining (optional/deferred):**
- [ ] 8.1-8.3 Unit tests for helper functions, rules, and registration
- [ ] 9.1-9.14 Property-based tests (14 correctness properties)

---

## Spec 4: Shareable Program Templates ✅ COMPLETE

**Spec path:** `.kiro/specs/shareable-program-templates/`

Publish programs as public templates, browse/discover, clone into your library. Lightweight social without feeds/following.

### Tasks

- [x] 1.1 Create program_templates + template_clones migration (tables, indexes)
- [x] 1.2 RLS policies (public read published, author-only writes, auth clone insert)
- [x] 1.3 clone_template RPC function (atomic transaction)
- [x] 2.1 Slug generator utility (slugify, collision handling, 64-char max)
- [x] 3.1 Template types and interfaces (`src/types/template.ts`)
- [x] 3.2 publishTemplate function (snapshot builder + slug generation)
- [x] 3.4 unpublishTemplate function
- [x] 3.5 getTemplateBySlug function
- [x] 3.6 cloneTemplate function (RPC wrapper)
- [x] 3.8 browseTemplates function (cursor-based pagination + tag filter)
- [x] 5.1 Update program tab layout with new stack screens
- [x] 5.2 Browse Templates screen (FlatList, infinite scroll, tag filter)
- [x] 5.3 Template Preview screen (read-only structure + clone button)
- [x] 5.4 Deep link route /t/[slug] (universal link handler)
- [x] 5.5 "Publish as Template" button in program library
- [x] 5.6 "Unpublish" action for template authors on preview screen
- [x] 5.7 "Browse Templates" navigation entry from Program tab
- [x] All 451 tests passing ✅

---

## Quick Reference

| Spec | Status | Spec Path |
|------|--------|-----------|
| Stabilization & Hardening | ✅ Done | `.kiro/specs/stabilization-hardening/` |
| AI Tier System | ✅ Done | `.kiro/specs/ai-tier-system/` |
| Adaptive Programming | ✅ Done | `.kiro/specs/adaptive-programming/` |
| Shareable Program Templates | ✅ Done | `.kiro/specs/shareable-program-templates/` |

---

*Last updated: August 13, 2026*
