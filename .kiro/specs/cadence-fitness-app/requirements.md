# Requirements Document

## Introduction

Cadence is a mobile-first fitness application that pairs users with an AI training agent to build, refine, and execute personalized training programs. Users interact conversationally with the agent to generate programs, log workouts against those programs, track progression, use timers and intervals for time-based exercises, and optionally tie sessions to Spotify playlists. A later phase adds background-tracked running/walking routes linked to program days. The app is built with React Native + Expo (Expo Router) on a Supabase backend, designed to remain web-ready for a future web client.

**Phase 1 (MVP)** requirements are numbered 1–29. **Phase 2 (Route Tracking)** requirements are numbered 30–36 and are clearly marked. Phase 2 is planned but sequenced after core MVP is stable.

## Glossary

- **Agent**: The AI training assistant that generates programs, answers questions, drafts journal entries, and manages Spotify playlists via server-side tool calls
- **Program**: A structured training plan consisting of ordered program days, each containing exercises, sets, rep schemes, timer configurations, and optional notes
- **Program_Day**: A single day/session template within a program, defining exercises to perform, their order, target sets/reps/weight, and timer configurations
- **Session**: A single completed or in-progress workout logged against a program day
- **Exercise**: A named movement with associated muscle groups, instructions, and metadata; may be global (shared) or user-created (private)
- **Set**: A single execution unit within a session, capturing reps, weight, RPE, and notes
- **Block**: A grouped collection of exercises within a program day that may share a timer configuration (e.g., circuit, superset, AMRAP)
- **Timer**: A countdown, interval, or duration-based timing mechanism attached to an exercise or block
- **PR**: A detected best performance for an exercise across a user's history (best weight, best reps at a weight, best estimated 1RM)
- **Journal_Entry**: A free-text reflection on a completed session, optionally drafted by the Agent
- **Cadence_App**: The Cadence mobile application and its server-side components
- **Auth_System**: The Supabase-based authentication system using email and password
- **Edge_Function**: A Supabase Edge Function that executes server-side logic including AI tool calls
- **Tool_Call**: A structured action the Agent requests via an Edge Function, subject to permission settings
- **Permission_Category**: A configurable agent permission scope (program edits, journal edits, Spotify actions) set to either approval_required or auto_apply
- **Health_Provider**: Apple HealthKit on iOS or Health Connect on Android
- **Imported_Health_Data**: Data read from a Health_Provider, normalized into Cadence-owned domain models
- **Route**: A GPS-tracked running or walking path recorded during a session (phase 2)
- **Spotify_Integration**: OAuth2 PKCE-based connection to the Spotify API for playlist management

## Requirements

### Requirement 1: Conversational Program Creation

**User Story:** As a user, I want to describe my fitness goals, equipment, and constraints in a chat conversation, so that the Agent can propose a personalized training program.

#### Acceptance Criteria

1. WHEN the user sends a message in the Agent chat, THE Cadence_App SHALL deliver the message to the Agent via an Edge_Function and display the Agent response in the chat thread
2. WHEN the Agent proposes a new program, THE Cadence_App SHALL display the full program structure (days, exercises, sets, reps, targets, timer configurations) for user review before activation
3. WHEN the user approves a proposed program, THE Cadence_App SHALL save the program and set it as the user's active program
4. WHEN the user requests changes to a proposed program, THE Agent SHALL modify the program according to the feedback and present the updated version for review

### Requirement 2: Agent Tool Call Execution

**User Story:** As a user, I want the Agent to make structured changes to my data only through explicit server-side tool calls, so that actions are controlled and auditable.

#### Acceptance Criteria

1. THE Agent SHALL execute write operations exclusively through server-side Tool_Calls via Edge_Functions
2. THE Agent SHALL NOT access the database or third-party APIs directly
3. WHEN a Tool_Call requires approval and the Permission_Category is set to approval_required, THE Cadence_App SHALL present the proposed change to the user and wait for explicit confirmation before applying it
4. WHEN a Tool_Call belongs to a Permission_Category set to auto_apply, THE Cadence_App SHALL apply the change immediately and notify the user of the action taken

### Requirement 3: BYOK API Key Management

**User Story:** As a user, I want to supply my own OpenAI or Anthropic API key, so that I can use the AI agent without a subscription.

#### Acceptance Criteria

1. THE Cadence_App SHALL allow users to enter and save an OpenAI API key, an Anthropic API key, or both
2. THE Cadence_App SHALL store API keys encrypted server-side and SHALL NOT expose key values to the client after initial submission
3. WHEN the user has not provided a valid API key, THE Agent chat SHALL inform the user that an API key is required and provide navigation to the key configuration screen
4. WHEN the user updates or removes an API key, THE Cadence_App SHALL apply the change for all subsequent Agent interactions

### Requirement 4: Single Active Program Constraint

**User Story:** As a user, I want exactly one active program at a time, so that my training focus is clear and unambiguous.

#### Acceptance Criteria

1. THE Cadence_App SHALL enforce exactly one active program per user at any time
2. WHEN the user activates a different program, THE Cadence_App SHALL archive the previously active program and set the new program as active
3. THE Cadence_App SHALL maintain a library of saved and archived programs accessible to the user and Agent

### Requirement 5: Program Structure

**User Story:** As a user, I want my program to contain structured days with exercises, sets, reps, weight targets, and timer configurations, so that I have clear guidance each session.

#### Acceptance Criteria

1. THE Cadence_App SHALL represent a program as an ordered collection of Program_Days
2. THE Cadence_App SHALL represent each Program_Day as an ordered collection of exercises and/or blocks, each with target sets, reps, weight, RPE, timer type, and optional notes
3. WHEN the user or Agent modifies a program, THE Cadence_App SHALL preserve the modification history for that program

### Requirement 6: Conversational Program Refinement

**User Story:** As a user, I want to refine my active program through conversation with the Agent over time, so that my training evolves with my progress and preferences.

#### Acceptance Criteria

1. WHEN the user requests a change to the active program via chat, THE Agent SHALL propose the modification as a Tool_Call subject to the program edits Permission_Category
2. WHEN a program modification is approved and applied, THE Cadence_App SHALL update the active program in place and record the change in modification history

### Requirement 7: Global and User Exercise Library

**User Story:** As a user, I want access to a shared exercise library plus the ability to create my own exercises, so that my program can reference any movement I need.

#### Acceptance Criteria

1. THE Cadence_App SHALL provide a global exercise library containing common exercises with name, muscle groups, and instructions
2. THE Cadence_App SHALL allow users to create private custom exercises with a name, muscle groups, instructions, and optional notes
3. WHEN the user searches the exercise library, THE Cadence_App SHALL return matching results from both the global library and the user's private exercises
4. THE Cadence_App SHALL prevent users from modifying or deleting global exercises

### Requirement 8: Exercise Metadata

**User Story:** As a user, I want each exercise to have detailed metadata, so that I understand how to perform it correctly.

#### Acceptance Criteria

1. THE Cadence_App SHALL store for each exercise: name, primary muscle group, secondary muscle groups, instructions, and optional notes
2. WHEN the user creates a custom exercise, THE Cadence_App SHALL require at minimum a name and one primary muscle group

### Requirement 9: Session Initiation from Program Day

**User Story:** As a user, I want to start today's session from my active program and see pre-filled performance expectations, so that I can begin logging quickly.

#### Acceptance Criteria

1. WHEN the user starts a session from a Program_Day, THE Cadence_App SHALL pre-populate expected performance (weight, reps, RPE) from the user's history for that same Program_Day first
2. IF no history exists for the same Program_Day, THEN THE Cadence_App SHALL fall back to the user's broader exercise history for each exercise in the session
3. IF no exercise history exists at all, THEN THE Cadence_App SHALL display the program plan targets as defaults

### Requirement 10: Set Logging with Auto-Fill

**User Story:** As a user, I want each new set to default to the previous set's values within the same session, so that I can log with minimal taps.

#### Acceptance Criteria

1. WHEN the user adds a new set for an exercise within an active session, THE Cadence_App SHALL auto-fill weight, reps, and RPE from the most recently logged set for that same exercise in the current session
2. WHEN the user manually changes a set value, THE Cadence_App SHALL use the user-entered value and carry it forward to subsequent auto-fills within the session
3. THE Cadence_App SHALL capture for each logged set: reps, weight, RPE, and optional notes

### Requirement 11: End-of-Session Summary

**User Story:** As a user, I want a summary screen after completing my session, so that I can see what I accomplished.

#### Acceptance Criteria

1. WHEN the user completes a session, THE Cadence_App SHALL display a summary screen showing: total duration, total sets completed, estimated total volume (sets multiplied by reps multiplied by weight), and any PRs achieved during the session
2. WHEN no PRs were achieved, THE Cadence_App SHALL display the summary without a PR section

### Requirement 12: Health Provider Connection

**User Story:** As a user, I want to connect Apple HealthKit or Health Connect, so that Cadence can use my health data to reduce manual input and improve coaching.

#### Acceptance Criteria

1. THE Cadence_App SHALL support reading user-authorized data from Apple HealthKit on iOS and Health Connect on Android
2. THE Cadence_App SHALL request only the minimum permissions necessary for workout and recovery features
3. WHEN the user has not granted health-data permissions, THE Cadence_App SHALL function fully without imported health data

### Requirement 13: Imported Health Data Scope

**User Story:** As a user, I want Cadence to import relevant workout and recovery data, so that my logs and coaching are more accurate.

#### Acceptance Criteria

1. THE Cadence_App SHALL import from authorized Health_Providers: workout sessions (type, source, start time, end time, duration), running distance, average pace, speed, elevation (if available), route (if available), heart-rate summary, resting heart rate, sleep duration, sleep stages (if available), steps, active calories, and HRV or VO2 max (when available)
2. WHEN imported data fields are unavailable from the Health_Provider, THE Cadence_App SHALL gracefully omit those fields without error
3. WHEN route data is imported from a Health_Provider in MVP (phase 1), THE Cadence_App SHALL treat it as read-only contextual data only and SHALL NOT use it as a substitute for Cadence's own in-app tracked-route module defined in phase 2

### Requirement 14: Health Data Normalization and Separation

**User Story:** As a user, I want my imported health data to be normalized and kept separate from Cadence insights, so that raw data and derived analysis remain distinct.

#### Acceptance Criteria

1. THE Cadence_App SHALL normalize all Imported_Health_Data into Cadence-owned domain models rather than using raw provider data directly throughout the application
2. THE Cadence_App SHALL preserve source metadata for imported records including: provider name, provider record ID, timestamps, units, and sync status
3. THE Cadence_App SHALL store raw imported provider records separately from derived Cadence insights (progression summaries, fatigue/readiness summaries, agent suggestions)
4. THE Cadence_App SHALL treat Imported_Health_Data as advisory and contextual; imported data SHALL NOT silently override user program structure or workout logs

### Requirement 15: Health Data Usage

**User Story:** As a user, I want imported health data to reduce my manual input and improve my session summaries and agent recommendations.

#### Acceptance Criteria

1. WHEN Imported_Health_Data contains a matching workout session, THE Cadence_App SHALL offer to auto-fill cardio log fields (distance, duration, pace, heart rate) from the imported data
2. THE Cadence_App SHALL make Imported_Health_Data available to the Agent for recovery context and training recommendations via Tool_Calls; the Agent SHALL access only normalized Cadence-owned summaries of imported health data via server-side Tool_Calls and SHALL NOT access raw provider records directly
3. WHEN auto-filling from imported data, THE Cadence_App SHALL indicate to the user which values originated from the Health_Provider

### Requirement 16: Timer Types

**User Story:** As a user, I want exercises and blocks to support different timer types, so that I can time rest periods, intervals, and duration-based work.

#### Acceptance Criteria

1. THE Cadence_App SHALL support the following timer types for exercises and blocks: none, rest (countdown between sets), countdown (single timed period), interval (work seconds, rest seconds, rounds), and duration-based (for AMRAP or timed holds)
2. WHEN a program is created, THE Cadence_App SHALL allow timer presets (work seconds, rest seconds, rounds, duration) to be configured per exercise or block

### Requirement 17: Timer Defaults from History

**User Story:** As a user, I want timer values to default from my most recent session for the same program day, so that my timing preferences carry forward.

#### Acceptance Criteria

1. WHEN a Program_Day has been completed at least once, THE Cadence_App SHALL default timer values from the most recent completed session for that same Program_Day rather than the original static plan values
2. WHEN a Program_Day has never been completed, THE Cadence_App SHALL use the timer presets defined in the program plan
3. AFTER a Program_Day has been completed at least once, THE Cadence_App SHALL allow the user to manually override timer presets for future sessions of that Program_Day

### Requirement 18: Active Timer UI and Logging

**User Story:** As a user, I want a live countdown/interval timer during my session, so that I can track work and rest periods in real time.

#### Acceptance Criteria

1. WHILE a timer is running during a session, THE Cadence_App SHALL display an active countdown or interval UI showing remaining time, current round (for intervals), and elapsed time
2. WHEN a timed exercise or block completes, THE Cadence_App SHALL record the actual performed duration and rounds alongside the set or block log

### Requirement 19: Background Timer Alerts

**User Story:** As a user, I want timer completion alerts even when my phone is locked or the app is in the background, so that I never miss a rest period ending.

#### Acceptance Criteria

1. WHEN a timer reaches zero and the app is backgrounded or the screen is locked, THE Cadence_App SHALL deliver a completion alert with sound using scheduled local notifications
2. THE Cadence_App SHALL NOT require background GPS capabilities or continuous background execution for timer alerts

### Requirement 20: Personal Record Detection

**User Story:** As a user, I want PRs to be detected automatically when I log a set, so that achievements are captured in real time.

#### Acceptance Criteria

1. WHEN the user logs a set, THE Cadence_App SHALL evaluate whether the set constitutes a PR for that exercise across the user's full history
2. THE Cadence_App SHALL detect PRs for: best weight lifted, best reps at a given weight, and best estimated one-rep max
3. WHEN a PR is detected, THE Cadence_App SHALL immediately indicate the achievement to the user within the logging interface

### Requirement 21: Progression Visibility

**User Story:** As a user, I want to view my progression over time, so that I can see how my training is improving.

#### Acceptance Criteria

1. THE Cadence_App SHALL provide per-exercise history showing logged sets over time
2. THE Cadence_App SHALL provide a volume-by-muscle-group summary over a user-selectable time window
3. THE Cadence_App SHALL provide a basic activity summary showing session frequency and total volume trends; this summary SHALL include only Cadence-completed sessions and SHALL NOT count passively imported Health_Provider sessions unless the user explicitly links an imported session to a Program_Day

### Requirement 22: Session Journal Entries

**User Story:** As a user, I want to write or have the Agent draft a journal entry after my session, so that I can reflect on my training.

#### Acceptance Criteria

1. WHEN a session is completed, THE Cadence_App SHALL offer the user the option to create a journal entry for that session
2. THE Cadence_App SHALL support free-text journal entries associated with a completed session
3. WHEN the user requests it, THE Agent SHALL draft a journal entry summarizing the completed session, subject to the journal edits Permission_Category
4. THE Cadence_App SHALL allow the user to edit any Agent-drafted journal entry before or after saving

### Requirement 23: Configurable Permission Categories

**User Story:** As a user, I want to control which actions the Agent can perform automatically versus requiring my approval, so that I maintain control over my data.

#### Acceptance Criteria

1. THE Cadence_App SHALL provide configurable Permission_Categories for: program edits, journal edits, and Spotify actions
2. THE Cadence_App SHALL default all Permission_Categories to approval_required
3. WHEN the user changes a Permission_Category to auto_apply, THE Cadence_App SHALL allow the Agent to execute Tool_Calls in that category without explicit per-action confirmation
4. WHEN the user changes a Permission_Category back to approval_required, THE Cadence_App SHALL require explicit confirmation for subsequent Tool_Calls in that category

### Requirement 24: Agent Action Audit Log

**User Story:** As a user, I want a complete log of all Agent actions, so that I can review what the Agent has done on my behalf.

#### Acceptance Criteria

1. THE Cadence_App SHALL log every Agent Tool_Call with: timestamp, action type, Permission_Category, parameters, approval status (approved, auto-applied, or rejected), and outcome (success or failure)
2. THE Cadence_App SHALL provide the user with a viewable audit log of all Agent actions
3. THE Cadence_App SHALL retain audit log entries for the lifetime of the user's account; WHEN the account is deleted, audit log entries SHALL be deleted as part of the full user-data deletion defined in Requirement 28

### Requirement 25: Spotify Authentication

**User Story:** As a user, I want to connect my Spotify account, so that the Agent can manage playlists for my workouts.

#### Acceptance Criteria

1. THE Cadence_App SHALL authenticate with Spotify using OAuth2 PKCE flow
2. WHEN the user initiates Spotify connection, THE Cadence_App SHALL request only the scopes necessary for playlist search, creation, and modification
3. WHEN the user disconnects Spotify, THE Cadence_App SHALL revoke the stored tokens and cease all Spotify API interactions

### Requirement 26: Playlist Management via Agent

**User Story:** As a user, I want to ask the Agent to create or update Spotify playlists for my sessions, so that I have curated music for training.

#### Acceptance Criteria

1. WHEN the user requests a playlist, THE Agent SHALL search, create, or update Spotify playlists via Tool_Calls subject to the Spotify actions Permission_Category
2. THE Cadence_App SHALL support associating a Spotify playlist with a session, program phase, or program day
3. THE Cadence_App SHALL limit phase 1 Spotify scope to playlist search, creation, and modification; playback control is excluded from phase 1

### Requirement 27: User Authentication

**User Story:** As a user, I want to sign up and log in with email and password, so that my data is protected.

#### Acceptance Criteria

1. THE Auth_System SHALL support user registration and login via email and password
2. WHEN a user registers, THE Auth_System SHALL require email verification before granting full access
3. WHEN authentication fails, THE Auth_System SHALL return a generic error message that does not reveal whether the email exists in the system

### Requirement 28: Data Isolation

**User Story:** As a user, I want my data to be isolated from other users, so that no one else can access my training information.

#### Acceptance Criteria

1. THE Cadence_App SHALL enforce data isolation via Postgres Row Level Security policies on all user-owned tables
2. THE Cadence_App SHALL ensure no API endpoint or Edge_Function returns data belonging to a different user
3. WHEN a user is deleted, THE Cadence_App SHALL remove all user-owned data from the system, including: audit log entries, imported health data records, encrypted API keys, journal entries, session history, programs, and any Spotify token data

### Requirement 29: API Key Security

**User Story:** As a user, I want my AI API keys stored securely, so that they cannot be leaked or accessed by other users.

#### Acceptance Criteria

1. THE Cadence_App SHALL encrypt user-provided API keys at rest using server-side encryption
2. THE Cadence_App SHALL NOT include API key values in any client-bound response after initial submission
3. THE Cadence_App SHALL transmit API keys only over TLS-encrypted connections

### Requirement 30: Route Tracking Module (Phase 2)

**User Story:** As a user, I want to track my running and walking routes within Cadence, so that my cardio activities are linked to my training program.

#### Acceptance Criteria

1. THE Cadence_App SHALL provide a tracked activity module for running and walking, separate from but linked to the strength-training data model
2. WHEN the user starts route tracking, THE Cadence_App SHALL record GPS coordinates (latitude, longitude, timestamp, elevation if available) until the user manually stops tracking
3. THE Cadence_App SHALL continue route tracking while the app is backgrounded and the device screen is locked

### Requirement 31: Background GPS Feasibility (Phase 2)

**User Story:** As a user, I want reliable background GPS tracking during runs, so that my route is captured even when I am not looking at my phone.

#### Acceptance Criteria

1. THE Cadence_App SHALL include an explicit feasibility assessment comparing plain Expo managed workflow (expo-location background updates) against a custom Expo dev client using a dedicated background geolocation library before committing to a technical approach
2. THE Cadence_App SHALL NOT assume plain Expo Go managed workflow is sufficient for reliable background GPS tracking without validated testing

### Requirement 32: Route Data Storage (Phase 2)

**User Story:** As a user, I want my route data stored accurately with spatial indexing, so that distance calculations and future spatial queries are precise.

#### Acceptance Criteria

1. THE Cadence_App SHALL store route geometry using Supabase PostGIS extension with geography/point columns and spatial indexing rather than plain latitude/longitude float columns
2. THE Cadence_App SHALL store for each route: full GPS point stream (latitude, longitude, timestamp, elevation if available), and derived summary stats (distance, duration, average pace, average speed, elevation gain if available)
3. IF full route stats are unavailable for a given route, THEN THE Cadence_App SHALL fall back to average pace and speed only rather than failing

### Requirement 33: Route-Program Integration (Phase 2)

**User Story:** As a user, I want routes linked to my program days, so that my running fits into my overall training plan.

#### Acceptance Criteria

1. THE Cadence_App SHALL allow a Program_Day to contain gym exercises, a tracked route, or both
2. WHEN a route session is completed and linked to a Program_Day, THE Cadence_App SHALL store the association between the route and the session

### Requirement 34: Route History for Agent (Phase 2)

**User Story:** As a user, I want the Agent to access my route history, so that it can suggest playlists suited to my pace and running patterns.

#### Acceptance Criteria

1. THE Cadence_App SHALL make route history queryable by the Agent via Tool_Calls
2. WHEN the Agent requests route history, THE Cadence_App SHALL return summary stats (distance, duration, average pace) and optionally full route data if requested

### Requirement 35: Phase 2 Spotify Enhancements (Phase 2)

**User Story:** As a user, I want the Agent to propose playlists based on my route pace profile, so that my music matches my running intensity.

#### Acceptance Criteria

1. WHEN the user requests a running playlist, THE Agent SHALL consider the user's route history (pace profile, distance, duration) when constructing playlist suggestions
2. THE Cadence_App MAY support Spotify playback control in phase 2 as a candidate enhancement; playback control is NOT a required deliverable for phase 2 and SHALL be treated as optional scope that requires explicit approval before implementation

### Requirement 36: Phase 2 Scope Exclusions (Phase 2)

**User Story:** As a product stakeholder, I want phase 2 scope clearly bounded, so that route tracking ships without scope creep.

#### Acceptance Criteria

1. THE Cadence_App phase 2 SHALL exclude: live in-run stats dashboards, route matching and benchmarking, grade-adjusted pace, social route sharing, and advanced route analytics
2. THE Cadence_App phase 2 SHALL exclude vendor-direct integrations (Garmin, Fitbit) unless a concrete blocker is identified during planning

---

## Explicit Exclusions (All Phases)

The following are explicitly out of scope for Cadence:

- Google Drive integration
- Snapchat integration
- Social/community features
- Body measurement tracking
- Offline mode
- Push notifications (beyond local timer alerts)
- Images or video in workout logs
