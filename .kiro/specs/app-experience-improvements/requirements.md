# Requirements Document

## Introduction

This spec defines a set of user-experience and capability improvements for the Cadence fitness app (Expo React Native client + Supabase Postgres and edge functions) delivered after the in-chat model picker launch. The improvements span six independent areas: (1) ensuring the floating tab dock never hides interactive controls, (2) enriching the exercise library with explanatory text and visual demonstrations, (3) letting users delete programs safely, (4) extending edit and delete of sessions, exercises, and programs to both the human user and the AI agent across every screen where those entities appear, (5) a skippable first-run onboarding flow for new users, and (6) three targeted fixes to the in-chat model picker.

Each area is captured as its own top-level requirement with a user story and testable EARS acceptance criteria. Two decisions are deliberately deferred to the design phase and flagged as open questions: the exercise-media source/licensing selection (Requirement 2) and the behavior for deleting a program that has linked history (Requirement 3).

## Glossary

- **Floating_Dock**: The custom absolute-positioned bottom navigation component (`src/components/ui/FloatingTabBar.tsx`) that renders over screen content on tab screens, styled as a rounded floating bar rather than an inline system tab bar.
- **TabBarClearance**: A shared numeric constant (`= 96`, defined in `src/constants/theme.ts`) representing the bottom padding a scrollable view reserves so its content clears the Floating_Dock. Screens combine it with safe-area insets as `paddingBottom: TabBarClearance + insets.bottom`.
- **Safe_Area_Inset**: The device-reported bottom inset (e.g. home indicator / gesture bar) obtained from safe-area context, added on top of TabBarClearance.
- **Tab_Screen**: Any screen rendered within the `(tabs)` navigator group where the Floating_Dock is visible.
- **Interactive_Control**: Any element the user can activate or manipulate — buttons, toggles, switches, links, form inputs, and the last item of a list.
- **Exercise_Library**: The catalog of exercises stored in the `exercises` table (which already includes an `equipment` column added in migration 17) and surfaced in the client.
- **Exercise_Media**: A static image and/or looping animation or video (GIF/video) that demonstrates an exercise being performed.
- **Exercise_Instance**: An exercise as placed within a Program day or Session, carrying instance-specific fields (sets, reps, load/weight, rest interval, instance notes), distinct from the shared catalog exercise in the Exercise_Library.
- **Program**: A user's training program, editable at `src/app/(tabs)/program/edit/[programId].tsx` and listed at `src/app/(tabs)/program/library.tsx`.
- **Session**: A training session/day associated with a program (e.g. `src/app/(tabs)/session/[dayId].tsx`).
- **AI_Agent**: The assistant that performs actions through approval-gated tool calls via the `agent-chat` / `execute-tool-call` edge functions and `supabase/functions/_shared/tool-handlers.ts`.
- **Approval_Gate**: The `pending_approval` flow (client side in `src/app/(tabs)/chat/index.tsx`) that requires explicit user confirmation before the AI_Agent performs a destructive or mutating action.
- **Agent_Tool**: A defined capability the AI_Agent can invoke (e.g. `program_create`, `program_modify`, `program_activate` in `tool-handlers.ts` / `tool-definitions.ts`).
- **User_Profile**: The training-profile record stored in `user_profiles` (migration `20250101000016_user_profiles.sql`) and edited at `src/app/(tabs)/settings/profile.tsx`.
- **Onboarding_Flow**: The guided first-run setup presented to a new user to collect User_Profile fields.
- **Model_Picker**: The in-chat model selection UI (`src/components/ModelPicker.tsx`) presented in a bottom-sheet modal.
- **Model_Catalog**: The provider/model data returned by the `list-models` edge function, where each provider reports `hasUserKey`, `hasBackendKey`, `curatedModelIds`, and a `models[]` array whose entries carry a `curated` flag.
- **BYOK_User**: A "bring your own key" user who has supplied their own provider API key and may therefore select any live model for that keyed provider.
- **Curated_Model**: A model flagged `curated` in the Model_Catalog; non-BYOK users may select only curated models.

## Requirements

### Requirement 1: Floating dock never obscures interactive controls

**User Story:** As an app user, I want the floating tab dock to never cover interactive controls, so that I can reach every button, toggle, link, and list item on any tab screen.

#### Acceptance Criteria

1. WHERE a Tab_Screen hosts a scroll container, THE Tab_Screen SHALL apply bottom padding to that scroll container's content equal to TabBarClearance plus the current Safe_Area_Inset.
2. WHERE a Tab_Screen displays Interactive_Controls, THE Tab_Screen SHALL render every Interactive_Control such that no part of any Interactive_Control is overlapped by the Floating_Dock, leaving a vertical gap of at least 8 points between the bottommost Interactive_Control and the top edge of the Floating_Dock when that control is at its resting scroll position.
3. WHILE a Tab_Screen's content is scrollable, THE Tab_Screen SHALL allow the last Interactive_Control to be scrolled to a position whose bottom edge is at least 8 points above the top edge of the Floating_Dock.
4. WHERE a fixed-position footer Interactive_Control is rendered outside the scroll container (for example the "Start session" button), THE Tab_Screen SHALL apply to that footer a bottom offset equal to TabBarClearance plus the current Safe_Area_Inset, independent of the scroll-content padding defined in criterion 1.
5. WHEN the Program day details screen (`src/app/(tabs)/session/[dayId].tsx`) is displayed, THE Program day details screen SHALL render the fixed-position "Start session" button with its bottom edge at least 8 points above the top edge of the Floating_Dock.
6. WHEN the Agent permissions screen is displayed, THE Agent permissions screen SHALL render the bottom option with its bottom edge at least 8 points above the top edge of the Floating_Dock.
7. WHERE a Tab_Screen is non-scrollable, THE Tab_Screen SHALL position the bottom edge of its bottommost Interactive_Control at least 8 points above the top edge of the Floating_Dock.

### Requirement 2: Richer exercise library with explanatory media

**User Story:** As a user encountering an unfamiliar exercise, I want each exercise to include a description, a beginner-friendly explanation, and a visual demonstration, so that I understand what the exercise is and how to perform it.

#### Acceptance Criteria

1. THE Exercise_Library SHALL store a text description (what the exercise is) for each exercise.
2. THE Exercise_Library SHALL store a beginner-friendly explanation for each exercise.
3. WHEN an exercise detail view is displayed, THE Exercise_Library SHALL render the description and beginner-friendly explanation as text before any Exercise_Media has finished loading, such that text content is not blocked by media.
4. WHEN an exercise detail view is displayed AND Exercise_Media is available, THE Exercise_Library SHALL present Exercise_Media (image and/or looping animation or video) demonstrating the exercise.
5. IF Exercise_Media is unavailable or fails to load, THEN THE Exercise_Library SHALL display a placeholder and present the available text content without error.
6. WHERE an existing exercise record predates the new description, explanation, and media fields, THE Exercise_Library SHALL render that exercise without error, showing available fields and placeholders for missing ones.
7. WHILE the device is offline, THE Exercise_Library SHALL render exercise text content and SHALL show a placeholder for any Exercise_Media that cannot be retrieved.
8. THE Exercise_Library SHALL honor the licensing and attribution obligations of the selected Exercise_Media source, including displaying required attribution where mandated.

> **Open Question (deferred to design):** The Exercise_Media source is undecided. The design phase MUST evaluate and select among: (a) the wger REST API (free/open-source, AGPL-3.0); (b) ExerciseDB-style open datasets on GitHub (1,300–11,000+ exercises with animated GIFs, muscle/equipment metadata, and step-by-step instructions; per-repo licenses ranging from AGPL-3.0 to commercial-only — license MUST be verified per repository); and (c) importing a static open dataset (e.g. a ~1,324-exercise GIF + thumbnail + instructions dataset) into the app's own Supabase storage/DB to avoid a runtime third-party dependency. The selection and per-source license verification are deferred to design.

### Requirement 3: Delete programs

**User Story:** As a user, I want to delete a program from the program library and from the program view/edit screen, so that I can remove programs I no longer want, with protection against accidental deletion.

#### Acceptance Criteria

1. WHEN the user views the Program library list (`src/app/(tabs)/program/library.tsx`), THE Program library list SHALL display a delete affordance for each Program.
2. WHEN the user views or edits a Program (`src/app/(tabs)/program/edit/[programId].tsx` or the program index), THE Program view SHALL display a delete affordance for the current Program.
3. WHEN the user activates a delete affordance for a Program, THE app SHALL display a confirmation step that includes the name of the target Program and requires a distinct confirm action before any deletion occurs.
4. WHEN the user confirms deletion of a Program, THE app SHALL delete that Program and remove it from the Program library list within 2 seconds under normal connectivity.
5. IF the user cancels or dismisses the confirmation step, THEN THE app SHALL retain the Program unchanged and perform no deletion.
6. IF deletion of a Program fails, THEN THE app SHALL retain the Program unchanged, keep it in the list, and display an error indication.
7. WHILE the app is offline, WHEN the user confirms deletion of a Program, THE app SHALL remove it locally and synchronize the deletion when connectivity is restored.
8. WHEN the user confirms deletion of the currently active Program, THE app SHALL clear the active-Program designation so no deleted Program remains marked active.

> **Open Question (deferred to design):** The expected behavior for deleting a Program that has linked Sessions or logged history is undecided. The design phase MUST choose among: blocking deletion of a Program that has history, cascading the delete to linked data, or archiving the Program instead of deleting it. The chosen behavior will be added as concrete acceptance criteria in design.

### Requirement 4: Manual and agent edit/delete for sessions, exercises, and programs

**User Story:** As a user (directly and through the AI agent), I want to edit and delete sessions, exercises, and programs from every screen where they appear, so that I can maintain my training data by hand or by asking the assistant, with confirmation on destructive actions.

#### Acceptance Criteria

1. WHERE a Session is displayed on any screen, THE screen SHALL provide a visible edit affordance and a visible delete affordance for that Session.
2. WHEN the user activates the edit affordance for a Session, THE app SHALL allow modifying the Session's editable fields (date, scheduled/actual time, session-level notes, completion status) and SHALL persist changes on confirmation.
3. WHERE an Exercise_Instance is displayed within a Program day or Session on any screen, THE screen SHALL provide a visible edit affordance and a visible delete affordance for that Exercise_Instance, where an edit affects only that instance and does not modify the shared catalog exercise.
4. WHEN the user activates the edit affordance for an Exercise_Instance, THE app SHALL allow modifying that instance's editable fields (sets, reps, load/weight, rest interval, instance notes) and SHALL persist changes on confirmation.
5. WHERE a Program is displayed on any screen, THE screen SHALL provide a visible delete affordance for that Program (consistent with Requirement 3).
6. WHEN the user requests a delete of a Session, Exercise_Instance, or Program through a UI affordance, THE app SHALL prompt for explicit confirmation and SHALL NOT delete until confirmed.
7. WHEN the user confirms a delete via UI, THE app SHALL delete the entity and update every affected view within 2 seconds.
8. IF the user cancels a delete confirmation prompt, THEN THE app SHALL leave the target entity unchanged.
9. THE AI_Agent SHALL expose Agent_Tools to edit and delete Sessions and Exercise_Instances and to delete Programs, in addition to the existing `program_create`, `program_modify`, and `program_activate` tools.
10. WHEN the AI_Agent requests an edit or delete of a Session, Exercise_Instance, or Program, THE app SHALL route the action through the Approval_Gate and require explicit user confirmation before performing it.
11. IF the user rejects an AI_Agent edit or delete at the Approval_Gate, THEN THE app SHALL leave the entity unchanged and present an indication that the action was not applied.
12. IF the user confirms deletion of a Session or Exercise_Instance referenced by logged history, THEN THE app SHALL delete the entity while preserving the associated logged history records as an independent record of past activity.
13. WHILE the device is offline, WHEN a confirmed edit or delete completes, THE app SHALL apply the change locally and synchronize to the backend within 30 seconds of connectivity being restored.
14. WHEN an edit or delete completes (via UI or AI_Agent), THE app SHALL reflect the change consistently on all screens where the entity appears.

### Requirement 5: First-run onboarding for new users

**User Story:** As a new user, I want a friendly guided setup on my first login that collects my training profile and that I can skip at any time, so that I can get started quickly without being forced through setup.

#### Acceptance Criteria

1. WHEN a user logs in AND that user's server-persisted onboarding-resolved state is neither "completed" nor "skipped", THE app SHALL present the Onboarding_Flow within 2 seconds of the authenticated session becoming active.
2. THE Onboarding_Flow SHALL collect goal, experience_level, bodyweight with unit, injuries, equipment, preferred_training_days, weekly_frequency, training_notes, and THE app SHALL treat every field as optional such that leaving any or all empty never blocks progression, completion, or skipping.
3. THE Onboarding_Flow SHALL provide a skip action present and selectable on every step, including the first and last.
4. WHEN the user skips, THE app SHALL grant full access to all features available to a user who completed onboarding, without requiring any field.
5. WHEN the user completes OR skips, THE app SHALL persist the onboarding-resolved state ("completed" or "skipped") server-side in `user_profiles` such that it survives reinstall and login from a different device, and SHALL NOT present the Onboarding_Flow again while that state is set.
6. WHEN the user skips after entering values on one or more steps, THE app SHALL persist every entered field value to `user_profiles` and leave non-entered fields empty.
7. WHEN the user submits collected values, THE app SHALL write them to `user_profiles`.
8. IF the write of values or onboarding-resolved state fails, THEN THE app SHALL retain entered values in the current session, display an error indication, and NOT record the state as resolved.
9. THE app SHALL allow every onboarding-collected User_Profile field to be viewed and edited later in Settings (`src/app/(tabs)/settings/profile.tsx`).
10. WHEN the user selects a re-run onboarding action in Settings, THE app SHALL present the Onboarding_Flow again regardless of current state.

### Requirement 6: Model picker UX fixes

**User Story:** As a user selecting a model in chat, I want the model list to scroll reliably, unavailable providers to collapse into a single entry, and each provider to show only its most relevant models, so that the picker is usable and not cluttered.

#### Acceptance Criteria

1. WHILE the Model_Picker modal is open on a device, THE Model_Picker SHALL allow the model list to scroll through its full content.
2. WHERE all of a provider's models are unavailable (no user key AND none curated), THE Model_Picker SHALL display a single collapsed entry for that provider labeled unavailable (for example "OpenAI — unavailable") with a short message to add a key in Settings.
3. WHERE all of a provider's models are unavailable, THE Model_Picker SHALL NOT list that provider's individual models.
4. WHEN the user taps a provider's unavailable entry, THE Model_Picker SHALL navigate to the Settings API keys screen.
5. THE Model_Picker SHALL display at most 5 models per provider.
6. WHERE a provider has more than 5 selectable models, THE Model_Picker SHALL display exactly 5, ordered curated-first then by descending recency, and SHALL treat that deterministic order as "most relevant".
7. WHERE a provider has 1 to 5 selectable models, THE Model_Picker SHALL display all of them.
8. WHERE the user is a BYOK_User for a provider, THE Model_Picker SHALL allow selection of any model shown for that provider.
9. WHERE the user is not a BYOK_User for a provider, THE Model_Picker SHALL allow selection only of Curated_Models for that provider.
