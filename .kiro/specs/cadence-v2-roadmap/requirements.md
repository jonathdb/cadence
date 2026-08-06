# Requirements Document

## Introduction

Cadence V2 Roadmap covers the next iteration of the Cadence AI-powered fitness training app. The app is built with Expo v57 (React Native) + Supabase and already has a working skeleton with AI chat, program creation, session logging, PR detection, timers, route tracking, health integration, and Spotify integration. This document defines the requirements across seven improvement phases: critical bug fixes, offline-first session logging, manual CRUD and exercise library, state management and caching, progress visualization, polish and real-world UX, and subscription readiness. The AI-driven flows remain the primary path; manual features serve as an escape hatch for power users who want full control.

## Glossary

- **App**: The Cadence mobile application running on iOS and Android via Expo v57
- **Agent**: The AI-powered assistant that creates programs, modifies workouts, drafts journal entries, and manages Spotify playlists via tool calls
- **Edge_Function**: A Supabase Edge Function deployed as a serverless endpoint
- **Tool_Call**: A structured function invocation made by the Agent to perform actions (program_modify, journal_draft, spotify actions)
- **Execute_Tool_Call_Function**: The missing Edge Function responsible for routing and executing tool calls from the chat screen
- **Session**: A single workout instance logged against a Program Day or created as a freestyle session
- **Session_Screen**: The active workout logging screen at `(tabs)/session/[dayId].tsx`
- **Summary_Screen**: The post-workout summary screen displaying volume, PRs, and duration
- **Notification_Service**: The system responsible for scheduling and displaying local notifications via expo-notifications
- **Local_WAL**: A write-ahead log implemented using expo-sqlite for offline persistence
- **Sync_Engine**: The background process that reconciles local writes with Supabase when connectivity returns
- **Program**: A structured training plan consisting of ordered Program Days with exercises, sets, reps, and timer configurations
- **Program_Day**: A single day within a Program containing ordered exercises and blocks
- **Exercise**: A specific movement (e.g., Bench Press) with muscle group tagging, instructions, and categorization
- **Exercise_Library**: The searchable collection of global and user-created exercises
- **Logged_Set**: A single set entry within a session recording reps, weight, RPE, and notes
- **Freestyle_Session**: A workout session started without an associated Program Day
- **State_Store**: The client-side state management layer (Zustand or TanStack Query) for shared data
- **Progress_Screen**: The visualization screen showing per-exercise history, volume charts, and trend lines
- **Design_System**: The dark-first visual system using teal/cyan accent, 4px grid spacing, and semantic color tokens
- **Entitlement_System**: The permission and subscription gating layer for AI features
- **RLS**: Row-Level Security policies in Supabase Postgres enforcing data isolation per user
- **PR_Detection**: The service that identifies personal records (weight, reps at weight, estimated 1RM)

## Requirements

### Requirement 1: Execute Tool Call Edge Function

**User Story:** As a user chatting with the AI Agent, I want tool calls (program_modify, journal_draft, spotify actions) to execute successfully, so that the Agent can actually perform actions on my behalf.

#### Acceptance Criteria

1. WHEN the Agent issues a tool call containing a tool_call_id, tool name, and arguments object, THE Execute_Tool_Call_Function SHALL route the call to the handler registered for that tool name in the tool definitions
2. WHEN the Execute_Tool_Call_Function receives a tool call request, THE Execute_Tool_Call_Function SHALL validate the Supabase JWT from the Authorization header and extract the user ID before executing any tool handler
3. IF the Execute_Tool_Call_Function receives a tool call with a tool name that does not match any registered tool definition, THEN THE Execute_Tool_Call_Function SHALL return an error response containing an error code and a message indicating the unrecognized tool name
4. WHEN the Execute_Tool_Call_Function completes tool handler execution successfully, THE Execute_Tool_Call_Function SHALL return a response containing the tool_call_id and the tool result payload within 5 seconds of invocation
5. IF the Execute_Tool_Call_Function encounters an execution error during tool handling, THEN THE Execute_Tool_Call_Function SHALL return a response containing an error code, a user-safe error message, and the tool_call_id, without including stack traces, internal service names, or environment variables
6. IF the Supabase JWT is missing, malformed, or expired, THEN THE Execute_Tool_Call_Function SHALL return an HTTP 401 response with an error code indicating the authentication failure and SHALL NOT execute the tool handler

### Requirement 2: Session Completion Navigation

**User Story:** As a user finishing a workout, I want to be navigated to the session summary screen, so that I can review my workout stats, PRs, and volume.

#### Acceptance Criteria

1. WHEN the user confirms session completion via the finish action, THE Session_Screen SHALL persist the session data to the Local_WAL and navigate to the Summary_Screen with the completed session ID using the route pattern `/session/summary/[sessionId]`
2. THE Summary_Screen SHALL display total volume (sum of weight × reps across all logged sets, in the user's weight unit), session duration (formatted as HH:MM:SS from session start to completion), PR count (number of personal records detected during the session), and exercise breakdown (each exercise name with its logged sets count, total volume, and best set)
3. IF the Summary_Screen cannot load session data for the provided session ID, THEN THE Summary_Screen SHALL display an error message indicating the session could not be loaded and provide a navigation action to return to the Session_Screen tab
4. WHEN the user taps a PR entry on the Summary_Screen, THE App SHALL highlight the specific set that achieved the personal record

### Requirement 3: Notification Permission Request

**User Story:** As a user starting a timer, I want the app to request notification permissions before scheduling background notifications, so that timer alerts work reliably when the app is backgrounded.

#### Acceptance Criteria

1. WHEN the Notification_Service attempts to schedule a timer notification and no stored permission status exists, THE App SHALL request notification permission from the operating system before scheduling
2. IF the user denies notification permission, THEN THE Notification_Service SHALL continue timer operation using in-app alerts (visual countdown and audible sound when the app is in the foreground) without attempting to schedule background notifications
3. WHILE notification permission has not been granted, THE Notification_Service SHALL not attempt to schedule background notifications
4. WHEN notification permission is granted, THE Notification_Service SHALL persist the permission status locally to avoid repeated prompts on subsequent timer starts
5. WHEN the App resumes from background or launches, THE Notification_Service SHALL re-check the current OS permission status and update the stored status if the user has revoked permission via system settings

### Requirement 4: Offline Session Logging

**User Story:** As a user working out without internet, I want my session data to be saved locally and synced later, so that I never lose workout data due to connectivity issues.

#### Acceptance Criteria

1. THE Local_WAL SHALL persist all session operations (session start, set logging, session completion) to expo-sqlite within 100ms of the user action
2. WHEN network connectivity is restored, THE Sync_Engine SHALL begin transmitting queued Local_WAL entries to Supabase and complete transmission of all queued entries within 30 seconds of connectivity restoration
3. WHEN the Sync_Engine encounters a conflict where the same record has been modified both locally and remotely, THE Sync_Engine SHALL resolve the conflict using a last-write-wins strategy based on client-generated timestamps
4. WHEN a session operation is written to the Local_WAL, THE App SHALL apply an optimistic UI update reflecting the operation as successful within 100ms of the write
5. IF the Sync_Engine fails to transmit a queued entry, THEN THE Sync_Engine SHALL retry with exponential backoff starting at 1 second and doubling each attempt, up to 5 attempts, before marking the entry as permanently failed
6. THE Local_WAL SHALL maintain referential integrity between sessions, logged sets, and exercises in the local database by rejecting writes that would violate foreign key relationships
7. WHEN one or more Local_WAL entries are marked as permanently failed, THE App SHALL display a notification to the user indicating the number of unsynced entries and provide a manual retry action

### Requirement 5: Offline Program Browsing

**User Story:** As a user without internet, I want to browse my active program and its exercises, so that I can start a workout regardless of connectivity.

#### Acceptance Criteria

1. THE App SHALL cache the active program structure (days, exercises, timer configs) in the local SQLite database
2. WHILE the device lacks network connectivity, THE App SHALL serve the active program from the local cache
3. WHEN the active program is updated on the server, THE Sync_Engine SHALL update the local cache on the next successful sync

### Requirement 6: Offline Chat History and Progress Viewing

**User Story:** As a user without internet, I want to view my recent chat history and progress data, so that I can reference past AI recommendations and review my training history.

#### Acceptance Criteria

1. THE App SHALL cache the most recent 100 chat messages in the local SQLite database
2. WHILE the device lacks network connectivity, THE App SHALL display cached chat messages in read-only mode
3. THE App SHALL cache session history and logged sets for the Progress_Screen in the local SQLite database
4. WHILE the device lacks network connectivity, THE Progress_Screen SHALL render charts and history from cached data

### Requirement 7: Manual Program Creation

**User Story:** As a power user, I want to create and edit training programs manually without the AI, so that I have full control over my program structure.

#### Acceptance Criteria

1. THE App SHALL provide a program creation screen where the user can set a program name (1-100 characters, non-empty) and add up to 14 days
2. THE App SHALL allow the user to add, edit, remove, and reorder days within a program using drag-and-drop or move controls
3. THE App SHALL allow the user to add, edit, remove, and reorder up to 20 exercises within a Program_Day
4. WHEN adding an exercise to a Program_Day, THE App SHALL allow the user to configure target sets (1-99), target reps (text field up to 20 characters accepting ranges like "8-12"), target weight (0-999 kg in 0.5 increments), target RPE (1-10 in 0.5 increments), rest timer duration (0-600 seconds in 5-second increments), and notes (up to 500 characters)
5. WHEN the user saves a manually created program, THE App SHALL validate that the program has a non-empty name and at least one day with at least one exercise before storing with status "draft"
6. WHEN a valid program is saved with status "draft", THE App SHALL allow activation via the existing activate_program flow
7. IF the user attempts to save a program that fails validation, THEN THE App SHALL display inline error indicators on the invalid fields and prevent saving
8. IF a save operation fails due to a network or server error, THEN THE App SHALL display an error message indicating the save failed and retain the user's unsaved changes in the editor
9. THE App SHALL allow the user to edit any field of an existing program that has status "draft" or "active"

### Requirement 8: Manual Session Flexibility

**User Story:** As a user mid-workout, I want to add, remove, reorder, and skip exercises freely, so that I can adapt my session to how I feel.

#### Acceptance Criteria

1. THE App SHALL allow the user to start a Freestyle_Session without selecting a Program_Day
2. WHEN a Freestyle_Session is started, THE App SHALL allow the user to add exercises from the Exercise_Library on the fly
3. WHILE a session is in progress, THE App SHALL allow the user to add exercises not in the original program plan, up to a maximum of 50 exercises per session
4. WHILE a session is in progress, THE App SHALL allow the user to remove exercises that have no logged sets
5. IF the user attempts to remove an exercise that has one or more logged sets, THEN THE App SHALL prevent removal and display a message indicating the exercise cannot be removed because it contains logged data
6. WHILE a session is in progress, THE App SHALL allow the user to reorder exercises using drag-and-drop or move controls
7. WHILE a session is in progress, THE App SHALL allow the user to skip an exercise that has no logged sets by marking it as skipped
8. IF the user attempts to skip an exercise that has one or more logged sets, THEN THE App SHALL prevent the skip action and display a message indicating the exercise cannot be skipped because it contains logged data

### Requirement 9: Set Editing and Deletion in Active Sessions

**User Story:** As a user who made a logging mistake, I want to edit or delete sets within my active session, so that my workout data is accurate.

#### Acceptance Criteria

1. WHEN the user taps a logged set entry, THE App SHALL display an edit form pre-filled with the set values (reps, weight, RPE, notes)
2. WHEN the user saves edits to a logged set, THE App SHALL update the set in the local database and re-run PR_Detection for affected sets
3. WHEN the user swipes left on a logged set entry, THE App SHALL display a delete action
4. WHEN the user confirms set deletion, THE App SHALL remove the set and re-number remaining sets for that exercise
5. WHEN a set is deleted, THE App SHALL display an undo option for 5 seconds allowing the user to restore the deleted set

### Requirement 10: Exercise Library

**User Story:** As a user, I want a comprehensive exercise library that I can browse, search, and extend with custom exercises, so that I always find the movement I need.

#### Acceptance Criteria

1. THE Exercise_Library SHALL contain a minimum of 300 global exercises covering all major muscle groups (chest, back, shoulders, biceps, triceps, quadriceps, hamstrings, glutes, calves, core, forearms, traps)
2. THE Exercise_Library SHALL provide search functionality that performs case-insensitive substring matching on exercise name, and exact-match filtering by primary muscle group and secondary muscle groups
3. THE App SHALL allow the user to create custom exercises with a name (1-100 characters, unique per user), a required primary muscle group, optional secondary muscle groups (up to 3), and optional instructions (up to 2000 characters)
4. THE App SHALL allow the user to edit custom exercises that the user owns
5. WHEN the user searches the Exercise_Library, THE App SHALL return results within 200ms
6. THE Exercise_Library SHALL categorize each exercise with a primary muscle group and optional secondary muscle groups
7. THE App SHALL allow the user to delete a custom exercise that the user owns
8. IF the user attempts to delete a custom exercise that is referenced in a Program_Day, THEN THE App SHALL display a confirmation warning indicating the exercise is in use and require explicit confirmation before deletion
9. IF the user searches the Exercise_Library and no exercises match the query, THEN THE App SHALL display an empty-state message and offer the option to create a custom exercise

### Requirement 11: State Management Layer

**User Story:** As a user navigating between tabs, I want shared data (active program, session history, exercise library) to be instantly available without redundant network requests, so that the app feels fast and responsive.

#### Acceptance Criteria

1. THE State_Store SHALL cache the active program and make it available across all tabs without issuing additional network requests for data already present in the cache
2. THE State_Store SHALL cache the most recent 20 sessions with their logged sets and make the data available to auto-fill, progress, and session screens without additional network requests
3. THE State_Store SHALL cache the Exercise_Library for search and selection operations
4. WHEN data is mutated (set logged, program edited), THE State_Store SHALL apply optimistic updates to the UI within 100ms of the user action, before server confirmation
5. IF an optimistic update fails server-side confirmation, THEN THE State_Store SHALL rollback the UI state to its pre-mutation value and display a dismissable error notification indicating which operation failed
6. THE State_Store SHALL integrate with the Local_WAL so that offline mutations update the cache within 100ms of the mutation being written to Local_WAL
7. WHEN the Sync_Engine receives server-confirmed data that differs from the cached state, THE State_Store SHALL update the cache to reflect the server-confirmed state

### Requirement 12: Per-Exercise History Screen

**User Story:** As a user, I want to view my complete history for any exercise, so that I can track my progression over time.

#### Acceptance Criteria

1. WHEN the user taps an exercise in the Exercise_Library or a program day, THE App SHALL navigate to the exercise history screen
2. THE Progress_Screen SHALL display all logged sets for the selected exercise in reverse chronological order grouped by session date
3. THE Progress_Screen SHALL display a chart showing weight progression over time for the selected exercise
4. THE Progress_Screen SHALL highlight personal records within the history timeline

### Requirement 13: Volume and Trend Visualization

**User Story:** As a user reviewing my progress, I want to see volume by muscle group and training frequency trends, so that I can ensure balanced programming and consistent training.

#### Acceptance Criteria

1. THE Progress_Screen SHALL display a volume-by-muscle-group chart using the existing volume calculation service
2. THE Progress_Screen SHALL allow the user to select a time window (1 week, 4 weeks, 12 weeks) for the volume chart
3. THE Progress_Screen SHALL display a weekly training volume trend line (total sets or total weight per week)
4. THE Progress_Screen SHALL display a training frequency trend line (sessions per week)
5. THE Progress_Screen SHALL use a charting library that renders with the Design_System colors (dark background, teal/cyan accent for data series)

### Requirement 14: Haptic Feedback

**User Story:** As a user logging sets, I want tactile confirmation of key actions, so that I have confidence my inputs registered.

#### Acceptance Criteria

1. WHEN PR_Detection identifies a personal record, THE App SHALL trigger a success haptic feedback pattern
2. WHEN the user logs a set, THE App SHALL trigger a light haptic feedback pattern
3. WHEN the user deletes a set via swipe, THE App SHALL trigger a warning haptic feedback pattern

### Requirement 15: Rest Timer Auto-Start

**User Story:** As a user between sets, I want the rest timer to start automatically after logging a set, so that I do not have to manually trigger it every time.

#### Acceptance Criteria

1. WHEN the user logs a set for an exercise that has a rest timer configured, THE App SHALL automatically start the rest timer
2. THE App SHALL provide a setting to enable or disable rest timer auto-start (default: enabled)
3. WHILE rest timer auto-start is disabled, THE App SHALL require the user to manually start the rest timer

### Requirement 16: Session History List

**User Story:** As a user opening the Session tab, I want to see my recent session history, so that I can review past workouts or continue an in-progress session.

#### Acceptance Criteria

1. THE Session_Screen tab SHALL display a list of recent sessions (last 20) sorted by date descending
2. THE Session_Screen tab SHALL display each session entry with the program day name, date, duration, and total sets logged
3. WHEN the user taps a completed session entry, THE App SHALL navigate to the Summary_Screen for that session
4. WHEN an in-progress session exists, THE Session_Screen tab SHALL display a prominent "Continue Session" card at the top

### Requirement 17: Last Session Quick-View

**User Story:** As a user selecting a program day to train, I want to see a summary of my last session for that day, so that I know what to expect and can track progression.

#### Acceptance Criteria

1. THE App SHALL display a "Last Session" summary on each Program_Day card showing date, total sets, total volume, and PR count from the most recent completed session for that day
2. IF no previous session exists for a Program_Day, THEN THE App SHALL display "No previous session" on the Program_Day card

### Requirement 18: Input Validation

**User Story:** As a user entering set data, I want input fields to enforce valid ranges, so that I cannot accidentally log nonsensical values.

#### Acceptance Criteria

1. THE App SHALL restrict the reps input field to integer values in the range 1 to 999
2. THE App SHALL restrict the weight input field to numeric values in the range 0 to 999 with 0.5 increments allowed
3. THE App SHALL restrict the RPE input field to numeric values in the range 1 to 10 with 0.5 increments allowed
4. IF the user enters a value outside the valid range, THEN THE App SHALL display an inline validation error and prevent submission

### Requirement 19: Error Boundary

**User Story:** As a user, I want the app to recover gracefully from unexpected errors, so that a crash in one screen does not bring down the entire app.

#### Acceptance Criteria

1. THE App SHALL wrap the root component tree in an error boundary that catches unhandled JavaScript errors
2. WHEN an unhandled error is caught, THE App SHALL display a user-friendly error screen with a "Retry" action
3. WHEN the user taps "Retry" on the error screen, THE App SHALL attempt to re-render the failed component tree
4. THE App SHALL log caught errors for debugging purposes (console in development, structured log in production)

### Requirement 20: Generated Supabase Types

**User Story:** As a developer, I want TypeScript types generated from the Supabase schema, so that database queries are type-safe and changes are caught at compile time.

#### Acceptance Criteria

1. THE App codebase SHALL include a script that runs `supabase gen types typescript` to generate type definitions from the live schema
2. WHEN the database schema changes via migration, THE generated types SHALL be updated to reflect the new schema
3. THE generated types SHALL replace the manually maintained `src/types/database.ts` file

### Requirement 21: Subscription Readiness — Entitlement System

**User Story:** As a product owner, I want the permission system designed so AI features can be gated behind a subscription tier later, so that monetization can be introduced without architectural changes.

#### Acceptance Criteria

1. THE Entitlement_System SHALL define a data model that maps feature identifiers (unique strings, maximum 64 characters) to user entitlement levels (free, premium), with the set of levels extensible via new rows rather than schema changes
2. WHEN an AI tool call is invoked, THE Entitlement_System SHALL check the user's entitlement level against the required level for that tool and reject execution with a descriptive access-denied response if the user's level is insufficient
3. THE Entitlement_System SHALL treat users who provide their own API key (BYOK) as entitled to all AI features regardless of their subscription tier, so that the existing BYOK model remains fully functional alongside a managed AI tier
4. THE Entitlement_System SHALL be implemented as new tables with foreign key references to existing user records, without altering existing table definitions or requiring data migration of existing rows
5. WHEN a new user is created or an existing user has no entitlement record, THE Entitlement_System SHALL default to the "free" entitlement level granting access to non-AI features and gating AI tool calls behind either a premium subscription or a valid BYOK key

### Requirement 22: Subscription Readiness — Coach/Athlete Schema

**User Story:** As a product owner, I want the data model to support coach/athlete relationships and shared programs in the future, so that this can be added without schema rewrites.

#### Acceptance Criteria

1. THE database schema SHALL be designed so that a future "coach_athletes" relationship table can reference existing user and program tables without schema breaking changes
2. THE Program table's RLS policies SHALL be structured so that a future policy can grant read access to a coach without modifying the existing user-scoped policies
3. THE App SHALL not implement coach/athlete features in this phase but the schema design SHALL not block future addition

### Requirement 23: Cross-Platform Graceful Degradation

**User Story:** As a user on any platform, I want native features to degrade gracefully on unsupported platforms, so that the app remains functional everywhere.

#### Acceptance Criteria

1. WHILE the App is running on a platform that does not support haptic feedback, THE App SHALL skip haptic calls without errors
2. WHILE the App is running on web, THE App SHALL hide or disable features that require native APIs (notifications, health integration, GPS tracking)
3. THE App SHALL detect platform capabilities at runtime and conditionally render native-only UI elements

### Requirement 24: Accessibility

**User Story:** As a user with accessibility needs, I want all new screens and interactions to maintain proper accessibility attributes, so that the app is usable with screen readers and other assistive technologies.

#### Acceptance Criteria

1. THE App SHALL include accessibility labels on all interactive elements (buttons, inputs, swipeable rows)
2. THE App SHALL include accessibility roles on all new components (button, link, header, image)
3. THE App SHALL ensure all charts provide an accessible text summary as an alternative to visual data
4. WHEN new screens are added, THE App SHALL maintain keyboard navigation support and focus management

### Requirement 25: Spotify OAuth Connection

**User Story:** As a user, I want to connect my Spotify account to Cadence via the Settings screen, so that the AI Agent and I can manage playlists for my workouts.

#### Acceptance Criteria

1. THE App SHALL provide a "Connect Spotify" button on the Settings screen that initiates an OAuth2 PKCE authorization flow
2. WHEN the user completes the Spotify OAuth flow, THE App SHALL store the access token, refresh token, expiry timestamp, and granted scopes in the user_spotify_tokens table
3. WHEN a Spotify access token has expired, THE App SHALL refresh the token using the stored refresh_token before making API calls
4. IF the token refresh fails (revoked access or invalid refresh token), THEN THE App SHALL prompt the user to reconnect Spotify and clear the stored tokens
5. THE App SHALL display the connected Spotify account name and a "Disconnect" action on the Settings screen when connected
6. WHEN the user disconnects Spotify, THE App SHALL revoke tokens and delete the user_spotify_tokens record

### Requirement 26: Spotify Tool Handlers

**User Story:** As a user chatting with the Agent, I want Spotify tool calls to execute successfully, so that the Agent can search, create, and modify playlists on my behalf.

#### Acceptance Criteria

1. WHEN the Agent issues a spotify_search_playlist tool call, THE Execute_Tool_Call_Function SHALL query the Spotify Web API and return matching playlists
2. WHEN the Agent issues a spotify_create_playlist tool call, THE Execute_Tool_Call_Function SHALL create a new playlist on the user's Spotify account and return the playlist ID
3. WHEN the Agent issues a spotify_modify_playlist tool call, THE Execute_Tool_Call_Function SHALL add or remove tracks from the specified playlist
4. WHEN the Agent issues a spotify_suggest_pace_playlist tool call, THE Execute_Tool_Call_Function SHALL correlate the user's pace data with BPM ranges and return playlist recommendations
5. IF the user's Spotify tokens are missing or invalid, THEN THE Execute_Tool_Call_Function SHALL return an error indicating Spotify is not connected

### Requirement 27: Session Playlist UI

**User Story:** As a user during a workout, I want to see and control my active Spotify playlist, so that I can manage my workout music without leaving the app.

#### Acceptance Criteria

1. WHILE a session is in progress and Spotify is connected, THE Session_Screen SHALL display a compact playlist/player card showing the current track name, artist, and playback controls (play/pause, skip)
2. WHEN the user taps the playlist card, THE App SHALL expand to show the full playlist queue
3. THE App SHALL allow the user to select a playlist from their Spotify library or from Agent-suggested playlists before or during a session
4. IF Spotify is not connected, THEN THE Session_Screen SHALL not display the playlist card
5. WHEN the user starts a session and has a previously used playlist for that program day, THE App SHALL offer to resume that playlist

### Requirement 28: Security — RLS and Auth

**User Story:** As a user, I want my data protected by row-level security so that other users cannot access my programs, sessions, or personal records.

#### Acceptance Criteria

1. THE database SHALL enforce RLS policies on all new tables ensuring users can only access their own data
2. THE App SHALL return generic authentication error messages that do not reveal whether an account exists
3. WHEN new Edge Functions are created, THE Edge_Function SHALL validate the Supabase JWT and reject requests with invalid or expired tokens
4. THE App SHALL not expose internal error details, stack traces, or database schema information in client-facing error responses
