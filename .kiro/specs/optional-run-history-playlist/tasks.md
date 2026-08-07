# Implementation Plan: Optional Run History Playlist

## Overview

This implementation adds a `session_context` parameter to `spotify_suggest_pace_playlist` so it works without route history, introduces four new read-only retrieval tools (`get_active_program`, `get_session_history`, `get_session_details`, `get_programs`), adds optional music preference seeds (`genres`, `seed_artists`, `seed_tracks`) with name resolution and retry-without-seeds fallback, updates the permission map, and modifies the system prompt to instruct the agent to use these tools proactively and incorporate music preferences. All changes are within the Supabase Edge Function layer (`supabase/functions/`).

## Tasks

- [x] 1. Add session context types and pace derivation logic
  - [x] 1.1 Create `SessionContext` interface and `deriveSessionPace` function in `tool-handlers.ts`
    - Define `SessionContext` interface with `session_type`, `planned_duration_minutes`, and `intensity_label`
    - Implement `deriveSessionPace` with base pace map and intensity adjustments
    - Throw descriptive error for unrecognized `session_type` values listing valid options
    - _Requirements: 5.1, 5.3, 5.4_

  - [ ]* 1.2 Write property test for `deriveSessionPace` correctness
    - **Property 1: Session type to pace mapping is correct**
    - **Validates: Requirements 3.2, 5.3**

  - [ ]* 1.3 Write property test for invalid session_type error
    - **Property 4: Invalid session_type produces descriptive error**
    - **Validates: Requirements 5.4**

- [x] 2. Update `spotify_suggest_pace_playlist` tool definition and handler
  - [x] 2.1 Update tool definition in `tool-definitions.ts`
    - Update description to state route history is optional and `activity_type` is the only required parameter
    - Add `session_context` object parameter with `session_type`, `planned_duration_minutes`, and `intensity_label` fields
    - Add `genres` parameter as optional array of strings (Spotify genre identifiers)
    - Add `seed_artists` parameter as optional array of strings (artist IDs or names)
    - Add `seed_tracks` parameter as optional array of strings (track IDs or names)
    - Update description to mention music preference seeds refine results via Spotify Recommendations API (max 5 combined seeds)
    - Remove any language conditioning invocation on route history presence
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.1, 11.1, 11.2, 11.3, 15.2_

  - [x] 2.2 Implement seed validation logic (`validateSeedCount`) in `tool-handlers.ts`
    - Create `MusicSeedsInput` and `ResolvedMusicSeeds` interfaces
    - Implement `validateSeedCount(genres, seedArtists, seedTracks)` that throws a descriptive error when the combined total exceeds 5, including counts per category and total in the message
    - _Requirements: 11.4, 11.5_

  - [x] 2.3 Implement name resolution functions in `tool-handlers.ts`
    - Implement `resolveArtistId(value, accessToken)`: if value matches 22-char alphanumeric pattern return as-is, otherwise search Spotify `/search?type=artist&limit=1` and return top result's ID or null
    - Implement `resolveTrackId(value, accessToken)`: if value matches 22-char alphanumeric pattern return as-is, otherwise search Spotify `/search?type=track&limit=1` and return top result's ID or null
    - Implement `resolveSeeds(genres, seedArtists, seedTracks, accessToken)`: resolve all artist/track names to IDs via `Promise.all`, filter out nulls, return `ResolvedMusicSeeds` object
    - Genres pass through without resolution (they are string identifiers)
    - _Requirements: 11.2, 11.3, 11.6_

  - [x] 2.4 Update `spotify_suggest_pace_playlist` handler to support fallback hierarchy and music seeds
    - Modify pace resolution logic: `targetPace ?? recentRouteSummary?.avg_pace_seconds_per_km ?? (sessionContext ? deriveSessionPace(sessionContext) : null)`
    - When `session_context` is used and no explicit pace or route summary given, include `effective_pace_seconds_per_km` in the response
    - Fall through to activity-type default BPM when no pace source is available
    - Call `validateSeedCount` at the start of the handler (throws if > 5)
    - If seeds are provided: resolve names → call Spotify Recommendations API with BPM range + seeds
    - If Recommendations API returns zero results with seeds: retry without seeds (BPM only) before falling through to BPM-widening
    - If no seeds provided: use existing playlist search logic with BPM range
    - Include `source` field in response indicating which path produced results (`recommendations_with_seeds`, `recommendations_without_seeds`, `playlist_search`)
    - Music seeds do not alter BPM range determination — they only refine track selection within the range
    - _Requirements: 4.1, 5.2, 5.3, 11.4, 11.6, 14.1, 14.2, 14.3, 14.4, 14.5, 15.1, 15.3, 15.4_

  - [ ]* 2.5 Write property test for fallback priority hierarchy
    - **Property 3: Fallback priority hierarchy for effective pace**
    - **Validates: Requirements 4.1, 5.2**

  - [ ]* 2.6 Write property test for activity-type default BPM ranges
    - **Property 2: Activity-type default BPM ranges**
    - **Validates: Requirements 3.3**

  - [ ]* 2.7 Write property test for combined seed count validation
    - **Property 9: Combined seed count validation**
    - **Validates: Requirements 11.4, 11.5**

  - [ ]* 2.8 Write property test for seeds coexisting with BPM range at all fallback levels
    - **Property 10: Seeds coexist with BPM range at all fallback levels**
    - **Validates: Requirements 11.6, 14.1, 14.2, 14.3, 14.4**

  - [ ]* 2.9 Write property test for music preferences not altering BPM range
    - **Property 11: Music preferences do not alter BPM range**
    - **Validates: Requirements 14.5**

  - [ ]* 2.10 Write property test for empty/absent seeds producing no seed parameters
    - **Property 12: Empty or absent seeds produce no seed parameters in API request**
    - **Validates: Requirements 15.1, 15.2, 15.3**

- [x] 3. Checkpoint - Validate pace derivation, playlist tool changes, and seed logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement `get_active_program` tool
  - [x] 4.1 Add `get_active_program` tool definition in `tool-definitions.ts`
    - Define tool with no required parameters
    - Description: retrieve user's currently active training program with full structure
    - _Requirements: 6.1_

  - [x] 4.2 Implement `get_active_program` handler in `tool-handlers.ts`
    - Query `programs` where `user_id = userId` and `status = 'active'`
    - Join `program_days` → `program_day_items` → `exercises` (name resolution)
    - Join `program_day_items` → blocks (name, type, timer_config)
    - Return full nested structure with `created_at`, `updated_at`
    - Return `{ active_program: null }` when no active program exists
    - Throw descriptive error on DB query failure
    - Register handler via `registerToolHandler`
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6, 6.7_

  - [ ]* 4.3 Write unit tests for `get_active_program`
    - Test returns null for user with no active program
    - Test resolves exercise names correctly
    - Test includes block items with name, type, and timer_config
    - Test includes created_at and updated_at timestamps
    - _Requirements: 6.2, 6.3, 6.5, 6.7_

- [x] 5. Implement `get_session_history` tool
  - [x] 5.1 Add `get_session_history` tool definition in `tool-definitions.ts`
    - Define tool with optional `limit` (integer 1-100, default 10) and optional `program_id` (string UUID)
    - Categorize under `health_access`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 5.2 Implement `get_session_history` handler in `tool-handlers.ts`
    - Validate `limit` is in range [1, 100]; return error if out of range
    - Query `sessions` where `user_id = userId` and `status = 'completed'`, ordered by `completed_at DESC`
    - Optionally filter by `program_id` (via `program_day_id` → `program_days.program_id`)
    - Compute aggregates per session: total sets, total volume (weight × reps), PR count
    - Return empty list for unauthorized `program_id` (no existence leakage)
    - Return empty list when no sessions match
    - Register handler via `registerToolHandler`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7, 7.8_

  - [ ]* 5.3 Write property test for session history ordering
    - **Property 5: Session history returns only owned completed sessions in descending order**
    - **Validates: Requirements 7.4**

  - [ ]* 5.4 Write property test for limit parameter validation
    - **Property 8: Session history limit parameter validation**
    - **Validates: Requirements 7.2**

- [x] 6. Implement `get_session_details` tool
  - [x] 6.1 Add `get_session_details` tool definition in `tool-definitions.ts`
    - Define tool with required `session_id` parameter (UUID string)
    - Categorize under `health_access`
    - _Requirements: 8.1, 8.2_

  - [x] 6.2 Implement `get_session_details` handler in `tool-handlers.ts`
    - Verify session belongs to authenticated user
    - Fetch `logged_sets` joined with `exercises.name`, ordered by exercise then set_number
    - Fetch `block_completions` joined with block name
    - Return grouped structure with session metadata (program_day_name, status, started_at, completed_at, total_duration_seconds)
    - Return error "Session not found" for non-existent or unauthorized session_id (no information leakage)
    - Register handler via `registerToolHandler`
    - _Requirements: 8.1, 8.3, 8.4, 8.6, 8.7_

  - [ ]* 6.3 Write unit tests for `get_session_details`
    - Test returns error for non-existent session
    - Test returns error for session belonging to different user
    - Test returns grouped sets by exercise with correct fields
    - Test includes block_completions
    - _Requirements: 8.6, 8.7_

- [x] 7. Implement `get_programs` tool
  - [x] 7.1 Add `get_programs` tool definition in `tool-definitions.ts`
    - Define tool with optional `status` parameter (enum: 'active', 'draft', 'archived', 'all'; default 'all')
    - Categorize under `program_edits`
    - _Requirements: 9.1, 9.2_

  - [x] 7.2 Implement `get_programs` handler in `tool-handlers.ts`
    - Validate `status` parameter; return descriptive error for invalid values listing valid options
    - Query `programs` where `user_id = userId` with optional status filter
    - For each program, count `program_days` (days_count) and completed `sessions` (sessions_count)
    - Return ordered by `updated_at DESC`
    - Return empty list when no programs match
    - Register handler via `registerToolHandler`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ]* 7.3 Write property test for programs ordering
    - **Property 6: Programs list is ordered by updated_at descending**
    - **Validates: Requirements 9.3**

  - [ ]* 7.4 Write property test for invalid status filter
    - **Property 7: Invalid status filter produces descriptive error**
    - **Validates: Requirements 9.7**

- [x] 8. Checkpoint - Validate all retrieval tools
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Update permission map and system prompt
  - [x] 9.1 Add new tools to `TOOL_PERMISSION_MAP` in `tool-executor.ts`
    - Add `get_active_program: 'program_edits'`
    - Add `get_programs: 'program_edits'`
    - Add `get_session_history: 'health_access'`
    - Add `get_session_details: 'health_access'`
    - _Requirements: 6.4, 7.5, 8.5, 9.4_

  - [x] 9.2 Update system prompt in `agent-chat/index.ts`
    - Remove conditioning of playlist tool on route history
    - Add instruction to use `get_active_program` before recommending playlists, exercises, or program modifications
    - Add instruction to use `get_session_history` for progress/trends/consistency queries
    - Add instruction to use `get_session_details` for specific past workout references
    - Add instruction to use `get_programs` for past program queries and comparisons
    - Add instruction to NOT ask user to describe program/sessions when retrievable via tools
    - Add instruction to proceed with conversational context when retrieval tools return empty
    - Add fallback hierarchy instructions (route history → user-stated pace → session_context → activity defaults)
    - Add instruction to include improvement note when using fallback levels 2, 3, or 4
    - Add music preference instructions: ask about genres/artists/tracks when user requests playlist and hasn't stated preferences
    - Add instruction to detect genre, artist, and song mentions in conversation and extract as Music_Preferences
    - Add instruction to pass detected preferences as `genres`, `seed_artists`, `seed_tracks` parameters
    - Add instruction that preferences are optional refinements — proceed without them if user declines
    - Add instruction to select at most 5 total seeds (most recently mentioned) and inform user of the limit
    - Add instruction to use most recent preference when user contradicts a previous one
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 4.2, 4.3, 4.4, 4.5, 4.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 12.1, 12.2, 12.3, 12.4, 13.4, 13.5_

  - [ ]* 9.3 Write unit tests for permission map and system prompt
    - Test permission map includes all 4 new tools in correct categories
    - Test system prompt contains instruction to use playlist tool without route condition
    - Test system prompt contains retrieval tool instructions
    - Test system prompt contains music preference detection instructions
    - Test system prompt contains max-5-seeds and contradiction-handling instructions
    - _Requirements: 6.4, 7.5, 8.5, 9.4, 1.3, 10.1, 12.1, 12.2, 12.3, 12.4_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All changes are within `supabase/functions/` — no mobile app changes required
- Test infrastructure: Deno test runner with fast-check for PBT (via esm.sh)
- Music preference tasks (2.2, 2.3, 2.4) are integrated into the existing playlist tool epic since they modify the same handler
- Properties 9-12 cover seed validation, BPM independence, fallback coexistence, and empty-seed behavior

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "4.1", "5.1", "6.1", "7.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "4.2", "5.2", "6.2", "7.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "4.3", "5.3", "5.4", "6.3", "7.3", "7.4"] },
    { "id": 3, "tasks": ["2.4", "2.5", "2.6", "2.7"] },
    { "id": 4, "tasks": ["2.8", "2.9", "2.10", "9.1"] },
    { "id": 5, "tasks": ["9.2"] },
    { "id": 6, "tasks": ["9.3"] }
  ]
}
```
