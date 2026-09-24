# Implementation Plan: App Experience Improvements

## Overview

This plan implements six independent UX/capability improvements to the Cadence app (Expo React Native SDK 57 client + Supabase Postgres and Deno edge functions), strictly following `requirements.md` and `design.md`. Work is sequenced so foundational database migrations land first, then the exercise library, dock clearance, program archive/hide/purge, manual + agent edit/delete, onboarding, and the model-picker fixes, with property-based, unit, integration, and manual verification tasks placed close to the code they cover.

Language: TypeScript for the client (`src/`) and Deno edge functions (`supabase/functions/`); SQL for migrations. Property-based tests use `fast-check` (minimum 100 iterations per property), per the design Testing Strategy.

**Implementation note (edge runtime caveat):** any new or changed edge function must be registered with the local Supabase edge runtime — after adding/renaming a function you must restart Supabase (`supabase stop && supabase start`, or `supabase functions serve` restart) for it to be picked up locally. Adding new tools inside existing functions (`agent-chat`, `execute-tool-call`) still requires a restart of the served function process to reload the shared modules. This is a caveat to remember during implementation, not a task.

**Implementation note (types):** after each migration set, regenerate `src/types/database.generated.ts` via `npm run gen:types` so client and edge code compile against the new columns/tables.

## Tasks

- [x] 1. Foundational database migrations (schema for all six areas)
  - [x] 1.1 Create migration `20250101000019` — exercises enrichment + `exercise_media` table
    - Add nullable columns to `exercises`: `description`, `explanation`, `level` (CHECK beginner/intermediate/advanced), `mechanic`, `force`, `category`, `source`, `source_license`, `external_ref`
    - Add `idx_exercises_source` and unique `idx_exercises_source_ref` partial indexes
    - Create `exercise_media` table (`id`, `exercise_id` FK CASCADE, `kind` CHECK image/gif/video, `storage_path`, `public_url`, `order_index`, `created_at`) + `idx_exercise_media_exercise_id`
    - RLS: `exercise_media` readable by `authenticated`, writes restricted to `service_role` (follow migration 7/9 grant pattern)
    - _Design: Components §2a; Data Models (exercises, exercise_media). Requirements: 2.1, 2.2, 2.6_

  - [x] 1.2 Extend migration `20250101000019` — programs, sessions, user_profiles, user_settings columns
    - `programs`: add `hidden boolean NOT NULL DEFAULT false`
    - `sessions`: add `deleted_at timestamptz` (soft-delete) and `notes text` (session-level notes, if not already present)
    - `sessions`: drop existing `sessions_program_day_id_fkey` and re-add `FOREIGN KEY (program_day_id) REFERENCES program_days(id) ON DELETE SET NULL`
    - `user_profiles`: add `onboarding_status text NOT NULL DEFAULT 'pending' CHECK (onboarding_status IN ('pending','completed','skipped'))`
    - `user_settings`: add `permission_session_edits text NOT NULL DEFAULT 'approval_required'`
    - _Design: Components §3, §4, §5; Data Models (programs, sessions, user_profiles, user_settings). Requirements: 3.8, 4.2, 4.12, 5.5_

  - [x] 1.3 Create migration `20250101000020` — `exercise-media` Storage bucket + read policy
    - Insert public bucket `exercise-media` (`on conflict do nothing`)
    - Add `exercise_media_public_read` select policy on `storage.objects` for `bucket_id = 'exercise-media'`; writes via `service_role` only
    - _Design: Components §2b. Requirements: 2.4, 2.7, 2.8_

  - [x] 1.4 Apply migrations and regenerate database types
    - Run the migrations against the local database, then run `npm run gen:types` to refresh `src/types/database.generated.ts`
    - Verify new columns/tables/enums appear in the generated types (used by all later tasks)
    - _Design: Architecture (New migrations start at 20250101000019); Overview implementation note_

- [x] 2. Checkpoint — schema baseline
  - Ensure migrations apply cleanly and generated types compile, ask the user if questions arise.

- [~] 3. Exercise library: import pipeline, mapper, and provenance
  - [x] 3.1 Implement free-exercise-db field mapper (pure)
    - Create the pure mapping function (in the import module / `src/services/exercise-display.ts` shared logic) mapping a source record to an `exercises` row: `external_ref`←`id`, `source='free-exercise-db'`, `source_license='Unlicense'`, `name` (trimmed), `primary_muscle_group`←`primaryMuscles[0]`, `secondary_muscle_groups`←`secondaryMuscles[]`, `explanation`/`instructions`←joined numbered `instructions[]`, `equipment` (`body only`→`bodyweight`), `level`/`mechanic`/`force`/`category` as-is, derived `description`, `is_global=true`, `user_id=null`; missing optional fields → null, never throws
    - _Design: Components §2c; Data Models (free-exercise-db field mapping). Requirements: 2.1, 2.2_

  - [ ]* 3.2 Write property test for the field mapper
    - **Property 4: Exercise import mapping is total and field-preserving**
    - **Validates: Requirements 2.1, 2.2**

  - [~] 3.3 Implement the one-time import script `scripts/import-free-exercise-db.ts`
    - Fetch/vendor `exercises.json` + referenced images; map via 3.1
    - De-dupe against existing global exercises by normalized name (`lower(trim(name))`, whitespace collapsed): update in place when matched, else insert global exercise
    - Upload each image to the `exercise-media` bucket at `{external_ref}/{index}.jpg`, insert `exercise_media` rows with `storage_path`, resolved `public_url`, `order_index`
    - Idempotent upsert on `(source, external_ref)` via `idx_exercises_source_ref`
    - _Design: Components §2c. Requirements: 2.1, 2.2, 2.4, 2.8_

  - [ ]* 3.3a Write integration test for the import pipeline
    - Populates description/explanation/media and de-dupes by normalized name against a mocked/in-memory client
    - _Design: Testing Strategy (Integration). Requirements: 2.1, 2.2_

- [ ] 4. Exercise library: display normalizer, attribution, and detail UI
  - [x] 4.1 Implement exercise display normalizer + attribution mapper (pure) in `src/services/exercise-display.ts`
    - Normalizer produces a complete view model from any combination of present/null new fields, substituting placeholders for missing fields, never throwing
    - Attribution mapper returns non-empty attribution text iff `source_license` mandates attribution (e.g. CC-BY-SA), empty for public-domain (Unlicense)
    - _Design: Components §2d; Error Handling (legacy/partial records). Requirements: 2.6, 2.8_

  - [ ]* 4.2 Write property test for legacy-record normalization
    - **Property 2: Legacy exercise records render without error**
    - **Validates: Requirements 2.6**

  - [ ]* 4.3 Write property test for attribution logic
    - **Property 3: Attribution is shown exactly when the source license requires it**
    - **Validates: Requirements 2.8**

  - [x] 4.4 Extend `src/services/exercise-library.ts` to load new fields + media
    - Select the new `exercises` columns and join/fetch `exercise_media` rows (ordered by `order_index`) for the detail view
    - _Design: Architecture (area 2 client); Components §2d. Requirements: 2.1, 2.2, 2.4_

  - [x] 4.5 Implement `src/components/exercise/ExerciseMedia.tsx`
    - Use `expo-image` (SDK 57) with `placeholder` and `onError` → placeholder fallback; lazy fetch on mount; disk cache serves offline, else placeholder with no thrown error
    - _Design: Components §2d; Error Handling (media load failure/offline). Requirements: 2.4, 2.5, 2.7_

  - [~] 4.6 Build the text-first exercise detail view
    - Render name, description, explanation, and muscle/equipment/level chips as text before media; guard on null for legacy records; render `ExerciseMedia` after text; show attribution when non-empty
    - _Design: Components §2d. Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [ ] 5. Exercise library: agent grounding (stays in catalog)
  - [x] 5.1 Implement `resolveExerciseIdOrThrow` in `supabase/functions/_shared/tool-handlers.ts`
    - Extend the existing `resolveExerciseId` to a shared resolver returning an id in the allowed set (`is_global = true OR user_id = :userId`) or throwing structured `{ error: 'exercise_not_in_catalog', name, suggestions: [...nearest by normalized/trigram name] }`; map to nearest match above a similarity threshold, else reject with suggestions
    - _Design: Components §2e; Interfaces (area 2); Error Handling (agent grounding). Requirements: 2.1, 4.9_

  - [ ]* 5.2 Write property test for the grounding resolver
    - **Property 5: The agent can never persist an exercise outside the catalog**
    - **Validates: Requirements 2.1, 4.9**

  - [x] 5.3 Wire `resolveExerciseIdOrThrow` into exercise-referencing tools
    - Use the shared resolver in `program_create`, `program_modify`, and (later) `exercise_instance_add` handlers so all exercise references validate against the catalog
    - _Design: Components §2e. Requirements: 2.1, 4.9_

  - [x] 5.4 Add the `get_exercises` retrieval tool
    - Define in `_shared/tool-definitions.ts` and implement handler in `_shared/tool-handlers.ts`; auto-executing (retrieval, not mutating); filters to the user's allowed set; supports `query` (name ilike), `muscle_group`, `equipment`, `limit`; returns `CatalogExerciseSummary[]`
    - Ensure `_shared/tool-executor.ts` classifies `get_exercises` as auto-execute (no approval)
    - _Design: Components §2e; Interfaces (area 2). Requirements: 2.1, 4.9_

  - [x] 5.5 Update the agent system prompt in `supabase/functions/agent-chat/index.ts` `getSystemPrompt()`
    - Instruct the agent to call `get_exercises` and only use exercise names it returns; call it first when unsure; never invent exercises
    - _Design: Components §2e. Requirements: 2.1, 4.9_

- [ ] 6. Checkpoint — exercise library + grounding
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Dock clearance primitives and application
  - [x] 7.1 Implement `src/hooks/useTabBarClearance.ts`
    - Returns `TabBarClearance + insets.bottom + 8 (MIN_GAP) + extra` using safe-area insets and the `TabBarClearance` constant from `src/constants/theme.ts`
    - _Design: Components §1. Requirements: 1.1, 1.4_

  - [ ]* 7.2 Write property test for clearance math
    - **Property 1: Dock clearance is inset-correct and always clears the dock**
    - **Validates: Requirements 1.1, 1.4**

  - [x] 7.3 Implement `src/components/ui/DockSpacer.tsx`
    - Zero-width view of clearance height (via `useTabBarClearance`) for use as the last child of scroll containers where `contentContainerStyle` padding can't be applied
    - _Design: Components §1. Requirements: 1.1, 1.3_

  - [x] 7.4 Apply clearance to the Start session fixed footer in `src/app/(tabs)/session/[dayId].tsx`
    - Apply `useTabBarClearance()` as the footer's bottom offset independent of scroll-content padding
    - _Design: Components §1 (screens to fix). Requirements: 1.4, 1.5_

  - [x] 7.5 Apply clearance to the Agent permissions screen `src/app/(tabs)/settings/permissions.tsx`
    - Ensure the bottom option clears the dock (scroll padding or bottom container offset)
    - _Design: Components §1 (screens to fix). Requirements: 1.6, 1.7_

  - [x] 7.6 Apply clearance across remaining audited `(tabs)` screens
    - Replace ad-hoc `TabBarClearance + insets.bottom` with `useTabBarClearance()`/`DockSpacer` on: `program/library.tsx`, `program/edit/[programId].tsx`, `program/index.tsx`, `session/index.tsx`, `session/freestyle.tsx`, `progress/*`, `settings/*`, `chat/index.tsx` (verify input dock offset), `journal/*`
    - _Design: Components §1 (audit of (tabs)). Requirements: 1.1, 1.2, 1.3, 1.7_

- [ ] 8. Program archive / hide / purge (service + UI + agent)
  - [x] 8.1 Extend `src/services/program-manager.ts` with archive/hide/purge/list
    - `setProgramHidden(client, userId, programId, hidden)`, `purgeProgram(client, userId, programId)` (hard delete; history preserved by `ON DELETE SET NULL` FK; validate ownership), extend `listPrograms(client, userId, { status?, includeHidden? })`; keep existing `archiveProgram`; archiving/purging the active program clears active designation (no auto-activate); typed `ProgramManagerError` on failure
    - _Design: Components §3; Error Handling (program delete failures). Requirements: 3.4, 3.6, 3.8, 4.12_

  - [ ]* 8.2 Write property test for the at-most-one-active invariant
    - **Property 6: At most one active program**
    - **Validates: Requirements 3.8**

  - [ ]* 8.3 Write property test for history preservation on archive/purge
    - **Property 7: Purging or archiving a program preserves logged history**
    - **Validates: Requirements 4.12**

  - [x] 8.4 Add program delete/archive/hide affordances in `src/app/(tabs)/program/library.tsx`
    - Per-row overflow/delete affordance → confirmation sheet naming the program; default action archive, secondary "Delete permanently" = purge; "Show hidden" toggle and "Hide" action for archived rows; cancel leaves unchanged; on failure keep row + error indication
    - _Design: Components §3 (UI affordances). Requirements: 3.1, 3.3, 3.5, 3.6_

  - [x] 8.5 Add program delete affordance in `program/edit/[programId].tsx` and `program/index.tsx`
    - Delete affordance for the current program with the same naming confirmation and archive/purge options
    - _Design: Components §3 (UI affordances). Requirements: 3.2, 3.3, 4.5_

  - [x] 8.6 Wire program delete to offline WAL + local cache
    - Enqueue `program_archive`/`program_hide`/`program_purge` WAL ops; remove/update the row locally immediately and reconcile on reconnect
    - _Design: Components §3 (offline); §4 (offline/sync). Requirements: 3.4, 3.7_

  - [ ]* 8.7 Write unit/edge tests for delete confirmation + failure
    - Confirmation dialog names the program (3.3); cancel retains program (3.5); delete failure retains row with error (3.6); delete removes from list within budget (3.4)
    - _Design: Testing Strategy (Unit/example, Edge-case, Integration). Requirements: 3.3, 3.4, 3.5, 3.6_

- [x] 9. Checkpoint — dock clearance + program delete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Manual + agent edit/delete: agent tools and classification
  - [x] 10.1 Add mutating tool definitions in `_shared/tool-definitions.ts`
    - `session_update`, `session_delete`, `exercise_instance_add`, `exercise_instance_update`, `exercise_instance_remove`, `program_archive`, `program_delete` (`mode: 'archive'|'purge'`, default `archive`)
    - _Design: Components §4 (new agent tools). Requirements: 4.9_

  - [x] 10.2 Implement handlers in `_shared/tool-handlers.ts`
    - `session_update` (started_at/completed_at/status/notes); `session_delete` as soft-delete (set `deleted_at`, keep `logged_sets`); `exercise_instance_add` (resolve via catalog grounding resolver), `exercise_instance_update`/`_remove` (instance fields on `program_day_items` only, never touching the catalog `exercises` row); `program_archive`, `program_delete` delegating to program-manager logic
    - _Design: Components §4 (entity distinction, history preservation). Requirements: 4.2, 4.3, 4.4, 4.9, 4.12_

  - [x] 10.3 Map new tools in `TOOL_PERMISSION_MAP` (`_shared/tool-executor.ts`)
    - Session tools → `session_edits` (new `permission_session_edits` category); exercise-instance + program tools → `program_edits`; all mutating tools return `pending_approval` and perform no DB mutation until approved
    - _Design: Components §4 (approval gate). Requirements: 4.10_

  - [ ]* 10.4 Write property test for approval-gate classification
    - **Property 10: Every mutating agent action routes through the approval gate**
    - **Validates: Requirements 4.9, 4.10**

  - [ ]* 10.5 Write property test for instance-edit catalog invariant
    - **Property 8: Editing an exercise instance never mutates the catalog exercise**
    - **Validates: Requirements 4.3, 4.4**

  - [ ]* 10.6 Write property test for session/instance delete history preservation
    - **Property 9: Deleting a session preserves its logged history**
    - **Validates: Requirements 4.12**

- [x] 11. Manual + agent edit/delete: UI affordances and offline sync
  - [x] 11.1 Add session edit/delete affordances on session screens
    - Visible edit + delete affordances wherever a session appears; edit modifies date/started_at/completed_at/status/session notes and persists on confirm; delete prompts confirmation, soft-deletes on confirm, leaves unchanged on cancel; affected views update within 2s
    - _Design: Components §4 (UI affordances). Requirements: 4.1, 4.2, 4.6, 4.7, 4.8, 4.14_

  - [x] 11.2 Add exercise-instance edit/delete affordances on program day / session screens
    - Visible edit + delete affordances per instance; edit modifies sets/reps/load/rest/instance notes only (not the catalog exercise) and persists on confirm; delete prompts confirmation; cancel leaves unchanged
    - _Design: Components §4 (entity distinction, UI affordances). Requirements: 4.3, 4.4, 4.6, 4.7, 4.8, 4.14_

  - [x] 11.3 Render agent approval + rejection for the new mutating tools in `src/app/(tabs)/chat/index.tsx`
    - Show approval card for `pending_approval` results; on reject, leave entity unchanged and show a "not applied" indication
    - _Design: Components §4 (approval gate + rejection). Requirements: 4.10, 4.11_

  - [x] 11.4 Extend WAL + sync for new entity op types
    - Add op types `session_update`, `session_soft_delete`, `program_day_item_update/insert/delete`, `program_archive`, `program_hide`, `program_purge` to `src/services/wal.ts` enqueue vocabulary and referential-integrity checks; ensure `src/services/sync-engine.ts` reconciles within 30s of reconnect; apply changes to `src/services/local-cache.ts` immediately
    - _Design: Components §4 (offline/sync). Requirements: 4.13, 4.14_

  - [ ]* 11.5 Write property test for offline/online convergence
    - **Property 11: Offline edits/deletes converge to the same server state as online**
    - **Validates: Requirements 3.7, 4.13**

  - [ ]* 11.6 Write integration/unit tests for edit persistence and cross-screen consistency
    - Edit round-trips (4.2, 4.4); change reflected on all affected screens (4.14); reject path leaves entity unchanged (4.11); tool-registry completeness (4.9)
    - _Design: Testing Strategy (Integration, Unit). Requirements: 4.2, 4.4, 4.9, 4.11, 4.14_

- [x] 12. Checkpoint — manual + agent edit/delete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. First-run onboarding
  - [x] 13.1 Extend `src/services/profile.ts` for onboarding state + patch logic
    - Add `setOnboardingStatus(userId, status)`, include `onboarding_status` in the profile type; implement pure predicates `shouldShowOnboarding(status)`, `canProceed`/`canComplete`/`canSkip`, and a partial-save patch builder that emits exactly the entered keys
    - _Design: Components §5 (persisted state, partial save, service). Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 5.7_

  - [ ]* 13.2 Write property test for the onboarding gate predicate
    - **Property 12: Onboarding never reshows once resolved**
    - **Validates: Requirements 5.1, 5.5**

  - [ ]* 13.3 Write property test for progression/skip predicates
    - **Property 13: Onboarding progression is never blocked by empty fields**
    - **Validates: Requirements 5.2, 5.3**

  - [ ]* 13.4 Write property test for the partial-save patch builder
    - **Property 14: Partial onboarding save writes exactly the entered fields**
    - **Validates: Requirements 5.6**

  - [x] 13.5 Build the multi-step skippable onboarding flow in `src/app/onboarding/`
    - Collect goal, experience_level, bodyweight + unit, injuries, equipment, preferred_training_days, weekly_frequency, training_notes; all fields optional; Skip present on every step incl. first and last; on complete write all values, on skip-after-entry persist entered fields; on write failure keep values in session, show error, leave status `pending`
    - _Design: Components §5 (flow component, partial save). Requirements: 5.2, 5.3, 5.4, 5.6, 5.7, 5.8_

  - [x] 13.6 Add the login-time onboarding gate in the authenticated layout
    - In `src/app/_layout.tsx` `RootLayoutNav` (or the `(tabs)` layout guard): after session active, fetch `onboarding_status`; if neither `completed` nor `skipped`, present the flow within 2s (short skeleton while fetching); never reshow once resolved
    - _Design: Components §5 (routing gate). Requirements: 5.1, 5.5_

  - [x] 13.7 Add "Re-run onboarding" action in `src/app/(tabs)/settings/profile.tsx`
    - Navigates to `/onboarding` regardless of current status without clearing existing values; confirm all onboarding fields remain viewable/editable here
    - _Design: Components §5 (settings integration). Requirements: 5.9, 5.10_

  - [ ]* 13.8 Write unit/edge tests for onboarding branches
    - Skip/submit/re-run branches (5.4, 5.7, 5.10); write-failure keeps status pending (5.8); status persists server-side across simulated reinstall (5.5)
    - _Design: Testing Strategy (Unit, Edge-case, Integration). Requirements: 5.4, 5.5, 5.7, 5.8, 5.10_

- [ ] 14. Model picker fixes
  - [x] 14.1 Implement pure selection/gating helpers in `src/services/model-catalog.ts`
    - `selectVisibleModels` (cap 5, curated-first then descending recency, preserve server recency order within group); `buildProviderEntry` producing a single collapsed "unavailable" entry when `!hasUserKey && curatedSelectableCount === 0`; selectability: BYOK → any shown model, non-BYOK → curated iff `hasBackendKey`
    - _Design: Components §6b, §6c, §6d. Requirements: 6.2, 6.3, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [ ]* 14.2 Write property test for collapse behavior
    - **Property 15: Fully-unavailable providers collapse to a single entry**
    - **Validates: Requirements 6.2, 6.3**

  - [ ]* 14.3 Write property test for the 5-cap + ordering
    - **Property 16: Provider model list is capped at 5, curated-first, recency-ordered**
    - **Validates: Requirements 6.5, 6.6, 6.7**

  - [ ]* 14.4 Write property test for BYOK/curated gating
    - **Property 17: Model selectability matches BYOK/curated gating**
    - **Validates: Requirements 6.8, 6.9**

  - [ ] 14.5 (Optional) Make `list-models` recency order deterministic
    - In `supabase/functions/_shared/model-catalog.ts` (used by `list-models`), return models most-recent-first per provider (or add an explicit `rank` hint) so client recency ordering is server-authoritative
    - _Design: Components §6c (recency source). Requirements: 6.6_

  - [x] 14.6 Rework `src/components/ModelPicker.tsx` for scroll + collapse + cap
    - Bound the list to a `flex: 1` region (fixed header + `flex: 1` scrollable list, or `FlatList`) so full content scrolls; render collapsed unavailable provider entries with "Add a key in Settings" message and no individual models; tapping navigates to `src/app/(tabs)/settings/api-keys.tsx`; render at most 5 selectable models per provider via `selectVisibleModels`
    - _Design: Components §6a, §6b, §6c. Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [ ]* 14.7 Write unit test for unavailable-tap navigation
    - Tapping a collapsed unavailable entry navigates to the Settings API keys screen (6.4)
    - _Design: Testing Strategy (Unit). Requirements: 6.4_

- [x] 15. Manual on-device verification (layout/scroll/CRUD — not unit-testable)
  - [x] 15.1 Author a manual verification checklist document under the spec folder
    - Dock clearance overlap + 8pt gap on every audited `(tabs)` screen (1.2, 1.3, 1.5, 1.6, 1.7); text-before-media render on exercise detail (2.3, 2.4); model list scrolls through full content (6.1); CRUD for programs/sessions/instances reflected across screens (4.14). Note: run on a notched iOS device and an Android device with a gesture bar to exercise `insets.bottom`
    - _Design: Testing Strategy (Manual device checks). Requirements: 1.2, 1.3, 1.5, 1.6, 1.7, 2.3, 2.4, 4.14, 6.1_

- [x] 16. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Optional / Nice-to-have (deferred, do not implement now)

- [ ]* 17.1 Richer generated beginner explanations
  - Generate a warmer plain-language `explanation` once at import time instead of joined step instructions; stored in the same column
  - _Design: Components §2c (optional); Deferred / Future. Requirements: 2.2_

- [ ]* 17.2 wger animated/video media follow-up
  - Import CC-BY-SA animations via wger into `exercise_media` (`kind` gif/video) with required attribution (attribution logic already covered by Property 3); no schema change needed
  - _Design: Deferred / Future. Requirements: 2.4, 2.8_

## Notes

- Tasks marked with `*` are optional (all test sub-tasks plus the deferred items in section 17) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references the specific design section(s) and requirement clause(s) it implements for traceability.
- Property-based tests use `fast-check` with a minimum of 100 iterations and are tagged `Feature: app-experience-improvements, Property {n}: {property text}` per the design Testing Strategy.
- Checkpoints ensure incremental validation at natural dependency boundaries.
- Edge-runtime caveat (see Overview): restart the local Supabase edge runtime after adding/changing functions or shared tool modules so they register locally.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "7.1", "14.1"] },
    { "id": 1, "tasks": ["1.4", "7.2", "7.3", "14.2", "14.3", "14.4", "14.5"] },
    { "id": 2, "tasks": ["3.1", "4.1", "5.1", "8.1", "13.1", "7.4", "7.5", "14.6"] },
    { "id": 3, "tasks": ["3.2", "3.3", "4.2", "4.3", "4.4", "5.2", "5.3", "5.4", "8.2", "8.3", "13.2", "13.3", "13.4", "7.6", "14.7"] },
    { "id": 4, "tasks": ["3.3a", "4.5", "5.5", "8.4", "8.5", "10.1", "13.5", "13.7"] },
    { "id": 5, "tasks": ["4.6", "8.6", "10.2", "13.6"] },
    { "id": 6, "tasks": ["8.7", "10.3", "11.1", "11.2"] },
    { "id": 7, "tasks": ["10.4", "10.5", "10.6", "11.3", "11.4", "13.8"] },
    { "id": 8, "tasks": ["11.5", "11.6"] },
    { "id": 9, "tasks": ["15.1"] }
  ]
}
```
