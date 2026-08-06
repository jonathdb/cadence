# Implementation Plan: Cadence V2 Roadmap

## Overview

This plan implements the Cadence V2 Roadmap across seven phases: critical bug fixes (tool call execution), offline-first session logging, manual CRUD & exercise library, client-side state management, progress visualization, UX polish (haptics, auto-timers, notifications), and subscription readiness. Each phase builds on the previous, with property-based tests validating correctness properties defined in the design. All code is TypeScript targeting Expo v57 + Supabase. Read https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Tasks

- [x] 1. Foundation: Generated Types, Validation Module, and Database Migrations
  - [x] 1.1 Add Supabase type generation script and generate types
    - Add `gen:types` script to `package.json` running `supabase gen types typescript`
    - Run the script to produce `src/types/database.generated.ts`
    - Delete the old manually maintained `src/types/database.ts`
    - Update all imports across the codebase to reference the generated file
    - _Requirements: 20.1, 20.2, 20.3_

  - [x] 1.2 Create Supabase migrations for entitlement tables, user_settings columns, and sessions nullable FK
    - Create migration for `entitlement_levels`, `feature_entitlements`, `user_entitlements` tables with indexes and seed data (free, premium)
    - Add columns to `user_settings`: `rest_timer_auto_start`, `weight_unit`, `notification_permission_status`, `health_connected`, `health_provider`
    - Alter `sessions` table to make `program_day_id` nullable (freestyle support)
    - Add RLS policies on all new tables enforcing `user_id = auth.uid()`
    - _Requirements: 21.1, 21.4, 22.1, 22.2, 28.1_

  - [x] 1.3 Implement input validation module
    - Create `src/lib/validation.ts` with `validateLoggedSet`, `validateProgramName`, `validateExercise` functions
    - Define all range constants (REPS_RANGE, WEIGHT_RANGE, RPE_RANGE, REST_TIMER_RANGE, etc.)
    - Return `ValidationResult` with field-level errors
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 7.4, 10.3_

  - [x]* 1.4 Write property tests for input validation (Property 10, 11)
    - **Property 10: Input Validation Ranges**
    - **Property 11: Program Validation**
    - Create `tests/properties/input-validation.property.test.ts`
    - Test reps, weight, RPE, rest timer, program name, exercise name validation across random inputs
    - **Validates: Requirements 7.1, 7.4, 7.5, 10.3, 18.1, 18.2, 18.3**

  - [x] 1.5 Implement error boundary component
    - Create `src/components/ErrorBoundary.tsx` wrapping root component tree
    - Create `src/components/AppCrashScreen.tsx` with "Retry" action
    - Create per-tab error boundary wrapper for isolated crashes
    - Log errors to console (dev) and structured log (production)
    - _Requirements: 19.1, 19.2, 19.3, 19.4_

  - [x] 1.6 Implement haptics service with platform graceful degradation
    - Create `src/services/haptics.ts` with `prAchieved`, `setLogged`, `setDeleted` functions
    - Guard all calls with `Platform.OS !== 'web'` check (no-op on unsupported platforms)
    - _Requirements: 14.1, 14.2, 14.3, 23.1_

  - [x]* 1.7 Write property test for platform graceful degradation (Property 24)
    - **Property 24: Platform Graceful Degradation for Haptics**
    - Create `tests/properties/haptics.property.test.ts`
    - Verify haptic calls never throw on web platform
    - **Validates: Requirements 23.1**

- [x] 2. Execute Tool Call Edge Function and Spotify Integration
  - [x] 2.1 Implement execute-tool-call Edge Function with handler registry
    - Create `supabase/functions/execute-tool-call/index.ts`
    - Implement JWT validation from Authorization header, extract user_id
    - Implement tool handler registry pattern with all registered tool names
    - Route incoming tool_call to matching handler, return result with tool_call_id
    - Return error with code + message for unrecognized tools (no internals exposed)
    - Enforce 5-second timeout on handler execution
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 28.3, 28.4_

  - [x]* 2.2 Write property tests for tool call routing and error safety (Property 1, 2)
    - **Property 1: Tool Call Routing Correctness**
    - **Property 2: Safe Error Responses**
    - Create `tests/properties/tool-call-routing.property.test.ts`
    - Verify routing dispatches to correct handler for any registered tool name
    - Verify error responses never contain stack traces, env vars, or internal names
    - **Validates: Requirements 1.1, 1.3, 1.4, 1.5, 28.4**

  - [x] 2.3 Implement entitlement check in tool call pipeline
    - Create `src/lib/entitlement.ts` with `checkEntitlement` function
    - Implement BYOK bypass logic (user with API key gets full access)
    - Default to free tier (rank 0) for users without entitlement record
    - Integrate check into execute-tool-call before handler dispatch
    - Return access-denied response with descriptive message when entitlement insufficient
    - _Requirements: 21.2, 21.3, 21.5_

  - [x]* 2.4 Write property test for entitlement access control (Property 23)
    - **Property 23: Entitlement Access Control**
    - Create `tests/properties/entitlement.property.test.ts`
    - Verify BYOK users always pass, free users blocked from premium features, rank comparison logic
    - **Validates: Requirements 21.2, 21.3, 21.5**

  - [x] 2.5 Implement Spotify OAuth flow on Settings screen
    - Create `src/app/(tabs)/settings/spotify.tsx` with Connect/Disconnect UI
    - Implement OAuth2 PKCE authorization flow for Spotify
    - Store access_token, refresh_token, expires_at, scopes in `user_spotify_tokens` table
    - Display connected account name and disconnect action
    - Implement token refresh logic and handle revoked tokens
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6_

  - [x] 2.6 Implement Spotify tool handlers in Edge Function
    - Add `handleSpotifySearch`, `handleSpotifyCreate`, `handleSpotifyModify`, `handleSpotifySuggestPace` to handler registry
    - Implement `getValidSpotifyToken` for server-side token refresh
    - Implement pace-to-BPM mapping (300-360→170-180, 360-420→150-165, >420→140-150)
    - Return error if Spotify tokens missing/invalid
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5_

  - [x]* 2.7 Write property test for pace-to-BPM mapping (Property 25)
    - **Property 25: Pace-to-BPM Mapping**
    - Create test in `tests/properties/tool-call-routing.property.test.ts` or separate file
    - Verify correct BPM range for any valid pace input
    - **Validates: Requirements 26.4**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Offline-First: Local WAL, Sync Engine, and State Store
  - [x] 4.1 Implement Local WAL with expo-sqlite
    - Create `src/services/wal.ts` implementing the `wal_entries` local SQLite schema
    - Implement `enqueue` method that persists WAL entries within 100ms
    - Implement referential integrity checks rejecting writes with invalid foreign keys
    - Implement status transitions: pending → syncing → synced/failed
    - _Requirements: 4.1, 4.6_

  - [x]* 4.2 Write property tests for WAL persistence and referential integrity (Property 5, 9)
    - **Property 5: WAL Persistence Completeness**
    - **Property 9: WAL Referential Integrity**
    - Create `tests/properties/sync-engine.property.test.ts`
    - Verify any valid session operation produces a correct WAL entry
    - Verify writes with invalid foreign keys are rejected
    - **Validates: Requirements 4.1, 4.6**

  - [x] 4.3 Implement Sync Engine with conflict resolution and retry logic
    - Create `src/services/sync-engine.ts` implementing `SyncEngine` interface
    - Implement `flush()` to transmit pending entries to Supabase
    - Implement last-write-wins conflict resolution comparing `client_timestamp` vs `server_updated_at`
    - Implement exponential backoff retry (1s → 2s → 4s → 8s → 16s, max 5 attempts)
    - Mark entries as `failed` after 5 attempts
    - Implement `onConnectivityChange` to trigger flush on reconnect
    - Complete all queued entries within 30 seconds of connectivity restoration
    - _Requirements: 4.2, 4.3, 4.5, 4.7_

  - [x]* 4.4 Write property tests for sync conflict resolution and backoff (Property 6, 8)
    - **Property 6: Last-Write-Wins Conflict Resolution**
    - **Property 8: Exponential Backoff and Failure Marking**
    - Add to `tests/properties/sync-engine.property.test.ts`
    - Verify correct winner for any timestamp pair, correct delay for attempt N, failure marking after 5 attempts
    - **Validates: Requirements 4.3, 4.5**

  - [x] 4.5 Implement Zustand State Store with WAL middleware
    - Create `src/store/index.ts` implementing `CadenceStore` interface
    - Implement `persist` middleware hydrating from expo-sqlite on app start
    - Implement `walMiddleware` intercepting mutations and writing WAL entries
    - Implement optimistic updates applied within 100ms of user action
    - Implement rollback on server rejection (revert to pre-mutation state)
    - Implement sync status tracking (pendingSyncCount, failedSyncCount)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [x]* 4.6 Write property tests for optimistic UI and rollback (Property 7, 19)
    - **Property 7: Optimistic UI Consistency**
    - **Property 19: Optimistic Rollback on Server Failure**
    - Create `tests/properties/state-store.property.test.ts`
    - Verify store reflects mutation immediately after WAL write
    - Verify store reverts to pre-mutation state on server rejection
    - **Validates: Requirements 4.4, 11.4, 11.5, 11.6**

  - [x] 4.7 Implement local SQLite cache schema for offline browsing
    - Create `src/services/local-cache.ts` with cache tables: `cached_programs`, `cached_chat_messages`, `cached_sessions`, `cached_exercises`
    - Implement cache read/write operations for each table
    - Cache active program structure (days, exercises, timer configs)
    - Cache most recent 100 chat messages
    - Cache session history and logged sets for progress
    - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Session Logging: Navigation, PR Detection, Set CRUD, and Freestyle
  - [x] 6.1 Implement session completion navigation to Summary Screen
    - Create `src/app/(tabs)/session/summary/[sessionId].tsx`
    - On session completion: persist to Local_WAL, navigate to Summary with session ID
    - Display total volume, duration (HH:MM:SS), PR count, exercise breakdown
    - Handle missing session data with error state and "Back to Sessions" navigation
    - Implement PR tap highlight (scroll to and flash the specific set)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x]* 6.2 Write property tests for volume calculation and PR highlight (Property 3, 29)
    - **Property 3: Session Volume Calculation**
    - **Property 29: PR Tap Highlight**
    - Create `tests/properties/volume-calculation.property.test.ts`
    - Verify total volume = sum(reps × weight) for any set collection
    - Verify PR count = count of sets where is_pr = true
    - **Validates: Requirements 2.2, 2.4**

  - [x] 6.3 Implement freestyle session start and in-session exercise management
    - Create `src/app/(tabs)/session/freestyle.tsx` for sessions without Program_Day
    - Implement add exercise from library (up to 50 per session)
    - Implement remove exercise (only if zero logged sets, else show error)
    - Implement skip exercise (only if zero logged sets, else show error)
    - Implement reorder exercises via drag-and-drop or move controls
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x]* 6.4 Write property tests for session exercise logic (Property 14, 15)
    - **Property 14: Exercise Removal and Skip Conditional**
    - **Property 15: Session Exercise Limit**
    - Create `tests/properties/session-logic.property.test.ts`
    - Verify removal/skip only permitted with zero logged sets
    - Verify add rejected when count = 50
    - **Validates: Requirements 8.3, 8.4, 8.5, 8.7, 8.8**

  - [x] 6.5 Implement set editing and deletion with undo
    - Add tap-to-edit on logged set entries (pre-filled edit form)
    - Re-run PR_Detection on set edits affecting reps/weight
    - Add swipe-left delete action with confirmation
    - Re-number remaining sets sequentially on deletion
    - Implement 5-second undo toast for deleted sets
    - Trigger appropriate haptic feedback on log/delete/PR
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 14.1, 14.2, 14.3_

  - [x]* 6.6 Write property tests for set re-numbering and PR re-detection (Property 16, 17)
    - **Property 16: Set Re-Numbering on Deletion**
    - **Property 17: PR Re-Detection on Set Edit**
    - Add to `tests/properties/session-logic.property.test.ts`
    - Verify remaining sets re-numbered 1..N with no gaps after any deletion
    - Verify PR detection re-runs on reps/weight edits
    - **Validates: Requirements 9.2, 9.4**

  - [x] 6.7 Implement session history list and continue session card
    - Create/update `src/app/(tabs)/session/index.tsx`
    - Display last 20 sessions sorted by date descending
    - Show program day name, date, duration, total sets for each entry
    - Tap completed session → navigate to Summary Screen
    - Display "Continue Session" card at top when in-progress session exists
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x]* 6.8 Write property test for session history ordering (Property 22)
    - **Property 22: Session History Ordering**
    - Create `tests/properties/ordering.property.test.ts`
    - Verify sessions sorted by date descending, limited to 20
    - **Validates: Requirements 16.1**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Manual Program CRUD and Exercise Library
  - [x] 8.1 Implement program creation and editing screen
    - Create `src/app/(tabs)/program/edit/[programId].tsx`
    - Implement form with program name (1-100 chars), add up to 14 days
    - Implement day add/edit/remove/reorder with drag-and-drop or move controls
    - Implement exercise add/edit/remove/reorder within each day (up to 20 per day)
    - Implement exercise config: target sets, reps, weight, RPE, rest timer, notes
    - Validate before save (non-empty name, at least 1 day with 1 exercise)
    - Display inline error indicators on invalid fields
    - Retain unsaved changes on network save failure
    - Allow editing programs with status "draft" or "active"
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [ ]* 8.2 Write property tests for ordering invariants and edit permission (Property 12, 13)
    - **Property 12: Sequential Ordering After Mutations**
    - **Property 13: Program Edit Permission**
    - Add to `tests/properties/ordering.property.test.ts`
    - Verify order indices are sequential 1..N after any add/remove/reorder sequence
    - Verify editing only permitted for draft/active status
    - **Validates: Requirements 7.2, 7.3, 7.9, 8.6**

  - [x] 8.3 Implement Exercise Library screen with search and custom exercises
    - Create `src/app/(tabs)/program/library.tsx`
    - Implement search with case-insensitive substring matching on name
    - Implement exact-match filtering by primary and secondary muscle groups
    - Search results returned within 200ms
    - Implement custom exercise creation (name, primary muscle group, secondary groups, instructions)
    - Implement custom exercise editing and deletion (with confirmation if in use)
    - Display empty-state with "Create custom exercise" option when no results
    - Seed or reference 300+ global exercises covering all major muscle groups
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_

  - [ ]* 8.4 Write property test for exercise search (Property 18)
    - **Property 18: Exercise Search Substring Matching**
    - Create `tests/properties/exercise-search.property.test.ts`
    - Verify all results contain query as case-insensitive substring
    - Verify muscle group filter produces exact matches only
    - **Validates: Requirements 10.2**

  - [x] 8.5 Implement Last Session quick-view on Program Day cards
    - Create `src/hooks/useLastSession.ts` hook querying cached or remote sessions
    - Create `src/components/LastSessionCard.tsx` component
    - Display date, total sets, total volume, PR count on Program_Day cards
    - Display "No previous session" when no completed session exists
    - _Requirements: 17.1, 17.2_

  - [ ]* 8.6 Write property test for last session query (Property 26)
    - **Property 26: Last Session Query Correctness**
    - Create `tests/properties/last-session-query.property.test.ts`
    - Verify returns most recent completed session for a day, or null if none exist
    - **Validates: Requirements 17.1, 17.2**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Progress Visualization
  - [x] 10.1 Implement per-exercise history screen
    - Create `src/app/(tabs)/progress/exercise/[exerciseId].tsx`
    - Display all logged sets in reverse chronological order grouped by session date
    - Display weight progression chart over time
    - Highlight personal records in the timeline
    - Navigate to this screen from Exercise Library or program day exercise tap
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 10.2 Implement volume and trend visualization dashboard
    - Create/update `src/app/(tabs)/progress/index.tsx`
    - Implement volume-by-muscle-group chart using existing volume calculation service
    - Implement time window selector (1 week, 4 weeks, 12 weeks)
    - Implement weekly training volume trend line (total sets or total weight per week)
    - Implement training frequency trend line (sessions per week)
    - Use Design_System colors (dark background, teal/cyan accent)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [ ]* 10.3 Write property test for volume and frequency aggregation (Property 20)
    - **Property 20: Weekly Volume and Frequency Aggregation**
    - Add to `tests/properties/volume-calculation.property.test.ts`
    - Verify weekly volume = sum(reps × weight) for that week
    - Verify weekly frequency = distinct session count in that week
    - **Validates: Requirements 13.3, 13.4**

- [x] 11. UX Polish: Notifications, Rest Timer Auto-Start, and Spotify Session UI
  - [x] 11.1 Implement notification service with permission management
    - Create `src/services/notifications.ts` implementing `NotificationService` interface
    - Implement `requestPermission` with OS prompt on first timer start
    - Persist permission status locally on grant
    - Fall back to in-app visual + audio alerts when denied
    - Re-check OS permission status on app resume (handle revocation in settings)
    - Never schedule background notifications when permission not granted
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 11.2 Write property test for notification permission invariant (Property 4)
    - **Property 4: Notification Permission Invariant**
    - Create `tests/properties/notification-permission.property.test.ts`
    - Verify background scheduling never invoked when permission is not 'granted'
    - **Validates: Requirements 3.3**

  - [x] 11.3 Implement rest timer auto-start
    - Modify session logging to auto-start rest timer after logging a set (when exercise has timer configured)
    - Add `rest_timer_auto_start` setting in user preferences (default: enabled)
    - When disabled, require manual timer start
    - _Requirements: 15.1, 15.2, 15.3_

  - [ ]* 11.4 Write property test for rest timer auto-start (Property 21)
    - **Property 21: Rest Timer Auto-Start**
    - Create `tests/properties/timer-autostart.property.test.ts`
    - Verify timer auto-starts when setting enabled and exercise has rest config
    - **Validates: Requirements 15.1**

  - [x] 11.5 Implement Spotify session playlist UI
    - Create `src/components/SpotifyPlayerCard.tsx` (compact: track name, artist, play/pause, skip)
    - Implement expandable playlist queue view
    - Allow playlist selection from library or Agent suggestions
    - Conditionally render only when Spotify connected and session active
    - Offer to resume previously used playlist for program day
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5_

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Accessibility and Cross-Platform
  - [x] 13.1 Add accessibility labels, roles, and chart summaries to all new components
    - Add `accessibilityLabel` and `accessibilityRole` to all interactive elements (buttons, inputs, swipeable rows)
    - Add accessible text summaries to all chart components
    - Add "View as table" toggle below charts
    - Implement keyboard navigation support and focus management for modals
    - Expose swipeable row hidden actions as visible buttons for keyboard/switch control
    - _Requirements: 24.1, 24.2, 24.3, 24.4_

  - [ ]* 13.2 Write property test for accessibility completeness (Property 28)
    - **Property 28: Accessibility Completeness**
    - Create `tests/properties/accessibility.property.test.ts`
    - Verify all interactive components expose non-empty accessibilityLabel and valid role
    - Verify chart components expose accessible text summary
    - **Validates: Requirements 24.1, 24.2, 24.3**

  - [x] 13.3 Implement cross-platform capability detection and graceful degradation
    - Create `src/lib/platform-capabilities.ts` for runtime platform detection
    - Conditionally render native-only UI elements (notifications, health, GPS)
    - Hide/disable unsupported features on web platform
    - _Requirements: 23.2, 23.3_

- [x] 14. Final Integration and Wiring
  - [x] 14.1 Wire offline sync status UI indicators
    - Display offline banner when no connectivity
    - Show badge with unsynced entry count when failed entries exist
    - Provide manual retry action for permanently failed entries
    - Display "No cached data available" placeholder for cache misses while offline
    - _Requirements: 4.7, 5.2, 6.2_

  - [x] 14.2 Wire store integrations across all tabs
    - Ensure active program, sessions, exercises available across all tabs from Zustand store without redundant requests
    - Connect Sync Engine connectivity listener (NetInfo) to trigger flush on reconnect
    - Connect Realtime subscription to update store on server-confirmed data changes
    - _Requirements: 11.1, 11.2, 11.3, 11.7_

  - [x] 14.3 Ensure RLS policies and auth validation on all new endpoints
    - Verify RLS policies on entitlement_levels, feature_entitlements, user_entitlements tables
    - Verify all Edge Functions validate JWT and reject invalid tokens
    - Ensure generic auth error messages (no account existence disclosure)
    - _Requirements: 28.1, 28.2, 28.3, 28.4_

  - [ ]* 14.4 Write integration tests for sync and Spotify handlers
    - Create `tests/integration/sync-engine-online.test.ts` testing enqueue → connect → transmit → confirm
    - Create `tests/integration/spotify-tool-handlers.test.ts` with mocked Spotify API
    - Create `tests/integration/cache-invalidation.test.ts` testing server update → cache refresh
    - _Requirements: 4.2, 4.3, 26.1, 26.2, 26.3_

- [x] 15. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between phases
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All code targets TypeScript with Expo v57 + Supabase stack
- Read https://docs.expo.dev/versions/v57.0.0/ before implementing any Expo-specific APIs
- The workspace rule requires consulting versioned Expo docs before writing code
- `fast-check` v4.9+ is already in devDependencies; use with Vitest (`npx vitest --run`)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.5", "1.6"] },
    { "id": 1, "tasks": ["1.2", "1.4", "1.7"] },
    { "id": 2, "tasks": ["2.1", "2.5", "4.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.6", "4.2"] },
    { "id": 4, "tasks": ["2.4", "2.7", "4.3"] },
    { "id": 5, "tasks": ["4.4", "4.5"] },
    { "id": 6, "tasks": ["4.6", "4.7"] },
    { "id": 7, "tasks": ["6.1", "6.3", "6.7"] },
    { "id": 8, "tasks": ["6.2", "6.4", "6.5", "6.8"] },
    { "id": 9, "tasks": ["6.6", "8.1", "8.3"] },
    { "id": 10, "tasks": ["8.2", "8.4", "8.5"] },
    { "id": 11, "tasks": ["8.6", "10.1", "10.2"] },
    { "id": 12, "tasks": ["10.3", "11.1", "11.3", "11.5"] },
    { "id": 13, "tasks": ["11.2", "11.4", "13.1", "13.3"] },
    { "id": 14, "tasks": ["13.2", "14.1", "14.2", "14.3"] },
    { "id": 15, "tasks": ["14.4"] }
  ]
}
```
