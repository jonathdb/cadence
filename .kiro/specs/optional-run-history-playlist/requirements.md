# Requirements Document

## Introduction

This feature makes run/route history optional when the Cadence AI agent suggests or creates Spotify playlists for cardio sessions, and adds read-only tools so the agent can retrieve program structure, session history, and logged set data. Currently the system prompt and tool descriptions steer the agent toward requiring route history context, causing degraded behavior when a user has a program with running sessions but no tracked routes yet. Additionally, the agent has no tools to read existing programs or completed sessions, limiting its ability to make contextual suggestions and evolve programs over time. This change ensures the agent can produce useful playlist recommendations using program structure alone and can access all the data it needs to make informed training suggestions.

## Glossary

- **Agent**: The Cadence AI fitness training assistant that processes user messages and invokes tools
- **System_Prompt**: The instruction text that configures Agent behavior in the agent-chat Edge Function
- **Tool_Description**: The natural-language description field on each tool definition that guides the Agent on when and how to use the tool
- **Route_History**: GPS-tracked run/walk/cycle data including pace, distance, duration, and elevation
- **Program_Context**: Structured data from an active training program including session type (easy run, tempo, intervals), planned duration, and activity type
- **BPM_Range**: A beats-per-minute range used to search for pace-matched playlists on Spotify
- **Playlist_Suggestion_Tool**: The `spotify_suggest_pace_playlist` tool that searches Spotify for playlists matching a user's activity intensity
- **Fallback_Strategy**: The logic path the Agent follows when Route_History is unavailable
- **Active_Program**: The user's currently active training program (status = 'active'), including its days and exercises
- **Session**: A completed or in-progress workout session linked to a program day, containing logged sets
- **Logged_Set**: An individual set recorded during a session (exercise, reps, weight, RPE, PR status)
- **Genre_Seeds**: An array of Spotify genre strings (e.g., "pop", "hip-hop", "electronic") used to refine track recommendations via the Spotify Recommendations API
- **Artist_Seeds**: An array of Spotify artist identifiers (artist IDs or artist names resolved to IDs) used to seed track recommendations via the Spotify Recommendations API
- **Track_Seeds**: An array of Spotify track identifiers (track IDs or track names resolved to IDs) used to seed track recommendations via the Spotify Recommendations API
- **Music_Preferences**: A collective term for Genre_Seeds, Artist_Seeds, and Track_Seeds that a user provides to personalize playlist suggestions

## Requirements

### Requirement 1: System Prompt Allows Playlist Suggestions Without Route History

**User Story:** As a user with a new program and no tracked runs, I want the agent to suggest a playlist for my running session, so that I can get music recommendations without needing to complete runs first.

#### Acceptance Criteria

1. WHEN a user requests music for a cardio session and the user has no tracked routes for the requested activity type, THE System_Prompt SHALL instruct the Agent to invoke the Playlist_Suggestion_Tool using available Program_Context (activity type, planned duration, and session type) instead of declining the request or requiring route data
2. WHEN a user requests music for a cardio session and Route_History containing at least one tracked route for the requested activity type is available, THE System_Prompt SHALL instruct the Agent to pass Route_History pace data to the Playlist_Suggestion_Tool for pace-matched BPM_Range selection
3. THE System_Prompt SHALL NOT contain language that conditions invocation of the Playlist_Suggestion_Tool on Route_History availability, and SHALL explicitly state that Route_History is an optional input that enhances BPM accuracy when present
4. WHEN the System_Prompt is evaluated for compliance, THE System_Prompt text SHALL contain an instruction directing the Agent to use Program_Context (activity type, planned duration, session type) as the primary input for the Playlist_Suggestion_Tool, and to incorporate Route_History only when the user has tracked route data available

### Requirement 2: Tool Description Communicates Optional Route Context

**User Story:** As the AI agent, I need clear tool descriptions that tell me when to use the playlist suggestion tool, so that I invoke it correctly regardless of whether route data exists.

#### Acceptance Criteria

1. THE Tool_Description for the Playlist_Suggestion_Tool SHALL state that the tool operates with or without route history context and that `activity_type` is the only required parameter for invocation
2. THE Tool_Description SHALL state that route history enhances recommendations with pace-matched BPM accuracy when available but is not a prerequisite for invocation
3. THE Tool_Description SHALL list Program_Context fields (activity type, planned duration, session intensity) as valid alternative inputs that the Agent should pass when route history is unavailable
4. THE Tool_Description SHALL NOT contain language that conditions tool invocation on the presence of route history or implies that route data must be gathered before calling the tool

### Requirement 3: Program Context as Alternative Input Source

**User Story:** As a user with a training program but no run history, I want the agent to use my program's session details to suggest appropriate playlists, so that I receive relevant music for my planned workout.

#### Acceptance Criteria

1. WHEN Route_History is unavailable and Program_Context is available, THE Agent SHALL extract activity type, planned duration, and session intensity from the program and pass them as the `session_context` parameter (containing `session_type`, `planned_duration_minutes`, and `intensity_label`) to the Playlist_Suggestion_Tool call
2. WHEN Program_Context specifies a session type, THE Agent SHALL map the session type to a target pace estimate for BPM_Range determination using the following mapping: easy run to 390 seconds/km (BPM 150-165), tempo run to 310 seconds/km (BPM 170-180), interval session to 280 seconds/km (BPM 175-185), long run to 360 seconds/km (BPM 170-180)
3. WHEN neither Route_History nor Program_Context is available, THE Agent SHALL use the activity type alone to invoke the Playlist_Suggestion_Tool with the following default BPM_Range values: running 160-175 BPM, walking 115-135 BPM, cycling 130-160 BPM
4. IF Program_Context is partially available (activity type present but session type or planned duration missing), THEN THE Agent SHALL use the available fields and fall back to the activity-type default BPM_Range for any missing intensity information

### Requirement 4: Graceful Fallback Hierarchy

**User Story:** As a user, I want the agent to always provide a playlist suggestion for my cardio session regardless of how much data is available, so that I never receive a refusal when asking for workout music.

#### Acceptance Criteria

1. THE Agent SHALL follow this Fallback_Strategy priority order when determining the BPM_Range for the Playlist_Suggestion_Tool: (1) Route_History average pace data, (2) explicit target pace provided by the user in the current conversation, (3) Program_Context session intensity mapping (session_type to pace estimate), (4) activity-type default BPM_Range as defined by the determineBpmRange function
2. WHEN the Agent uses a data source at priority level 2, 3, or 4 from the Fallback_Strategy, THE Agent SHALL include a message informing the user that recommendations will improve as more route data is tracked
3. WHEN the Agent uses priority level 1 (Route_History) from the Fallback_Strategy, THE Agent SHALL NOT display the improvement message
4. IF the Playlist_Suggestion_Tool returns zero results for the initial query, THEN THE Agent SHALL retry by widening the BPM_Range by 10 BPM in each direction (reducing min by 10, increasing max by 10)
5. IF the Playlist_Suggestion_Tool returns zero results after widening the BPM_Range, THEN THE Agent SHALL fall back to the generic spotify_search_playlist tool using the activity type as the search query
6. IF both the widened BPM_Range query and the generic spotify_search_playlist fallback return zero results, THEN THE Agent SHALL inform the user that no matching playlists were found and suggest the user try a manual Spotify search with keywords related to their activity type

### Requirement 5: Tool Parameter Documentation for Program Context

**User Story:** As a developer extending the tool, I want the tool parameters to accept program-derived context, so that the agent can pass session details when route history is absent.

#### Acceptance Criteria

1. THE Playlist_Suggestion_Tool parameter schema SHALL accept an optional `session_context` object containing `session_type` (one of: "easy run", "tempo run", "interval session", "long run"), `planned_duration_minutes` (number, 1 to 480), and `intensity_label` (one of: "low", "moderate", "high")
2. WHEN `session_context` is provided and no `target_pace_seconds_per_km` or `recent_route_summary` is given, THE Playlist_Suggestion_Tool SHALL derive a target pace estimate from the session_type and intensity_label, and include the derived pace in the response as `effective_pace_seconds_per_km`
3. THE Playlist_Suggestion_Tool SHALL map session types to base pace estimates as follows: "easy run" to 390 seconds/km, "tempo run" to 310 seconds/km, "interval session" to 280 seconds/km, "long run" to 360 seconds/km, and then adjust by intensity_label: "low" adds 30 seconds/km, "moderate" applies no adjustment, "high" subtracts 20 seconds/km
4. IF `session_context` is provided with a `session_type` value that does not match one of the defined session types, THEN THE Playlist_Suggestion_Tool SHALL return an error response indicating the unrecognized session type and listing the valid options

### Requirement 6: Agent Can Retrieve Active Program Structure

**User Story:** As a user, I want the agent to see my current training program so that it can make contextual suggestions, evolve the program based on my progress, and use session details for playlist recommendations.

#### Acceptance Criteria

1. THE Agent SHALL have access to a `get_active_program` tool that retrieves the user's currently active program with its full structure (program ID, program name, status, days with day names and day numbers, and each day's items including exercise names, target sets, target reps, target weight, target RPE, timer config, and notes)
2. IF the user has no active program (no program with status = 'active'), THEN THE `get_active_program` tool SHALL return `{ "active_program": null }` rather than throwing an error
3. THE `get_active_program` tool SHALL resolve exercise IDs to exercise names in the response so the Agent receives human-readable data
4. THE `get_active_program` tool SHALL be categorized under the `program_edits` permission category and subject to the same permission gating as other program tools
5. THE `get_active_program` tool SHALL include the program's `created_at` and `updated_at` timestamps in the response
6. IF the database query fails, THEN THE tool SHALL throw an error with a descriptive message indicating the failure reason
7. THE `get_active_program` tool SHALL include block items (supersets, circuits, AMRAPs) with their block name, type, and timer_config alongside regular exercise items

### Requirement 7: Agent Can Retrieve Session History

**User Story:** As a user, I want the agent to see my completed workout sessions so that it can track my progress, identify trends, and make data-driven suggestions for program evolution.

#### Acceptance Criteria

1. THE Agent SHALL have access to a `get_session_history` tool that retrieves the user's recent completed sessions with summary data (session date, program day name, duration in seconds, total sets logged, total volume in kg, and PR count)
2. THE `get_session_history` tool SHALL accept an optional `limit` parameter (integer, range 1 to 100, default 10) to control how many sessions are returned
3. THE `get_session_history` tool SHALL accept an optional `program_id` parameter to filter sessions by a specific program
4. THE `get_session_history` tool SHALL only return sessions belonging to the authenticated user with status 'completed', ordered by `completed_at` descending
5. THE `get_session_history` tool SHALL be categorized under the `health_access` permission category
6. WHEN the user has no completed sessions matching the query parameters, THE tool SHALL return an empty list rather than throwing an error
7. IF the `program_id` parameter references a program that does not exist or does not belong to the authenticated user, THEN THE tool SHALL return an empty list without revealing whether the program exists
8. IF the `limit` parameter is outside the valid range (1 to 100), THEN THE tool SHALL return an error response indicating the valid range for the parameter

### Requirement 8: Agent Can Retrieve Detailed Session Data

**User Story:** As a user, I want the agent to see the specific sets and exercises I logged in a session so that it can analyze my performance, compare against targets, and suggest appropriate modifications.

#### Acceptance Criteria

1. THE Agent SHALL have access to a `get_session_details` tool that retrieves all logged sets for a specific session, grouped by exercise name
2. THE `get_session_details` tool SHALL require a `session_id` parameter (UUID)
3. FOR each logged set, THE tool SHALL return: exercise name, set number, reps, weight, RPE (null if not recorded), whether it was a PR (boolean), PR type (null if not a PR), and actual duration in seconds (null if not recorded)
4. THE tool SHALL return the session's summary metadata: program day name, session status, started_at, completed_at, and total_duration_seconds
5. THE `get_session_details` tool SHALL be categorized under the `health_access` permission category
6. IF the requested session_id does not exist or does not belong to the authenticated user, THEN THE tool SHALL return an error indicating the session was not found
7. THE tool SHALL also return any block_completions for the session (block name, actual duration, actual rounds) alongside the logged sets

### Requirement 9: Agent Can List User Programs

**User Story:** As a user, I want the agent to see all my programs (active, draft, and archived) so that it can reference past programs when making suggestions and help me evolve my training over time.

#### Acceptance Criteria

1. THE Agent SHALL have access to a `get_programs` tool that retrieves a list of all the user's programs with their ID, name, status, created_at, updated_at, and day count
2. THE `get_programs` tool SHALL accept an optional `status` filter parameter (one of: 'active', 'draft', 'archived', or 'all'; default 'all')
3. THE `get_programs` tool SHALL return programs ordered by `updated_at` descending (most recently modified first)
4. THE `get_programs` tool SHALL be categorized under the `program_edits` permission category and subject to the same permission gating as other program tools
5. FOR each program, THE tool SHALL include a `days_count` field indicating how many program days it contains, and a `sessions_count` field indicating how many completed sessions have been logged against it
6. WHEN the user has no programs matching the requested filter, THE `get_programs` tool SHALL return an empty list rather than throwing an error
7. IF the `get_programs` tool receives a `status` parameter value that does not match one of the defined values ('active', 'draft', 'archived', 'all'), THEN THE tool SHALL return an error response indicating the unrecognized status value and listing the valid options

### Requirement 10: System Prompt Updated to Use Retrieval Tools

**User Story:** As a user, I want the agent to proactively check my program and session data before making suggestions, so that its recommendations are always grounded in my actual training history.

#### Acceptance Criteria

1. THE System_Prompt SHALL instruct the Agent to call `get_active_program` as a prerequisite step before generating any response that proposes program modifications, suggests exercises, or recommends playlists for a session
2. THE System_Prompt SHALL instruct the Agent to call `get_session_history` when the user asks about progress, trends, volume changes, personal records, or consistency, or when the Agent is generating a program modification that requires understanding the user's recent training load
3. THE System_Prompt SHALL instruct the Agent to call `get_session_details` when the user references a specific past workout by date or name, asks how a session went, or when the Agent needs to compare logged sets against program targets to inform a modification
4. THE System_Prompt SHALL instruct the Agent to call `get_programs` when the user asks about past programs, requests a comparison between programs, or when the Agent is proposing a new program and needs historical context about what the user has previously trained
5. THE System_Prompt SHALL NOT instruct the Agent to ask the user to describe their program structure, exercise list, recent sessions, or training history when that information is retrievable via the retrieval tools
6. IF a retrieval tool returns an empty result or indicates no data exists, THEN THE System_Prompt SHALL instruct the Agent to proceed with the user's request using available conversational context and to inform the user that no stored data was found for that category


### Requirement 11: Tool Parameter Schema Accepts Music Preference Seeds

**User Story:** As a user with specific music tastes, I want to provide my preferred genres, artists, and tracks when the agent suggests playlists, so that the recommendations match my listening preferences alongside the pace-based filtering.

#### Acceptance Criteria

1. THE Playlist_Suggestion_Tool parameter schema SHALL accept an optional `genres` property defined as an array of strings, where each string represents a valid Spotify genre identifier (e.g., "pop", "hip-hop", "electronic", "rock")
2. THE Playlist_Suggestion_Tool parameter schema SHALL accept an optional `seed_artists` property defined as an array of strings, where each string represents a Spotify artist ID or an artist name that the tool resolves to a Spotify artist ID
3. THE Playlist_Suggestion_Tool parameter schema SHALL accept an optional `seed_tracks` property defined as an array of strings, where each string represents a Spotify track ID or a track name that the tool resolves to a Spotify track ID
4. THE Playlist_Suggestion_Tool SHALL limit the combined total of `genres`, `seed_artists`, and `seed_tracks` values to a maximum of 5 items, consistent with the Spotify Recommendations API constraint
5. IF the combined total of `genres`, `seed_artists`, and `seed_tracks` exceeds 5 items, THEN THE Playlist_Suggestion_Tool SHALL return an error response indicating that the combined seed count exceeds the maximum of 5 and listing the counts provided for each category
6. WHEN `genres`, `seed_artists`, or `seed_tracks` are provided, THE Playlist_Suggestion_Tool SHALL pass the values as `seed_genres`, `seed_artists`, and `seed_tracks` parameters to the Spotify Recommendations API alongside the BPM_Range target attributes

### Requirement 12: System Prompt Instructs Agent to Incorporate Music Preferences

**User Story:** As a user, I want the agent to ask about or detect my music preferences during playlist conversations, so that it uses my tastes to refine suggestions without requiring me to memorize parameter names.

#### Acceptance Criteria

1. THE System_Prompt SHALL instruct the Agent to ask the user about genre, artist, or song preferences when the user requests a playlist and has not previously stated Music_Preferences in the current conversation
2. THE System_Prompt SHALL instruct the Agent to detect mentions of genres, artist names, or song titles in the user's messages and extract them as Music_Preferences for the Playlist_Suggestion_Tool invocation
3. THE System_Prompt SHALL instruct the Agent to pass detected Music_Preferences as the `genres`, `seed_artists`, and `seed_tracks` parameters when invoking the Playlist_Suggestion_Tool
4. THE System_Prompt SHALL instruct the Agent to treat Music_Preferences as optional refinements and proceed with the playlist suggestion even if the user declines to provide preferences or does not respond to a preference question

### Requirement 13: Agent Passes Conversational Music Preferences to Tool

**User Story:** As a user who mentions "I like The Weeknd" or "something with electronic beats" in conversation, I want those preferences to flow through to the playlist tool automatically, so that I get personalized results without extra steps.

#### Acceptance Criteria

1. WHEN the user mentions one or more genre keywords in conversation (e.g., "electronic", "hip-hop", "rock"), THE Agent SHALL include the mentioned genres in the `genres` parameter of the Playlist_Suggestion_Tool call
2. WHEN the user mentions one or more artist names in conversation (e.g., "The Weeknd", "Daft Punk"), THE Agent SHALL include the mentioned artist names in the `seed_artists` parameter of the Playlist_Suggestion_Tool call
3. WHEN the user mentions one or more song titles in conversation (e.g., "Blinding Lights", "Lose Yourself"), THE Agent SHALL include the mentioned track names in the `seed_tracks` parameter of the Playlist_Suggestion_Tool call
4. WHEN the user provides more preferences than the combined maximum of 5 seeds allows, THE Agent SHALL select the 5 most recently mentioned or most relevant preferences and inform the user that only 5 seed values can be used at a time
5. WHEN the user explicitly states a preference that contradicts a previously mentioned one in the same conversation (e.g., "actually, not hip-hop, make it rock"), THE Agent SHALL use the most recent preference and discard the contradicted one

### Requirement 14: Music Preferences Work Alongside Existing Fallback Hierarchy

**User Story:** As a user, I want my music preferences to enhance recommendations at every level of the BPM fallback hierarchy, so that whether I have route data, program context, or just an activity type, my taste preferences still apply.

#### Acceptance Criteria

1. WHEN Music_Preferences are provided alongside Route_History (Fallback_Strategy priority level 1), THE Playlist_Suggestion_Tool SHALL use both the Route_History-derived BPM_Range and the Music_Preferences as seed parameters in the Spotify Recommendations API call
2. WHEN Music_Preferences are provided alongside Program_Context (Fallback_Strategy priority level 3), THE Playlist_Suggestion_Tool SHALL use both the session_context-derived BPM_Range and the Music_Preferences as seed parameters in the Spotify Recommendations API call
3. WHEN Music_Preferences are provided alongside activity-type defaults (Fallback_Strategy priority level 4), THE Playlist_Suggestion_Tool SHALL use both the default BPM_Range for the activity type and the Music_Preferences as seed parameters in the Spotify Recommendations API call
4. WHEN Music_Preferences are provided with an explicit target pace from the user (Fallback_Strategy priority level 2), THE Playlist_Suggestion_Tool SHALL use both the user-stated pace-derived BPM_Range and the Music_Preferences as seed parameters in the Spotify Recommendations API call
5. THE Music_Preferences SHALL NOT alter the BPM_Range determination logic; Music_Preferences refine the track selection within the determined BPM_Range, not the range itself

### Requirement 15: Backward Compatibility Without Music Preferences

**User Story:** As a user who does not care about specifying music preferences, I want the playlist tool to work exactly as before without requiring me to provide genres, artists, or tracks.

#### Acceptance Criteria

1. WHEN the user does not provide Music_Preferences and the Agent does not detect any genre, artist, or track mentions in the conversation, THE Playlist_Suggestion_Tool SHALL operate using BPM_Range and activity_type alone, producing results identical to the behavior prior to this feature addition
2. THE Playlist_Suggestion_Tool SHALL NOT require `genres`, `seed_artists`, or `seed_tracks` parameters for invocation; all three parameters SHALL remain optional with no default values
3. WHEN `genres`, `seed_artists`, and `seed_tracks` are all absent or empty arrays, THE Playlist_Suggestion_Tool SHALL skip the Spotify Recommendations API seed parameters entirely and use the existing playlist search logic based on BPM_Range
4. IF the Spotify Recommendations API returns zero results when Music_Preferences seeds are provided, THEN THE Playlist_Suggestion_Tool SHALL retry without the seed parameters (using only BPM_Range) before falling through to the existing BPM-widening and generic search fallbacks defined in the Fallback_Strategy
