# Design Document

## Overview

This design covers six independent UX/capability improvements to the Cadence app (Expo React Native SDK 57 client + Supabase Postgres and Deno edge functions), building on the current architecture without re-platforming any subsystem:

1. **Dock clearance** — a reusable clearance primitive so the absolute-positioned `FloatingTabBar` never overlaps interactive controls, applied to both scroll content and fixed footers.
2. **Richer exercise library** — description, beginner-friendly explanation, and demonstration media per exercise, sourced from a **static one-time import of [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db)** (Unlicense / public domain), with images mirrored into Supabase Storage. Includes an agent grounding mechanism so the AI never suggests exercises outside the catalog.
3. **Program delete** — an **archive-first** model (soft-archive + hide + optional hard purge) that protects logged history.
4. **Manual + agent edit/delete** of sessions, exercise instances, and programs — new agent tools routed through the existing approval gate, plus UI affordances, distinguishing catalog-exercise edits from exercise-instance edits.
5. **First-run onboarding** — a skippable multi-step flow gated on a server-persisted `onboarding_status` that survives reinstall.
6. **Model picker fixes** — reliable scroll, collapsed unavailable providers, and a capped 5-per-provider curated-first ordering.

Two requirements-level open questions are resolved here and baked into the design:

- **Requirement 2 media source** → static import of free-exercise-db (public domain still images). wger (CC-BY-SA, includes video) is documented as a future animation source. See [Architecture](#exercise-media-source-decision) and [Deferred / Future](#deferred--future).
- **Requirement 3 delete-with-history** → archive-first with a guarded hard-purge path that preserves logged history by nulling `sessions.program_day_id`. See [Program Delete / Archive / Hide / Purge](#3-program-delete--archive--hide--purge).

### Research summary (media source)

<a name="exercise-media-source-decision"></a>
The three candidates from Requirement 2 were evaluated:

| Source | License | Content | Runtime dependency | Decision |
|---|---|---|---|---|
| wger REST API | AGPL-3.0 (data CC-BY-SA) | text + some video | Yes (runtime API) | Deferred (future animation option) |
| ExerciseDB-style GitHub datasets | Ranges AGPL-3.0 → commercial-only; per-repo verification required | animated GIFs, rich metadata | Import or runtime | Rejected (license risk / cost) |
| **yuhonas/free-exercise-db** | **Unlicense (public domain)** | ~800+ exercises, still JPG images (typically 2: start/end), step instructions, muscle/equipment/level/mechanic/force metadata | **No** (static import) | **Selected** |

Rationale: free-exercise-db is public domain (no attribution or share-alike obligation), removing all licensing risk for Requirement 2 criterion 8, and it can be imported once into our own database and Storage so there is no runtime third-party dependency, rate limit, or availability risk. The tradeoff is that its media are **still images (jpg), not GIF/video** — acceptable for a first release. Requirement 2 criterion 4 ("image and/or looping animation or video") is satisfied by still images. Animation via wger (CC-BY-SA, requires attribution) is deferred.

Even though this source imposes no attribution obligation, the schema stores `source` and `source_license` fields per exercise so a future CC-BY-SA source (wger) can be mixed in and attributed where mandated (satisfying criterion 8 generically).

## Architecture

The six areas touch three layers. This table is the map of where each change lives.

| Area | Client (`src/`) | Edge functions (`supabase/functions/`) | Database (`supabase/migrations/`) |
|---|---|---|---|
| 1. Dock clearance | `hooks/useTabBarClearance.ts` (new), `components/ui/DockSpacer.tsx` (new); apply across `(tabs)` screens | — | — |
| 2. Exercise library | `services/exercise-library.ts` (extend), exercise detail UI, `components/exercise/ExerciseMedia.tsx` (new) | `get_exercises` retrieval tool; validation in program/session tools; system prompt update | `19` schema cols + `exercise_media` table; `20` Storage bucket + policies; import script/seed |
| 3. Program delete/archive/hide/purge | `services/program-manager.ts` (extend), `program/library.tsx`, `program/edit/[programId].tsx`, `program/index.tsx` | `program_archive`, `program_delete` tools | `19` `programs.hidden` column |
| 4. Manual + agent edit/delete | session/program/exercise-instance UI affordances; WAL ops | `session_update`, `session_delete`, `exercise_instance_add/update/remove`, `program_archive`, `program_delete` tools + handlers + permission map | (uses tables above; `sessions.program_day_id` already nullable since migration 8) |
| 5. Onboarding | `app/onboarding/` flow, gate in `app/_layout.tsx`/`(tabs)` layout, `settings/profile.tsx` re-run action, `services/profile.ts` (extend) | — | `19` `user_profiles.onboarding_status` column |
| 6. Model picker | `components/ModelPicker.tsx` (rework), `services/model-catalog.ts` | `list-models` ordering hint (optional), `_shared/model-catalog.ts` | — |

Key architectural principles preserved:

- **Edge functions self-authenticate** (`verify_jwt=false` per function in `supabase/config.toml`); all new tools live in `_shared/tool-handlers.ts` + `_shared/tool-definitions.ts` and are dispatched by `_shared/tool-executor.ts`, which already classifies each tool into a permission category and returns `pending_approval` vs `auto_applied`.
- **Approval gate**: every new *mutating* tool (session/instance/program edit and delete) maps to the `program_edits` (or appropriate) permission category so it flows through the existing `pending_approval` path handled client-side in `src/app/(tabs)/chat/index.tsx`. Retrieval tools (`get_exercises`) auto-execute.
- **Offline/sync**: manual edits/deletes flow through the existing WAL (`src/services/wal.ts`) + sync engine (`src/services/sync-engine.ts`) + local cache (`src/services/local-cache.ts`) where the entity is already synced through them; new entity op types are added to the WAL enqueue vocabulary.
- **New migrations start at `20250101000019`** (latest applied is `20250101000018`).

## Components and Interfaces

### 1. Dock clearance

**Problem.** `FloatingTabBar` (`src/components/ui/FloatingTabBar.tsx`) is `position: 'absolute'; bottom: 0` and renders over content. Its visual height is `TabBarClearance = 96` (`src/constants/theme.ts`) and it adds `paddingBottom: max(insets.bottom, Spacing.two)`. Screens currently hand-roll `paddingBottom: TabBarClearance + insets.bottom`, and some fixed footers (Start session button, permissions last row) omit it, so the dock overlaps them.

**Solution.** Two small reusable primitives so both scroll content and fixed footers share one source of truth:

```ts
// src/hooks/useTabBarClearance.ts (new)
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBarClearance } from '@/constants/theme';

const MIN_GAP = 8; // Requirement 1: >= 8pt gap above dock

/** Bottom offset a scroll content container or fixed footer must reserve
 *  to clear the floating dock: dock height + safe-area inset + 8pt gap. */
export function useTabBarClearance(extra = 0): number {
  const insets = useSafeAreaInsets();
  return TabBarClearance + insets.bottom + MIN_GAP + extra;
}
```

```tsx
// src/components/ui/DockSpacer.tsx (new)
// A zero-width view of clearance height, appended as the last child of a
// scroll content container when padding can't be applied to contentContainerStyle.
export function DockSpacer({ extra }: { extra?: number }) {
  const h = useTabBarClearance(extra);
  return <View style={{ height: h }} />;
}
```

Usage patterns:
- **Scroll content**: `contentContainerStyle={{ paddingBottom: useTabBarClearance() }}` (replaces ad-hoc `TabBarClearance + insets.bottom`). This adds the mandated 8pt gap (criteria 1, 3).
- **Fixed footer outside the scroll view** (e.g. Start session): the footer container uses `paddingBottom: useTabBarClearance()` on its bottom offset, independent of the scroll padding (criterion 4, 5).
- **Non-scrollable screens**: bottom container uses the same hook (criterion 7).

**Screens to fix (audit of `(tabs)`).** The design mandates auditing every `(tabs)` screen; the concrete initial fix list:
- `src/app/(tabs)/session/[dayId].tsx` — fixed "Start session" footer (criterion 5).
- `src/app/(tabs)/settings/permissions.tsx` — Agent permissions last option (criterion 6).
- `src/app/(tabs)/program/library.tsx`, `program/edit/[programId].tsx`, `program/index.tsx` — lists now gain delete/archive rows at the bottom.
- `src/app/(tabs)/session/index.tsx`, `session/freestyle.tsx`, `progress/*`, `settings/*`, `chat/index.tsx` (input dock already offsets; verify), `journal/*`.

Each screen is verified on device (see Testing Strategy) since exact overlap is a rendering property not fully unit-testable.

### 2. Exercise library

#### 2a. Schema changes (migration 19)

Extend `exercises` with descriptive/provenance columns and add a normalized `exercise_media` table (recommended over an inline `image_urls text[]` for extensibility to gifs/video later):

```sql
-- 20250101000019 (excerpt) — exercises enrichment
ALTER TABLE exercises
  ADD COLUMN description text,
  ADD COLUMN explanation text,          -- beginner-friendly explanation
  ADD COLUMN level text CHECK (level IS NULL OR level IN ('beginner','intermediate','advanced')),
  ADD COLUMN mechanic text,             -- 'compound' | 'isolation' | null
  ADD COLUMN force text,                -- 'push' | 'pull' | 'static' | null
  ADD COLUMN category text,             -- free-exercise-db 'category'
  ADD COLUMN source text,               -- e.g. 'free-exercise-db'
  ADD COLUMN source_license text,       -- e.g. 'Unlicense'
  ADD COLUMN external_ref text;         -- source slug/id for idempotent re-import

CREATE INDEX idx_exercises_source ON exercises(source) WHERE source IS NOT NULL;
CREATE UNIQUE INDEX idx_exercises_source_ref
  ON exercises(source, external_ref) WHERE source IS NOT NULL AND external_ref IS NOT NULL;

-- exercise_media: 1..N media per exercise, ordered, typed for future gif/video
CREATE TABLE exercise_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id uuid NOT NULL REFERENCES exercises ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'image' CHECK (kind IN ('image','gif','video')),
  storage_path text NOT NULL,           -- path within the 'exercise-media' bucket
  public_url text,                      -- resolved public URL (denormalized)
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_exercise_media_exercise_id ON exercise_media(exercise_id);
```

RLS: `exercise_media` is readable by `authenticated` (media belongs to global/public exercises); writes restricted to `service_role` (import only). Follows the grant pattern in migration 7/9.

#### 2b. Supabase Storage bucket (migration 20)

A **public** bucket `exercise-media`. We mirror images into it rather than hot-linking `raw.githubusercontent.com` at runtime — we own the assets (no rate-limit/availability risk). `exercise_media.storage_path` stores the object path; `public_url` stores the resolved public URL.

```sql
-- 20250101000020 (excerpt) — storage bucket + read policy
insert into storage.buckets (id, name, public) values ('exercise-media','exercise-media', true)
  on conflict (id) do nothing;
-- public read; writes via service_role only (import path)
create policy "exercise_media_public_read" on storage.objects
  for select using (bucket_id = 'exercise-media');
```

#### 2c. Import pipeline (one-time)

A Node/Deno import script (checked in under `scripts/import-free-exercise-db.ts`) or an admin-only edge function runs once:

1. Fetch the free-exercise-db `exercises.json` (or vendored copy) and the referenced image files.
2. For each source exercise, **map fields** onto our schema (see [Data Models](#free-exercise-db-field-mapping)).
3. **De-dupe** against existing seeded exercises by normalized name (`lower(trim(name))` with whitespace collapsed). If a global exercise with that normalized name already exists, update it in place (enrich description/explanation/media) rather than insert; otherwise insert a new global exercise (`is_global = true`, `user_id = null`).
4. Upload each image to the `exercise-media` bucket at a deterministic path (`{external_ref}/{index}.jpg`), then insert `exercise_media` rows with `storage_path`, resolved `public_url`, and `order_index`.
5. Idempotent via `idx_exercises_source_ref` (upsert on `(source, external_ref)`).

**Beginner-friendly explanation.** free-exercise-db provides step `instructions[]` but no separate simple explanation. Pragmatic approach (no over-engineering):
- `description` ← a short lead derived from metadata: `"{name} is a {level} {mechanic} {category} exercise targeting {primaryMuscles}."`
- `explanation` ← the joined step instructions, lightly formatted (numbered steps). This reads as a beginner-friendly how-to.
- (Optional, deferred) a richer generated explanation is noted in [Deferred / Future]; not required for this release.

#### 2d. Exercise detail UI (text-first, media lazy)

`ExerciseDetail` renders **text first** (name, description, explanation, muscle/equipment/level chips) so text is never blocked by media (criterion 3). Media renders in `components/exercise/ExerciseMedia.tsx`:
- Uses `expo-image` (SDK 57) with a `placeholder` and `onError` → placeholder fallback (criteria 5, 7).
- Lazy: media is fetched only when the detail view mounts; the text is already painted.
- Offline: `expo-image` disk cache serves previously viewed media; otherwise the placeholder shows and text renders without error (criterion 7).
- Records predating the new fields render available fields + placeholders, no error (criterion 6) — every new column is nullable and the UI guards on null.

#### 2e. Agent grounding (AGENT-STAYS-IN-LIBRARY)

Two mechanisms so the agent never emits an exercise absent from the catalog:

1. **Retrieval tool `get_exercises`** (new, in `tool-definitions.ts` + `tool-handlers.ts`), auto-executing (retrieval, not mutating). It searches the exercises table filtered to the user's allowed set (`is_global = true OR user_id = :userId`), returning `{ id, name, primary_muscle_group, equipment, level }[]`. Supports `query` (name ilike), `muscle_group`, `equipment`, `limit`.
2. **Server-side validation** in every tool that references an exercise by name — the existing `resolveExerciseId()` in `tool-handlers.ts` (used by `program_create` / `program_modify`) already throws `Exercise not found: "<name>"` when a name doesn't resolve to a global-or-owned row. This is the enforcement point. We extend it and the new `exercise_instance_add` handler to use the **same** resolver, and improve the thrown error to a structured, recoverable message the agent can act on (e.g. `{ error: 'exercise_not_in_catalog', name, suggestions: [...nearest by trigram/normalized name] }`). The handler either rejects or maps to the nearest catalog match above a similarity threshold; ambiguous cases reject with suggestions.
3. **System prompt update** in `agent-chat/index.ts` `getSystemPrompt()`: add an explicit instruction that the agent MUST call `get_exercises` and MAY only use exercise names returned by it; if unsure whether an exercise exists, call `get_exercises` first; never invent exercises.

#### Interfaces (area 2)

```ts
// get_exercises tool result item
interface CatalogExerciseSummary {
  id: string; name: string;
  primary_muscle_group: string;
  equipment: string | null; level: string | null;
}
// resolver (extended, in tool-handlers.ts)
async function resolveExerciseIdOrThrow(
  supabase, userId, name
): Promise<string>; // throws structured exercise_not_in_catalog with suggestions
```

### 3. Program delete / archive / hide / purge

**Model: archive-first.** "Delete" from UI or agent defaults to **soft-archive**; a separate explicit **purge** path exists for permanent removal.

- **Archive** = set `programs.status = 'archived'` (reuses the existing enum; `archiveProgram()` already exists in `src/services/program-manager.ts`). Preserves `program_days`, `program_day_items`, and all linked `sessions`/`logged_sets`. Archiving the active program frees the partial unique index `idx_one_active_program_per_user`; **nothing auto-activates** — the user picks the next active program (criterion 3.8: active designation cleared).
- **Hide** = new `programs.hidden boolean NOT NULL DEFAULT false`. Lets users declutter the archived list without destroying data. `listPrograms()` gains a `includeHidden` filter; default archived view excludes hidden, with a "Show hidden" toggle.
- **Purge** (hard delete) = delete the `programs` row; `program_days`/`items`/`blocks` cascade (all `ON DELETE CASCADE`). **History-preservation handling** (Requirement 4.12): `sessions.program_day_id` references `program_days` **without** `ON DELETE CASCADE` and became **nullable in migration 8**. Therefore purging a program whose days are referenced by sessions would violate the FK.

  **Chosen behavior:** before deleting `program_days`, **null out `sessions.program_day_id`** for the affected days (via migration-defined `ON DELETE SET NULL` on that FK, applied in migration 19, plus an explicit service step for clarity). This preserves the `sessions` rows and their `logged_sets` as an independent record of past activity (criterion 4.12) while allowing the program structure to be purged.

  *Justification vs alternatives:* (a) blocking purge when history exists would trap users with permanent clutter; (c) forcing archive-only removes the "silent deletion" the user explicitly asked for. Nulling `program_day_id` is the only option that both permanently removes the program structure and keeps the logged history — matching the requirement exactly. We convert the FK to `ON DELETE SET NULL` so the invariant holds at the database level, not just in application code.

```sql
-- 20250101000019 (excerpt) — hidden flag + preserve-history FK
ALTER TABLE programs ADD COLUMN hidden boolean NOT NULL DEFAULT false;

-- Re-point sessions.program_day_id FK to SET NULL so purging a program keeps sessions.
ALTER TABLE sessions DROP CONSTRAINT sessions_program_day_id_fkey;
ALTER TABLE sessions
  ADD CONSTRAINT sessions_program_day_id_fkey
  FOREIGN KEY (program_day_id) REFERENCES program_days(id) ON DELETE SET NULL;
```

**Service functions** (`src/services/program-manager.ts`, extend):

```ts
archiveProgram(client, userId, programId): Promise<Program>   // existing; sets status='archived'
setProgramHidden(client, userId, programId, hidden): Promise<Program>  // new
purgeProgram(client, userId, programId): Promise<void>        // new; hard delete, history preserved by FK
listPrograms(client, userId, filter: { status?, includeHidden? }): Promise<Program[]>  // extend
```

**UI affordances.**
- `program/library.tsx`: each row gets an overflow/delete affordance → confirmation sheet. Default action = archive; a secondary "Delete permanently" option in the sheet = purge. A "Show hidden" toggle and a "Hide" action for archived rows.
- `program/edit/[programId].tsx` and `program/index.tsx`: a delete affordance for the current program with the same confirmation.
- **Confirmation UX**: a destructive confirm dialog that **names the program** and requires a distinct confirm action (criterion 3.3). Cancel leaves it unchanged (3.5). On failure, the program stays in the list with an error indication (3.6).
- **Offline** (3.7): archive/hide/purge enqueue through the WAL and reconcile on reconnect; the row is removed/updated locally immediately.

### 4. Manual and agent edit/delete for sessions, exercise instances, programs

**Entity distinction (critical).**
- **Catalog exercise** = a row in `exercises` (shared library). Edited via `exercise-library.ts` (already rejects editing global exercises).
- **Exercise instance** = a `program_day_items` row (Glossary's "Exercise_Instance") carrying instance fields (`target_sets`, `target_reps`, `target_weight`, `target_rpe`, `timer_config`, `notes`). Editing an instance **never** mutates the shared catalog exercise (criterion 4.3).
- **Session** = a `sessions` row; editable fields per criterion 4.2: date/`started_at`, `completed_at`, session notes, `status` (`in_progress`/`completed`). (Session-level notes column added if absent — see Data Models.)

**New agent tools** (`tool-definitions.ts`) + handlers (`tool-handlers.ts`) + permission mapping (`tool-executor.ts` `TOOL_PERMISSION_MAP`). All are **mutating** → classified so they return `pending_approval` (criterion 4.10):

| Tool | Category | Handler signature | Notes |
|---|---|---|---|
| `session_update` | `health_access`* | `(supabase, userId, { session_id, updates })` | updates started_at/completed_at/status/notes |
| `session_delete` | `health_access`* | `(supabase, userId, { session_id })` | deletes session; `logged_sets` CASCADE — see 4.12 handling |
| `exercise_instance_add` | `program_edits` | `(supabase, userId, { program_id, day_number, exercise_name, updates })` | resolves via catalog resolver (grounding) |
| `exercise_instance_update` | `program_edits` | `(supabase, userId, { item_id, updates })` | instance fields only |
| `exercise_instance_remove` | `program_edits` | `(supabase, userId, { item_id })` | removes one `program_day_items` row |
| `program_archive` | `program_edits` | `(supabase, userId, { program_id })` | soft archive |
| `program_delete` | `program_edits` | `(supabase, userId, { program_id, mode })` | `mode: 'archive'\|'purge'` (default `archive`) |

\* Session mutation via the agent is gated; because there is no dedicated `session_edits` permission column today, session tools map to `health_access` (the category already covering session reads). Alternatively a new `permission_session_edits` column can be added in migration 19 — recommended for clarity; the design adds it and maps `session_update`/`session_delete` to a new `session_edits` category. (Either is acceptable; the migration adds the column so the mapping is explicit.)

**History preservation for session/instance delete (4.12).**
- Deleting an **exercise instance** (`program_day_items` row) does not touch `logged_sets` (which reference `exercises` + `sessions`, not the item) — history is inherently preserved.
- Deleting a **session** cascades `logged_sets` by the current schema. To satisfy 4.12 ("preserve the associated logged history"), session *delete* is defined as **soft-delete**: add `sessions.deleted_at timestamptz` (migration 19); "delete" sets `deleted_at` and hides the session from all lists/queries while keeping `logged_sets` intact as an independent record. Hard removal is not offered for sessions with logged history. Analytics queries filter `deleted_at IS NULL`.

**UI affordances (4.1–4.8, 4.14).** Every screen showing a session, exercise instance, or program gets visible edit (where applicable) and delete affordances, each with a confirmation prompt on destructive actions. On confirm, the change persists and all affected views update within 2 seconds via the shared local cache/store invalidation. On cancel, no change.

**Approval gate + rejection (4.10, 4.11).** Agent-initiated mutations return `pending_approval` from `tool-executor.ts`; `chat/index.tsx` renders the approval card. Reject → entity unchanged + "not applied" indication.

**Offline/sync (4.13).** Confirmed edits/deletes enqueue WAL ops (new op types: `session_update`, `session_soft_delete`, `program_day_item_update/insert/delete`, `program_archive`, `program_hide`, `program_purge`) and reconcile within 30s of reconnect via the sync engine. WAL referential-integrity checks (`src/services/wal.ts`) are extended to know these entity kinds.

### 5. First-run onboarding

**Persisted state.** Add `user_profiles.onboarding_status text NOT NULL DEFAULT 'pending' CHECK (onboarding_status IN ('pending','completed','skipped'))` (migration 19). Stored on `user_profiles` (not local storage) so it survives reinstall and cross-device login (criterion 5.5). `user_profiles` already has one row per user with a server-side UNIQUE on `user_id`.

**Flow component.** `src/app/onboarding/` — a multi-step, skippable flow collecting the exact `user_profiles` fields (goal, experience_level, bodyweight + unit, injuries, equipment, preferred_training_days, weekly_frequency, training_notes). All fields optional; empty never blocks progression/completion/skip (5.2). A **Skip** action is present on every step including first and last (5.3).

**Routing gate.** Mounted in the authenticated tree. The cleanest insertion point is `src/app/_layout.tsx` `RootLayoutNav` (which already redirects on `session`), or an equivalent guard in the `(tabs)` layout: after the session becomes active, read `onboarding_status`; if it's neither `completed` nor `skipped`, present the flow within 2s (5.1). Because the status is fetched from the server, the guard waits for that fetch (with a short skeleton) before deciding, and never reshows once resolved.

**Partial save (5.6, 5.8).** On skip-after-entry, persist every entered field to `user_profiles` and leave non-entered fields empty. On completion, write all collected values (5.7). If the write of values *or* of `onboarding_status` fails: keep entered values in session state, show an error, and **do not** record the status as resolved (5.8) — so the flow will present again next launch.

**Settings integration.** All onboarding fields are already editable at `src/app/(tabs)/settings/profile.tsx` (5.9). Add a **"Re-run onboarding"** action there that navigates to `/onboarding` regardless of current status (5.10); re-running does not clear existing values.

**Service** (`src/services/profile.ts`, extend): `setOnboardingStatus(userId, status)` and inclusion of `onboarding_status` in the profile type; `updateUserProfile` already does partial writes.

### 6. Model picker fixes

Rework `src/components/ModelPicker.tsx`; helper logic factored into pure functions for testability (in `src/services/model-catalog.ts`).

**6a. Scroll reliability (6.1).** The modal sheet has `maxHeight: '75%'`; the inner list is a `ScrollView` with `flexGrow: 0`, which can fail to scroll inside a flex sheet. Fix: give the list a bounded, `flex: 1` region inside the sheet (sheet uses a column layout with a fixed header and a `flex: 1` list area), or replace with `FlatList` sized to fill remaining space. This guarantees full-content scroll.

**6b. Collapse fully-unavailable providers (6.2–6.4).** A provider is "fully unavailable" when `!hasUserKey && curatedSelectableCount === 0` (no user key AND none curated/backend-runnable). For such a provider, render a **single collapsed entry** ("OpenAI — unavailable") with a short "Add a key in Settings" message and NO individual models (6.3). Tapping it navigates to the Settings API keys screen (`src/app/(tabs)/settings/api-keys.tsx`) (6.4).

**6c. Cap 5 per provider, curated-first then recency (6.5–6.7).** Pure selector:

```ts
// src/services/model-catalog.ts (new pure helper)
export function selectVisibleModels(
  models: SelectableModel[], // already computed selectable/curated flags
): SelectableModel[] {
  const selectable = models.filter(m => m.selectable);
  const ordered = [...selectable].sort(compareCuratedThenRecency);
  return ordered.slice(0, 5); // <= 5 (6.5). 1..5 → all (6.7); >5 → exactly 5 (6.6)
}
```

**Recency source.** The `list-models` response order is the recency signal:
- OpenAI list is currently `.sort()` (ascending id) in `_shared/model-catalog.ts`; Anthropic is sorted newest-ish first. To make recency deterministic and correct, `list-models` returns models already ordered **most-recent-first per provider** (server sorts: OpenAI by descending id/date suffix where present, Anthropic by descending id which encodes date), OR includes an explicit `rank` hint. The client's `compareCuratedThenRecency` sorts curated-first, then preserves the server recency order. This keeps ordering logic server-authoritative and the client sort stable.

**6d. BYOK vs curated selection (6.8, 6.9).** Unchanged from current logic: BYOK users may select any shown model for a keyed provider; non-BYOK users may select only curated models. The collapse/cap operate on the already-computed `selectable` set so gating and display stay consistent.

## Data Models

### New / changed columns

**`exercises`** (migration 19 — all nullable, backward compatible with criterion 2.6):

| Column | Type | Notes |
|---|---|---|
| `description` | `text` | what the exercise is |
| `explanation` | `text` | beginner-friendly how-to (joined instructions) |
| `level` | `text` | `beginner`/`intermediate`/`advanced` |
| `mechanic` | `text` | `compound`/`isolation` |
| `force` | `text` | `push`/`pull`/`static` |
| `category` | `text` | source category |
| `source` | `text` | e.g. `free-exercise-db` |
| `source_license` | `text` | e.g. `Unlicense` |
| `external_ref` | `text` | source slug for idempotent import |

**`exercise_media`** (new table, migration 19): `id`, `exercise_id` (FK CASCADE), `kind` (`image`/`gif`/`video`), `storage_path`, `public_url`, `order_index`, `created_at`.

**`programs`** (migration 19): `hidden boolean NOT NULL DEFAULT false`.

**`sessions`** (migration 19): `deleted_at timestamptz` (soft-delete for history preservation); `notes text` (session-level notes for criterion 4.2, if not already present); FK `program_day_id` altered to `ON DELETE SET NULL`.

**`user_profiles`** (migration 19): `onboarding_status text NOT NULL DEFAULT 'pending' CHECK (onboarding_status IN ('pending','completed','skipped'))`.

**`user_settings`** (migration 19, optional-but-recommended): `permission_session_edits text NOT NULL DEFAULT 'approval_required'` to give session mutation tools their own approval category.

### free-exercise-db field mapping

<a name="free-exercise-db-field-mapping"></a>

| free-exercise-db field | Cadence target | Transform |
|---|---|---|
| `id` (slug) | `exercises.external_ref` | as-is; `source='free-exercise-db'`, `source_license='Unlicense'` |
| `name` | `exercises.name` | trim; used for normalized de-dupe |
| `primaryMuscles[]` | `exercises.primary_muscle_group` | first element (`primaryMuscles[0]`), normalized |
| `secondaryMuscles[]` | `exercises.secondary_muscle_groups` | array copy |
| `instructions[]` | `exercises.instructions` and `explanation` | join steps (numbered) |
| `equipment` | `exercises.equipment` | as-is (e.g. `barbell`, `dumbbell`, `body only`→`bodyweight`) |
| `level` | `exercises.level` | as-is |
| `mechanic` | `exercises.mechanic` | as-is |
| `force` | `exercises.force` | as-is |
| `category` | `exercises.category` | as-is |
| (derived) | `exercises.description` | `"{name} is a {level} {mechanic} {category} exercise targeting {primaryMuscles[0]}."` |
| `images[]` (jpg paths) | `exercise_media` rows | upload each to `exercise-media` bucket; `kind='image'`, `order_index=i` |
| — | `exercises.is_global` | `true` |
| — | `exercises.user_id` | `null` |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

We apply property-based testing to the **pure-logic** parts of this feature: the dock-clearance math, the exercise field mapper and legacy-record normalizer, the agent catalog-grounding resolver, the approval-gate classification, the program-state invariants, the onboarding gate/patch logic, and the model-picker selection/gating. It does **not** apply to rendered layout/overlap, CRUD round-trips, navigation, or cross-screen refresh — those are covered by example, edge-case, integration, and manual device tests in the Testing Strategy.

After prework, several overlapping checks were consolidated so each behavior is verified once: the model-picker collapse behavior, the five-model cap together with its ordering rule, the BYOK versus non-BYOK gating, the offline-sync round-trip guarantee, and the preservation of logged history when sessions and exercise instances are removed.

### Property 1: Dock clearance is inset-correct and always clears the dock

*For all* non-negative safe-area bottom insets and non-negative `extra` values, `useTabBarClearance(extra)` equals `TabBarClearance + inset + 8 + extra`, and is always `>= TabBarClearance + inset` (guaranteeing the mandated 8pt gap for scroll content and fixed footers alike).

**Validates: Requirements 1.1, 1.4**

### Property 2: Legacy exercise records render without error

*For all* exercise records with any combination of the new fields (`description`, `explanation`, `level`, `mechanic`, `force`, `category`, `source`, `source_license`, media) present or null, the display-normalizer produces a complete view model without throwing, substituting placeholders for every missing field.

**Validates: Requirements 2.6**

### Property 3: Attribution is shown exactly when the source license requires it

*For all* exercises, the computed attribution text is non-empty **iff** the exercise's `source_license` mandates attribution (e.g. CC-BY-SA), and empty for public-domain sources (e.g. Unlicense); the detail view renders attribution whenever that text is non-empty.

**Validates: Requirements 2.8**

### Property 4: Exercise import mapping is total and field-preserving

*For all* valid free-exercise-db source records, the field mapper returns an exercises row where `name`, `primary_muscle_group` (= `primaryMuscles[0]`), `secondary_muscle_groups`, `equipment`, `level`, `mechanic`, `force`, and `category` reflect the source values, `is_global = true`, `user_id = null`, and it never throws (missing optional source fields map to null).

**Validates: Requirements 2.1, 2.2**

### Property 5: The agent can never persist an exercise outside the catalog

*For all* catalogs (the user's allowed set = global exercises + that user's own) and *for all* exercise names an agent tool supplies, `resolveExerciseIdOrThrow` either returns an id that belongs to the allowed set or throws `exercise_not_in_catalog`; it never returns an id outside the allowed set. Consequently every persisted `program_day_items.exercise_id` created via an agent tool references a row in the allowed set.

**Validates: Requirements 2.1, 4.9**

### Property 6: At most one active program

*For all* sequences of archive, activate, and purge operations applied to a user's set of programs, the number of programs with `status = 'active'` is always at most one, and after archiving or purging the currently active program the count of active programs is zero (active designation cleared).

**Validates: Requirements 3.8**

### Property 7: Purging or archiving a program preserves logged history

*For all* programs that have linked sessions with logged sets, archiving the program leaves all sessions and `logged_sets` unchanged, and purging the program preserves every session and its `logged_sets` (the sessions' `program_day_id` is set to null rather than the rows being deleted).

**Validates: Requirements 4.12**

### Property 8: Editing an exercise instance never mutates the catalog exercise

*For all* exercise-instance (`program_day_items`) updates, the referenced catalog `exercises` row is identical before and after the update.

**Validates: Requirements 4.3, 4.4**

### Property 9: Deleting a session preserves its logged history

*For all* sessions with N logged sets, after a delete the session is soft-deleted (`deleted_at` set, hidden from lists) and the number of its `logged_sets` rows is still N; *for all* exercise-instance deletions, the count of the session's `logged_sets` is unchanged.

**Validates: Requirements 4.12**

### Property 10: Every mutating agent action routes through the approval gate

*For all* new mutating tools (`session_update`, `session_delete`, `exercise_instance_add`, `exercise_instance_update`, `exercise_instance_remove`, `program_archive`, `program_delete`), each has an entry in `TOOL_PERMISSION_MAP`, and when its permission category is `approval_required`, `executeToolCall` returns status `pending_approval` and performs no database mutation.

**Validates: Requirements 4.9, 4.10**

### Property 11: Offline edits/deletes converge to the same server state as online

*For all* sequences of confirmed program/session/instance edit and delete operations, applying them offline (enqueued to the WAL) and then synchronizing yields the same server state as applying the identical sequence online.

**Validates: Requirements 3.7, 4.13**

### Property 12: Onboarding never reshows once resolved

*For all* onboarding statuses, `shouldShowOnboarding(status)` is `false` when the status is `completed` or `skipped` and `true` only when it is `pending`.

**Validates: Requirements 5.1, 5.5**

### Property 13: Onboarding progression is never blocked by empty fields

*For all* combinations of filled and empty onboarding fields and *for all* valid step indices (including the first and last), `canProceed`, `canComplete`, and `canSkip` all return `true` (the skip control is always present and enabled).

**Validates: Requirements 5.2, 5.3**

### Property 14: Partial onboarding save writes exactly the entered fields

*For all* sets of entered onboarding values, the profile patch built for persistence contains exactly the keys the user entered and no others (untouched fields are neither written nor cleared).

**Validates: Requirements 5.6**

### Property 15: Fully-unavailable providers collapse to a single entry

*For all* provider catalogs where the user has no key and no model is curated-and-backend-runnable, the picker builder produces exactly one collapsed "unavailable" entry for that provider and zero individual model rows.

**Validates: Requirements 6.2, 6.3**

### Property 16: Provider model list is capped at 5, curated-first, recency-ordered

*For all* provider selectable-model lists, the visible list length equals `min(selectableCount, 5)`; no non-curated model precedes a curated model; and within each curated-ness group the relative order matches the server-provided recency order. When the selectable count is between 1 and 5, all selectable models are shown.

**Validates: Requirements 6.5, 6.6, 6.7**

### Property 17: Model selectability matches BYOK/curated gating

*For all* providers and models: when the provider `hasUserKey` is true, every model in that provider's list is selectable; when `hasUserKey` is false, a model is selectable **iff** it is `curated` and the provider `hasBackendKey`.

**Validates: Requirements 6.8, 6.9**

## Error Handling

- **Media load failure / offline (2.5, 2.7):** `ExerciseMedia` catches `onError` and missing-URL cases and renders a placeholder; text content always renders regardless of media state. No thrown errors bubble to the screen.
- **Legacy/partial records (2.6):** the display normalizer treats every new column as optional; nulls become placeholders.
- **Agent exercise grounding (Property 5):** `resolveExerciseIdOrThrow` returns a structured, recoverable error `{ error: 'exercise_not_in_catalog', name, suggestions }` so the model can retry with a catalog name or ask the user. Handlers surface this back through the tool result rather than crashing the stream.
- **Program delete failures (3.6):** service functions surface a typed `ProgramManagerError`; the UI keeps the row and shows an error indication. Purge validates ownership (`user_id`) before deleting; unauthorized/missing → typed error.
- **Purge vs history (4.12):** the `ON DELETE SET NULL` FK guarantees sessions survive at the DB layer even if application code is bypassed.
- **Approval-gate rejection (4.11):** `tool-executor.ts` never executes the handler on `approval_required`; on user rejection the client leaves the entity unchanged and shows "not applied". Every tool call is written to `audit_log` regardless of outcome (existing behavior).
- **Onboarding write failure (5.8):** if writing profile values *or* `onboarding_status` fails, the status remains `pending`, entered values stay in session state, and an error is shown; the flow reappears next launch.
- **Model catalog outages (6.x):** `fetchProviderCatalog` already returns `[]` on provider error so one provider's outage never breaks the picker; a provider with an empty live list and no curated set collapses to the unavailable entry (Property 15).
- **Offline sync conflicts (3.7, 4.13):** WAL entries that fail referential-integrity checks are marked failed and surfaced via the existing `SyncStatusBadge`; retriable entries reconcile on reconnect.

## Testing Strategy

**Dual approach.** Property-based tests verify the universal properties above; example, edge-case, integration, and manual device tests cover the rest.

**Property-based tests.** Use `fast-check` (TypeScript) — do not hand-roll generators. Minimum **100 iterations** per property. Each test is tagged `Feature: app-experience-improvements, Property {n}: {property text}` in a comment and references the design property. Targets:
- Property 1 — `useTabBarClearance` math (pure).
- Properties 2, 3, 4 — exercise display normalizer, attribution mapper, and free-exercise-db field mapper (pure functions in the import module / a `services/exercise-display.ts`).
- Property 5 — `resolveExerciseIdOrThrow` against generated catalogs + names (handler unit with an in-memory/mocked Supabase client).
- Properties 6, 7, 9 — program-state reducer / archive/purge/soft-delete logic modeled over generated program+session graphs (model-based test against a mocked client).
- Property 8 — instance-update invariant on the catalog row.
- Property 10 — classification test over the new tool names + `executeToolCall` with a mocked permission mode.
- Property 11 — model-based round-trip: apply op sequence offline (WAL) then sync vs online, assert equal server state (mocked backend).
- Properties 12, 13, 14 — onboarding gate predicate, progression/skip predicates, and patch builder (pure).
- Properties 15, 16, 17 — model-picker `buildProviderEntry` / `selectVisibleModels` / selectability gating (pure helpers in `services/model-catalog.ts`).

**Unit / example tests.** Confirmation-dialog contents (3.3), delete affordance presence (3.1, 3.2, 4.1, 4.5), cancel path (3.5, 4.8), reject path (4.11), tool-registry completeness (4.9), onboarding skip/submit/re-run branches (5.4, 5.7, 5.10), model-picker navigation on unavailable tap (6.4).

**Edge-case tests.** Media unavailable/offline placeholder (2.5, 2.7), delete failure retains row (3.6), onboarding write failure keeps status pending (5.8).

**Integration tests.** Import pipeline populates description/explanation/media and de-dupes by normalized name (2.1, 2.2); delete removes from list within budget (3.4, 4.7); edit persistence round-trips (4.2, 4.4); cross-screen consistency after edit (4.14); onboarding status persists server-side across a simulated reinstall (5.5); offline op syncs on reconnect (3.7, 4.13).

**Manual device checks (layout/scroll — not unit-testable).** Dock clearance overlap and 8pt gap on every audited `(tabs)` screen (1.2, 1.3, 1.5, 1.6, 1.7); text-before-media render on the exercise detail (2.3, 2.4); model list scrolls through full content on device (6.1). Run on both a notched iOS device and an Android device with a gesture bar to exercise `insets.bottom`.

## Deferred / Future

- **Animated / video exercise media** via [wger](https://wger.de) (data CC-BY-SA, includes video). The `exercise_media.kind` enum already includes `gif`/`video` and the schema carries `source`/`source_license`, so a future wger import can add animations to existing exercises and display the required CC-BY-SA attribution (Property 3 already covers the attribution logic). No schema change needed to add it later.
- **Richer beginner explanations.** The current `explanation` is derived from the source's step instructions. A future enhancement could generate a warmer, plain-language explanation once at import time and store it in the same column; deliberately out of scope now to avoid over-engineering.
- **Dedicated `session_edits` permission category.** Migration 19 adds `user_settings.permission_session_edits`; a future settings UI can expose it alongside the existing program/journal/spotify/health toggles.
