# Implementation Plan: Cadence AI Coach — Unified Workout Intelligence Uplift

## Overview

Make the Cadence AI coach data-aware and unified across strength + cardio + recovery,
upgrade plan quality with goal-aligned structure, and add a proactive (approval-gated)
suggestion loop. The agent still only *proposes* tool calls; execution and the approval
gate remain unchanged.

Progress tracker — update the checkboxes as each task lands.

## Tasks

- [x] **Task 0 — Progress-tracking spec**
  - Create `.kiro/specs/ai-coach-uplift/` with this `tasks.md` and `design.md`.
  - Keep the checklist current as tasks complete.

- [x] **Task 1 — Server-side strength analytics module + tests**
  - `supabase/functions/_shared/analytics-engine.ts` (pure, no DB calls).
  - Volume trend over N weeks; per-muscle-group weekly volume + balance (port from `volume-calculator.ts`).
  - Estimated-1RM / PR history (port `calculateEstimated1RM` + `detectPR`).
  - Training consistency / adherence (completed vs planned frequency).
  - Vitest: trend direction, balance ratios, PR priority, adherence edge cases.

- [x] **Task 2 — Cardio analytics extension + tests**
  - Pace/speed trend over time and per-distance-bucket from routes + imported_workouts shapes.
  - Weekly cardio load (distance/duration); elevation-adjusted pace normalization.
  - Vitest: pace-trend direction, empty/one-route cases, load aggregation.

- [x] **Task 3 — Expose analytics as retrieval tools (wired end-to-end)**
  - New tools: `get_training_analytics`, `get_pr_history` (backfill `personal_records` on read), `get_cardio_analytics`.
  - Register each in `TOOL_PERMISSION_MAP` (health_access / program_edits).
  - Fix `get_recovery_summary` to average/baseline across `days`.
  - Handler tests with a mocked Supabase client.

- [x] **Task 4 — user_profiles schema + client service + migration**
  - Migration: `user_profiles` (goal, experience_level, bodyweight+unit, injuries, equipment, preferred_days, weekly_frequency, notes) with RLS.
  - `src/services/profile.ts` (get/upsert) + `ensureUserProfile`.
  - Regenerate `database.generated.ts`. Vitest + RLS policy test.

- [x] **Task 5 — Profile UI screen (Expo SDK 57)**
  - Profile screen under Settings reading/writing via `profile.ts`.
  - Verify Expo APIs against SDK 57 docs. Component test + manual run.

- [x] **Task 6 — Inject profile summary into the agent**
  - `buildProfileSummary(userId)` appends a compact, token-bounded summary to the system prompt.
  - Prompt guidance to respect injuries/equipment and align to goal. Graceful "no profile".

- [x] **Task 7 — Progression engine v2 (unified, profile-aware, server-assembled)**
  - Accept analytics + recovery window + profile. Add cardio rules, goal weighting, experience scaling, injury/equipment guardrails, unified recovery override.
  - `suggest_progression` handler assembles inputs server-side.
  - Expand Vitest suite; keep the pure engine deterministic.

- [x] **Task 8 — Goal-aligned planning + `critique_program` tool**
  - `critique_program` returns structured feedback + concrete proposed changes.
  - Lightweight periodization in generated plans; exercise selection by equipment/experience/goal.
  - All mutations stay behind the program_edits approval gate.

- [x] **Task 9 — Proactive session-insight function**
  - `session-insight` produces one concise insight from a completed session.
  - Persists to `chat_messages`; actionable changes emitted as `pending_approval` proposals.

- [x] **Task 10 — Wire proactive trigger + local notification (Expo SDK 57)**
  - Hook `completeSession` / sync flush to call `session-insight`.
  - Schedule a local notification deep-linking to chat. Verify SDK 57 `expo-notifications`.

- [x] **Task 11 — End-to-end integration pass + system-prompt consolidation**
  - Document all new tools in the system prompt; remove stale guidance.
  - Full build + Vitest green; scripted end-to-end scenario.
