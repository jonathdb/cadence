# Implementation Plan: Cadence Fitness App

## Overview

This plan implements Cadence as a mobile-first fitness app using React Native + Expo v57 (Expo Router, Dev Client) with a Supabase backend. The implementation proceeds in logical phases: database schema and RLS first, then Edge Functions for server-side logic, followed by client-side services, UI screens, and testing. Phase 2 (route tracking) tasks are grouped at the end.

## Tasks

- [x] 1. Set up project infrastructure and core types
  - [x] 1.1 Install dependencies and configure testing framework
    - Install vitest, fast-check, and related testing packages as devDependencies
    - Configure vitest.config.ts for TypeScript with path aliases matching tsconfig
    - Create tests/ directory structure (unit/, property/, integration/, setup/)
    - Create tests/setup/test-helpers.ts with common test utilities
    - _Requirements: Design Testing Strategy_

  - [x] 1.2 Define core TypeScript interfaces and types
    - Create src/types/program.ts (Program, ProgramDay, ProgramDayItem, Block, TimerConfig)
    - Create src/types/session.ts (Session, LoggedSet, BlockCompletion)
    - Create src/types/exercise.ts (Exercise)
    - Create src/types/health.ts (RawHealthRecord, ImportedWorkout, ImportedSleepSummary, ImportedActivitySnapshot, ImportedHeartRateSummary, NormalizedHealthData)
    - Create src/types/permissions.ts (PermissionCategory, PermissionMode, AuditLogEntry)
    - Create src/types/chat.ts (ChatMessage, ToolCall)
    - Create src/types/route.ts (RoutePoint, Route — Phase 2 ready)
    - Create src/types/spotify.ts (SpotifyAuth)
    - _Requirements: 5.1, 5.2, 8.1, 10.3, 16.1_

  - [x] 1.3 Configure Supabase client and auth utilities
    - Update src/utils/supabase.ts with typed Supabase client using generated DB types
    - Create src/providers/AuthProvider.tsx with AuthState context (user, session, isLoading)
    - Implement email/password sign-up, login, logout, and session refresh
    - Handle email verification gating (require verification before full access)
    - Return generic error messages on auth failure (no email enumeration)
    - _Requirements: 27.1, 27.2, 27.3_

- [x] 2. Database schema and security
  - [x] 2.1 Create Supabase migration for core tables
    - Create supabase/migrations/ with initial migration SQL
    - Define tables: exercises, programs, program_days, program_day_items, blocks, sessions, logged_sets, block_completions, personal_records, user_settings, user_api_keys, user_spotify_tokens, chat_messages, journal_entries, audit_log, modification_history
    - Create partial unique index idx_one_active_program_per_user on programs(user_id) WHERE status = 'active'
    - Create activate_program(p_user_id, p_program_id) SECURITY DEFINER function for atomic program activation
    - _Requirements: 4.1, 4.2, 5.1, 5.2, 5.3_

  - [x] 2.2 Create Supabase migration for health data tables
    - Define tables: health_data_raw, imported_workouts, imported_sleep_summaries, imported_activity_snapshots, imported_heart_rate_summaries
    - Add appropriate indexes on user_id, provider, date, and synced_at columns
    - Add FK from normalized tables to health_data_raw via raw_record_id
    - _Requirements: 13.1, 13.2, 14.1, 14.2, 14.3_

  - [x] 2.3 Create Supabase migration for Row Level Security policies
    - Enable RLS on all user-owned tables
    - Create policies: users can only access own data (USING auth.uid() = user_id)
    - Create global exercise read policy (is_global = true OR auth.uid() = user_id)
    - Create global exercise write protection (prevent modify/delete of global exercises)
    - _Requirements: 28.1, 28.2, 7.3, 7.4_

  - [x] 2.4 Create Supabase migration for Vault-based API key encryption
    - Create get_user_api_key(p_user_id, p_provider) SECURITY DEFINER function
    - Ensure function is only callable from service_role (Edge Functions)
    - Store keys via Vault's Transparent Column Encryption
    - _Requirements: 3.2, 29.1, 29.2_

  - [x] 2.5 Create Supabase migration for Phase 2 route tracking tables
    - Enable PostGIS extension
    - Define routes table with geography(LineStringZ, 4326) column and GIST spatial index
    - Add point_stream JSONB column for full GPS data with timestamps
    - Add derived stat columns: distance_meters, duration_seconds, avg_pace, avg_speed, elevation_gain
    - Add FK to sessions and program_days
    - _Requirements: 32.1, 32.2, 33.1, 33.2_

  - [x] 2.6 Seed global exercise library
    - Create a seed migration or seed script with common exercises (name, primary muscle group, secondary muscle groups, instructions)
    - Mark all seeded exercises as is_global = true
    - _Requirements: 7.1_

- [x] 3. Checkpoint - Verify database schema
  - Ensure all migrations apply cleanly against local Supabase (`supabase db reset`), ask the user if questions arise.

- [x] 4. Edge Functions — Agent and API key management
  - [x] 4.1 Create agent-chat Edge Function
    - Create supabase/functions/agent-chat/index.ts
    - Accept user message + conversation context from authenticated user
    - Decrypt user's API key from Vault using get_user_api_key
    - Call OpenAI or Anthropic API with tool definitions
    - Return assistant response + any tool calls
    - Stream response chunks via Supabase Realtime channel
    - Handle errors: missing key → prompt re-entry, rate limit → 429, timeout → 30s
    - _Requirements: 1.1, 2.1, 2.2, 3.3_

  - [x] 4.2 Create tool-call execution framework in Edge Functions
    - Create supabase/functions/_shared/tool-executor.ts
    - Implement permission check: read user_settings for Permission_Category mode
    - If approval_required: return tool_call with status 'pending_approval'
    - If auto_apply: execute tool call, set status 'auto_applied'
    - Log every tool call to audit_log (timestamp, action_type, category, params, approval_status, outcome)
    - _Requirements: 2.3, 2.4, 23.1, 23.3, 23.4, 24.1_

  - [x] 4.3 Implement program tool calls (create, modify, activate)
    - Tool: program_create — insert program + program_days + items, set status 'draft'
    - Tool: program_modify — update active program, record modification_history (before/after state)
    - Tool: program_activate — call activate_program RPC function
    - All subject to program_edits Permission_Category
    - _Requirements: 1.2, 1.3, 1.4, 4.2, 5.3, 6.1, 6.2_

  - [x] 4.4 Implement journal and health summary tool calls
    - Tool: journal_draft — create journal_entry with agent_drafted = true
    - Tool: get_recovery_summary — return normalized health data summary (sleep, HRV, activity)
    - Tool: get_recent_workouts_summary — return recent imported workouts summary
    - Journal drafts subject to journal_edits Permission_Category
    - Health tools return only normalized Cadence-owned summaries, never raw records
    - _Requirements: 15.2, 22.3_

  - [x] 4.5 Implement Spotify tool calls
    - Tool: spotify_search_playlist — search for playlists
    - Tool: spotify_create_playlist — create new playlist
    - Tool: spotify_modify_playlist — add/remove tracks
    - All subject to spotify_actions Permission_Category
    - Handle token refresh server-side; prompt reconnect if refresh fails
    - _Requirements: 26.1, 26.2, 26.3_

- [x] 5. Checkpoint - Verify Edge Functions
  - Ensure all Edge Functions compile and deploy to local Supabase, ask the user if questions arise.

- [x] 6. Vertical slice — core agent loop end-to-end
  - [x] 6.1 Wire auth flow (login) → settings (API key entry) → agent chat (send message, receive response) → program proposal display → approve program → verify program saved as active
    - This is a minimal integration proving the hardest architecture path works before full build-out
    - Covers: user authenticates, enters API key, sends chat message, Edge Function calls AI, response streams back, program tool call is proposed, user approves, program is activated
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 3.1, 3.3, 4.1, 27.1_

- [x] 7. Client-side services — Core logic
  - [x] 7.1 Implement PR detection service
    - Create src/services/pr-detection.ts
    - Implement Brzycki formula: weight × (36 / (37 - reps))
    - Check set against full exercise history for: best weight, best reps at weight, best estimated 1RM
    - Return PRResult with is_pr, pr_type, previous_best, new_best
    - Run client-side against cached history; confirm server-side on session completion
    - _Requirements: 20.1, 20.2, 20.3_

  - [ ]* 7.2 Write property test for PR detection
    - **Property 15: PR Detection Correctness**
    - Generate random exercise histories and new sets
    - Verify PR detected if and only if set value exceeds all prior values for that PR type
    - **Validates: Requirements 20.1, 20.2**

  - [x] 7.3 Implement volume calculator service
    - Create src/services/volume-calculator.ts
    - Calculate total session volume: sum of (reps × weight) for all logged sets
    - Calculate volume-by-muscle-group over a time window (grouped by exercise primary_muscle_group)
    - _Requirements: 11.1, 21.2_

  - [ ]* 7.4 Write property test for volume calculation
    - **Property 10: Volume Calculation Correctness**
    - Generate random logged sets, verify total volume equals sum(reps × weight)
    - **Property 16: Volume by Muscle Group Aggregation**
    - Generate random sessions with exercises of various muscle groups, verify grouping correctness
    - **Validates: Requirements 11.1, 21.2**

  - [x] 7.5 Implement timer service
    - Create src/services/timer.ts
    - Support all timer types: none, rest, countdown, interval, duration
    - Implement TimerState initialization from TimerConfig
    - Use setInterval for UI countdown tick
    - Schedule expo-notifications at timer start for background alert
    - Cancel scheduled notification if timer is manually stopped
    - Record actual duration and rounds on completion
    - _Requirements: 16.1, 18.1, 18.2, 19.1, 19.2_

  - [ ]* 7.6 Write property test for timer state consistency
    - **Property 13: Timer State Consistency**
    - Generate random valid TimerConfigs, verify correct initial TimerState (remaining_seconds, phase, round)
    - Verify completion records correct actual_duration and actual_rounds
    - **Validates: Requirements 16.1, 18.1, 18.2**

  - [x] 7.7 Implement session auto-fill service
    - Create src/services/auto-fill.ts
    - Implement priority chain: (1) most recent completed session for same ProgramDay, (2) broader exercise history, (3) program plan targets
    - Implement intra-session auto-fill: carry forward most recent set values, honor manual overrides
    - _Requirements: 9.1, 9.2, 9.3, 10.1, 10.2_

  - [ ]* 7.8 Write property tests for auto-fill logic
    - **Property 8: Session Auto-Fill Priority Chain**
    - Generate various history availability combinations, verify correct priority source selected
    - **Property 9: Intra-Session Set Auto-Fill**
    - Generate set sequences with/without overrides, verify carry-forward behavior
    - **Validates: Requirements 9.1, 9.2, 9.3, 10.1, 10.2**

  - [x] 7.9 Implement health data normalizer service
    - Create src/services/health/normalizer.ts
    - Transform raw HealthKit/Health Connect records into typed domain models
    - Handle missing fields gracefully (omit as null, no errors)
    - Preserve source metadata (provider, provider_record_id, timestamps, sync_status)
    - _Requirements: 14.1, 14.2, 13.2_

  - [ ]* 7.10 Write property test for health data normalization
    - **Property 11: Health Data Normalization Round-Trip**
    - Generate raw health records with random field presence/absence
    - Verify normalization succeeds without error and preserves metadata
    - **Validates: Requirements 13.2, 14.1, 14.2**

- [x] 8. Checkpoint - Verify core services and property tests
  - Ensure all tests pass (`vitest --run`), ask the user if questions arise.

- [x] 9. Client-side services — Permission, exercise, and Spotify
  - [x] 9.1 Implement permission service
    - Create src/services/permissions.ts
    - Read/write user_settings Permission_Categories from Supabase
    - Default all categories to 'approval_required' on new account creation
    - Provide helper to check permission mode for a given category
    - _Requirements: 23.1, 23.2, 23.3, 23.4_

  - [ ]* 9.2 Write property test for permission gating
    - **Property 2: Permission Gating**
    - Generate random tool calls × permission modes
    - Verify approval_required blocks without confirmation; auto_apply executes immediately
    - **Property 18: Default Permission Settings**
    - Verify new accounts always default to approval_required for all categories
    - **Validates: Requirements 2.3, 2.4, 23.2, 23.3, 23.4**

  - [x] 9.3 Implement exercise library service
    - Create src/services/exercise-library.ts
    - Search exercises: return global + user's private, exclude other users' private
    - Create custom exercise: require name and primary_muscle_group, reject if missing
    - Prevent update/delete of global exercises
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2_

  - [ ]* 9.4 Write property tests for exercise validation
    - **Property 5: Exercise Search Completeness**
    - Generate exercises (global + multi-user private), verify correct visibility per user
    - **Property 6: Global Exercise Immutability**
    - Verify update/delete of global exercises always rejected
    - **Property 7: Exercise Validation**
    - Generate payloads with/without name and primary_muscle_group, verify rejection rules
    - **Validates: Requirements 7.3, 7.4, 8.2**

  - [x] 9.5 Implement Spotify auth service
    - Create src/services/spotify.ts
    - Implement OAuth2 PKCE flow using expo-auth-session + expo-web-browser
    - Store tokens encrypted in Supabase (user_spotify_tokens)
    - Implement disconnect: revoke tokens, delete from DB
    - Request only scopes: playlist-read-private, playlist-modify-public, playlist-modify-private
    - _Requirements: 25.1, 25.2, 25.3_

  - [x] 9.6 Implement health provider adapter
    - Create src/services/health/adapter.ts
    - iOS: integrate @kingstinct/react-native-healthkit with Expo config plugin
    - Android: integrate react-native-health-connect with expo-health-connect config plugin
    - Implement import pipeline: fetch from SDK → store in health_data_raw → normalize into domain tables
    - Request minimum necessary permissions
    - Gracefully degrade if permissions denied (all features work without health data)
    - _Requirements: 12.1, 12.2, 12.3, 13.1, 14.1_

- [x] 10. UI Layer — Authentication and navigation
  - [x] 10.1 Create app layout and navigation structure
    - Update src/app/_layout.tsx with AuthProvider wrapping
    - Create authenticated tab layout (src/app/(tabs)/_layout.tsx)
    - Create auth screens group (src/app/(auth)/)
    - Implement route protection: redirect to auth if not authenticated
    - _Requirements: 27.1_

  - [x] 10.2 Create authentication screens
    - Create src/app/(auth)/login.tsx — email/password login form
    - Create src/app/(auth)/register.tsx — email/password registration form
    - Create src/app/(auth)/verify-email.tsx — email verification pending screen
    - Handle generic error messages (no email enumeration)
    - _Requirements: 27.1, 27.2, 27.3_

  - [x] 10.3 Create settings screens
    - Create src/app/(tabs)/settings/index.tsx — main settings screen
    - Create src/app/(tabs)/settings/api-keys.tsx — API key entry/management (never display saved keys)
    - Create src/app/(tabs)/settings/permissions.tsx — Permission_Category toggles (approval_required/auto_apply)
    - Create src/app/(tabs)/settings/spotify.tsx — Spotify connect/disconnect
    - Create src/app/(tabs)/settings/health.tsx — Health provider connect/permissions
    - _Requirements: 3.1, 3.2, 3.4, 23.1, 25.1, 12.1_

- [x] 11. UI Layer — Agent chat and program views
  - [x] 11.1 Create agent chat screen
    - Create src/app/(tabs)/chat/index.tsx
    - Display chat message thread (user/assistant messages)
    - Handle tool call presentation: show pending approval UI when approval_required
    - Show "API key required" message with navigation link if no key configured
    - Subscribe to Supabase Realtime for streaming responses
    - _Requirements: 1.1, 1.2, 2.3, 2.4, 3.3_

  - [x] 11.2 Create program view screens
    - Create src/app/(tabs)/program/index.tsx — active program overview (days, exercises, targets)
    - Create src/app/(tabs)/program/library.tsx — saved/archived programs list
    - Create src/app/(tabs)/program/[dayId].tsx — program day detail view
    - Show full program structure: days, exercises, sets, reps, targets, timer configs
    - Support program activation (archive current, activate new)
    - _Requirements: 1.2, 4.3, 5.1, 5.2_

- [x] 12. UI Layer — Session logging
  - [x] 12.1 Create session logging screen
    - Create src/app/(tabs)/session/[dayId].tsx — active session logging
    - Pre-populate values using auto-fill service (priority chain)
    - Display set logging interface: reps, weight, RPE, notes fields
    - Implement add-set with auto-fill from previous set in session
    - Show PR indicator immediately when PR detected
    - Display active timer UI when timer is running (countdown, round indicator, elapsed)
    - _Requirements: 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 18.1, 20.3_

  - [x] 12.2 Create end-of-session summary screen
    - Create src/app/(tabs)/session/summary.tsx
    - Display: total duration, total sets, estimated total volume, PRs achieved
    - Hide PR section when no PRs achieved
    - Offer journal entry creation option
    - _Requirements: 11.1, 11.2, 22.1_

  - [x] 12.3 Create timer defaults from history logic
    - When starting session, check for prior completed sessions for same ProgramDay
    - If found: default timer values from most recent completed session
    - If not found: use program plan presets
    - Allow manual override of timer presets
    - _Requirements: 17.1, 17.2, 17.3_

  - [x] 12.4 Implement imported cardio autofill in session UI
    - When a matching imported workout exists from HealthKit/Health Connect, offer to auto-fill cardio fields (distance, duration, pace, heart rate)
    - Visually label which values originated from the Health_Provider vs user-entered
    - _Requirements: 15.1, 15.3_

  - [ ]* 12.5 Write property test for timer defaults priority
    - **Property 14: Timer Defaults Priority**
    - Generate ProgramDays with/without prior sessions, verify correct timer source selected
    - **Validates: Requirements 17.1, 17.2**

  - [x] 12.6 Validate timer background alerts on physical devices
    - Test scheduled local notifications fire correctly when app is backgrounded and screen is locked on both iOS and Android physical devices
    - Verify sound plays and notification appears
    - _Requirements: 19.1, 19.2_

- [x] 13. UI Layer — Progression, journal, and audit
  - [x] 13.1 Create progression screens
    - Create src/app/(tabs)/progress/index.tsx — progression dashboard
    - Show per-exercise history (logged sets over time)
    - Show volume-by-muscle-group summary with selectable time window
    - Show activity summary (session frequency, total volume trends)
    - Activity summary counts only Cadence sessions (not passively imported unless linked)
    - _Requirements: 21.1, 21.2, 21.3_

  - [ ]* 13.2 Write property test for activity summary isolation
    - **Property 17: Activity Summary Isolation**
    - Generate mixed Cadence + imported sessions, verify only Cadence sessions counted
    - **Validates: Requirements 21.3**

  - [x] 13.3 Create journal screens
    - Create src/app/(tabs)/journal/index.tsx — journal entries list
    - Create src/app/(tabs)/journal/[id].tsx — journal entry detail/edit
    - Support free-text editing, agent-drafted entries editable before/after save
    - _Requirements: 22.1, 22.2, 22.3, 22.4_

  - [x] 13.4 Create audit log screen
    - Create src/app/(tabs)/settings/audit-log.tsx
    - Display all agent tool calls with: timestamp, action type, category, status, outcome
    - _Requirements: 24.1, 24.2_

- [x] 14. Checkpoint - Verify full MVP feature set
  - Ensure all tests pass, verify app builds without errors, ask the user if questions arise.

- [x] 15. Program state management and data integrity
  - [x] 15.1 Implement single active program logic on client
    - Create src/services/program-manager.ts
    - Activate program via supabase.rpc('activate_program', { p_user_id, p_program_id })
    - Handle program library (list saved, archived programs)
    - Verify constraint enforcement (at most one active at any time)
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 15.2 Write property test for single active program invariant
    - **Property 1: Single Active Program Invariant**
    - Generate random sequences of create/activate operations
    - Verify at most one program with status 'active' at any point
    - **Validates: Requirements 4.1, 4.2**

  - [x] 15.3 Implement modification history tracking
    - When program is modified (user or Agent), capture before/after state
    - Store in modification_history table with change_type, source, timestamps
    - _Requirements: 5.3, 6.2_

  - [ ]* 15.4 Write property test for modification history completeness
    - **Property 4: Modification History Completeness**
    - Generate random program modifications, verify exactly one history entry per modification
    - **Validates: Requirements 5.3, 6.2**

  - [x] 15.5 Implement audit log service
    - Create src/services/audit-log.ts
    - Write audit entry for every tool call (regardless of outcome)
    - Include: timestamp, action_type, permission_category, parameters, approval_status, outcome
    - _Requirements: 24.1, 24.2, 24.3_

  - [ ]* 15.6 Write property test for audit log completeness
    - **Property 19: Audit Log Completeness**
    - Generate random tool call executions, verify audit entry created for each
    - **Validates: Requirements 24.1**

- [x] 16. Account deletion and data cleanup
  - [x] 16.1 Implement user account deletion
    - Create supabase/functions/delete-account/index.ts or use DB cascade
    - Delete all user-owned data: audit_log, health records, API keys, journal entries, sessions, programs, Spotify tokens, chat messages, routes
    - Ensure cascade order respects FK constraints
    - _Requirements: 28.3_

- [x] 17. Phase 2 — Route tracking (Phase 2)
  - [x] 17.1 Background GPS feasibility spike
    - Compare Expo managed workflow (expo-location background updates) vs custom Expo dev client with a dedicated background geolocation library (e.g. react-native-background-geolocation)
    - Document findings, battery impact, accuracy, and recommend approach
    - Do NOT implement production code yet
    - _Requirements: 31.1, 31.2_

  - [x] 17.2 Implement route tracking service
    - Create src/services/route-tracking.ts
    - Implement the approach selected in 17.1
    - Record GPS coordinates (lat, lng, timestamp, elevation) until user stops
    - Continue tracking while backgrounded/screen locked
    - Compute derived stats: distance (haversine sum), duration, avg pace, avg speed, elevation gain
    - Store route via PostGIS geography column + point_stream JSONB
    - Fall back to pace/speed only if full stats unavailable
    - _Requirements: 30.1, 30.2, 30.3, 32.1, 32.2, 32.3_

  - [ ]* 17.3 Write property test for route statistics derivation
    - **Property 21: Route Statistics Derivation**
    - Generate random GPS point sequences with timestamps
    - Verify correct distance (haversine sum), duration (last - first timestamp), pace, speed
    - Verify graceful handling when elevation data missing
    - **Validates: Requirements 32.2**

  - [x] 17.4 Implement route-program integration
    - Allow ProgramDay to contain gym exercises, tracked route, or both
    - Link completed route to session and program_day
    - Make route history queryable by Agent via Tool_Calls (summary stats + optional full data)
    - _Requirements: 33.1, 33.2, 34.1, 34.2_

  - [x] 17.5 Create route tracking UI
    - Create src/app/(tabs)/session/route.tsx — live route tracking screen
    - Display live GPS tracking status, elapsed time, current distance
    - Start/stop controls
    - Show route summary on completion
    - _Requirements: 30.1, 30.2_

- [x] 18. Phase 2 — Spotify pace-based playlists (Phase 2)
  - [x] 18.1 Implement pace-based playlist suggestions
    - Extend Spotify tool calls to accept route history context (pace profile, distance, duration)
    - Agent considers route history when constructing playlist suggestions for running
    - _Requirements: 35.1_

- [x] 19. Final checkpoint - Full application verification
  - Ensure all tests pass (`vitest --run`), all Edge Functions deploy cleanly, app builds for iOS and Android, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based test sub-tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties defined in the design document
- The project uses Expo Dev Client (not Expo Go) due to HealthKit/Health Connect native SDK requirements
- All AI interactions run server-side in Edge Functions — the client never touches AI APIs directly
- Supabase Vault handles API key encryption; keys are decrypted only within Edge Functions
- Phase 2 tasks (17.x, 18.x) should only be started after MVP is stable
- Read Expo v57 docs at https://docs.expo.dev/versions/v57.0.0/ before implementing any Expo-specific code

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "2.4", "2.5", "2.6"] },
    { "id": 3, "tasks": ["4.1", "4.2", "7.1", "7.3", "7.5", "7.7", "7.9"] },
    { "id": 4, "tasks": ["4.3", "4.4", "4.5", "7.2", "7.4", "7.6", "7.8", "7.10"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["9.1", "9.3", "9.5", "9.6"] },
    { "id": 7, "tasks": ["9.2", "9.4", "10.1"] },
    { "id": 8, "tasks": ["10.2", "10.3", "11.1", "11.2"] },
    { "id": 9, "tasks": ["12.1", "12.2", "12.3", "12.4", "15.1", "15.3", "15.5"] },
    { "id": 10, "tasks": ["12.5", "12.6", "13.1", "13.3", "13.4", "15.2", "15.4", "15.6"] },
    { "id": 11, "tasks": ["13.2", "16.1"] },
    { "id": 12, "tasks": ["17.1"] },
    { "id": 13, "tasks": ["17.2", "18.1"] },
    { "id": 14, "tasks": ["17.3", "17.4", "17.5"] }
  ]
}
```
