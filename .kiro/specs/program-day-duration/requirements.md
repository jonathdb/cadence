# Requirements Document

## Introduction

This feature adds an optional `planned_duration_minutes` column to the `program_days` table, allowing users to specify expected session durations for each training day. The AI agent can use this information to tailor session length guidance and playlist suggestions. The field is settable during program creation and modification, and is surfaced in program retrieval responses.

## Glossary

- **System**: The Cadence backend platform comprising Supabase Postgres database, Edge Functions, and tool handler layer
- **program_days Table**: The database table storing training day definitions, currently with columns id, program_id, day_number, and name
- **planned_duration_minutes**: A nullable integer column representing the planned duration of a training day session in minutes
- **program_create Tool**: The tool handler that creates a new training program with days, exercises, sets, reps, and timer configurations
- **program_modify Tool**: The tool handler that modifies an existing program via structured change actions including modify_day
- **get_active_program Tool**: The tool handler that retrieves the user's currently active training program with full structure
- **get_programs Tool**: The tool handler that lists all user programs with summary information
- **Tool Definition**: The JSON schema describing a tool's interface, passed to the LLM so it can invoke structured actions
- **CHECK Constraint**: A Postgres constraint that validates column values against a specified condition on insert and update

## Requirements

### Requirement 1: Database Column Addition

**User Story:** As a developer, I want a planned_duration_minutes column on program_days, so that each training day can store an optional session duration.

#### Acceptance Criteria

1. THE System SHALL add a nullable integer column named `planned_duration_minutes` to the `program_days` table.
2. THE System SHALL enforce a CHECK constraint on `planned_duration_minutes` that permits NULL values or integer values between 1 and 480 inclusive.
3. WHEN a value outside the range 1–480 is inserted or updated into `planned_duration_minutes`, THE System SHALL reject the operation with a constraint violation error.
4. THE System SHALL implement this change as a new migration file sequenced after 20250101000011.

### Requirement 2: Program Creation Input

**User Story:** As a user, I want to specify a planned duration when creating a program day, so that the AI knows how long my sessions should last.

#### Acceptance Criteria

1. THE program_create Tool SHALL accept an optional `planned_duration_minutes` integer property on each day object in the `days` array.
2. WHEN `planned_duration_minutes` is provided in a day object during program creation, THE program_create Tool SHALL persist the value to the `planned_duration_minutes` column of the corresponding `program_days` row.
3. WHEN `planned_duration_minutes` is omitted from a day object during program creation, THE program_create Tool SHALL store NULL in the `planned_duration_minutes` column.

### Requirement 3: Program Modification Input

**User Story:** As a user, I want to set or update the planned duration on existing program days, so that I can adjust session lengths as my schedule changes.

#### Acceptance Criteria

1. THE program_modify Tool SHALL accept an optional `planned_duration_minutes` integer property in the `updates` object of a `modify_day` action.
2. WHEN `planned_duration_minutes` is provided in a modify_day updates object, THE program_modify Tool SHALL update the `planned_duration_minutes` column of the target program day row.
3. WHEN `planned_duration_minutes` is set to null explicitly in a modify_day updates object, THE program_modify Tool SHALL set the `planned_duration_minutes` column to NULL.

### Requirement 4: Program Retrieval Responses

**User Story:** As an AI agent, I want to see the planned duration for each day in program responses, so that I can provide relevant session length and playlist recommendations.

#### Acceptance Criteria

1. THE get_active_program Tool SHALL include `planned_duration_minutes` in each day object within the response payload.
2. THE get_programs Tool SHALL include `planned_duration_minutes` in each day object within the response payload.
3. WHEN `planned_duration_minutes` is NULL for a program day, THE System SHALL represent the value as null in the JSON response.

### Requirement 5: Tool Definition Exposure

**User Story:** As an AI agent, I want the tool definitions to describe the planned_duration_minutes field, so that I know the field exists and can use it correctly.

#### Acceptance Criteria

1. THE program_create Tool Definition SHALL include `planned_duration_minutes` as an optional integer property with description in the day object schema.
2. THE program_modify Tool Definition SHALL document that `planned_duration_minutes` is an accepted key in the modify_day action's updates object.
3. THE get_active_program Tool Definition SHALL describe that each day object in the response includes the `planned_duration_minutes` field.
4. THE get_programs Tool Definition SHALL describe that each day object in the response includes the `planned_duration_minutes` field.
