# Requirements Document

## Introduction

The Adaptive Programming feature adds a `suggest_progression` AI agent tool that applies heuristic-based progression rules to user training data and returns structured suggestions for next-session adjustments. The tool operates as a pure function within the existing Cadence Agent tool framework, receiving pre-fetched session history, recovery data, and program targets as input, then returning actionable suggestions that the agent presents conversationally before applying changes via `program_modify`.

## Glossary

- **Progression_Engine**: The pure function module (`progression-engine.ts`) that evaluates training data against heuristic rules and produces structured progression suggestions.
- **Suggest_Progression_Tool**: The agent tool (`suggest_progression`) registered in the tool handler system that invokes the Progression_Engine and returns suggestions to the agent.
- **Agent**: The Cadence AI training assistant that orchestrates tool calls, presents results to the user, and requests approval before modifications.
- **RPE**: Rate of Perceived Exertion, a numeric scale (1-10) logged by the user per set indicating subjective effort.
- **HRV**: Heart Rate Variability in milliseconds, imported from health data providers.
- **Deload**: A planned reduction in training volume and intensity to facilitate recovery.
- **Volume_Ceiling**: The maximum recommended weekly sets per muscle group (20 sets) before overreach risk is flagged.
- **Suggestion**: A structured output object describing a recommended change to an exercise within the user's program.
- **Upper_Body_Exercise**: An exercise where the `primary_muscle_group` field in the exercises table maps to chest, back, shoulders, biceps, or triceps.
- **Lower_Body_Exercise**: An exercise where the `primary_muscle_group` field in the exercises table maps to quads, hamstrings, glutes, or calves.

## Requirements

### Requirement 1: Tool Registration and Permission Gating

**User Story:** As a developer, I want the `suggest_progression` tool properly registered in the agent framework, so that the agent can invoke it with correct permissions.

#### Acceptance Criteria

1. THE Suggest_Progression_Tool SHALL be registered in the tool definitions file with a function-calling schema that accepts `exercise_history`, `recovery_summary`, `program_targets`, and `scope` parameters.
2. THE Suggest_Progression_Tool SHALL be mapped to the `program_edits` permission category in the tool permission map.
3. WHEN the Agent invokes `suggest_progression`, THE Tool_Executor SHALL apply the same permission gating logic (approval_required or auto_apply) as other tools in the `program_edits` category.
4. WHEN the Agent invokes `suggest_progression`, THE Tool_Executor SHALL log the invocation to the audit_log table.

### Requirement 2: Weight Increase Suggestion

**User Story:** As a user, I want to receive suggestions to increase weight when I am consistently performing well, so that I continue making strength progress.

#### Acceptance Criteria

1. WHEN RPE is below 7 on all sets for an exercise across 2 or more consecutive sessions, THE Progression_Engine SHALL produce a suggestion of type `increase_weight`.
2. WHEN an `increase_weight` suggestion is produced for an Upper_Body_Exercise, THE Progression_Engine SHALL set the suggested weight to current weight plus 2.5 kg.
3. WHEN an `increase_weight` suggestion is produced for a Lower_Body_Exercise, THE Progression_Engine SHALL set the suggested weight to current weight plus 5 kg.
4. THE Progression_Engine SHALL set the confidence to `high` when RPE is below 7 on all sets for 3 or more consecutive sessions.
5. THE Progression_Engine SHALL set the confidence to `medium` when RPE is below 7 on all sets for exactly 2 consecutive sessions.

### Requirement 3: Deload Suggestion

**User Story:** As a user, I want to be advised to deload when I am consistently over-exerting, so that I avoid injury and recover properly.

#### Acceptance Criteria

1. WHEN RPE exceeds 9 on the majority of sets (more than 50%) for an exercise in the most recent session, THE Progression_Engine SHALL produce a suggestion of type `deload`.
2. WHEN a `deload` suggestion is produced, THE Progression_Engine SHALL set the suggested weight to 90% of the current weight (rounded to the nearest 0.5 kg).
3. WHEN a `deload` suggestion is produced, THE Progression_Engine SHALL set the suggested sets to the current sets minus 1, with a minimum of 1 set.
4. THE Progression_Engine SHALL include reasoning text that explains the deload is recommended for one week.
5. THE Progression_Engine SHALL set the confidence to `high` for deload suggestions.

### Requirement 4: Reduce Weight Suggestion

**User Story:** As a user, I want to be told to reduce weight when I am consistently missing reps, so that I train within an effective range.

#### Acceptance Criteria

1. WHEN actual reps are below the lower bound of the target rep range for an exercise across 2 or more consecutive sessions, THE Progression_Engine SHALL produce a suggestion of type `reduce_weight`.
2. WHEN a `reduce_weight` suggestion is produced, THE Progression_Engine SHALL set the suggested weight to 95% of the current weight (rounded to the nearest 0.5 kg).
3. THE Progression_Engine SHALL set the confidence to `high` when reps are missed for 3 or more consecutive sessions.
4. THE Progression_Engine SHALL set the confidence to `medium` when reps are missed for exactly 2 consecutive sessions.

### Requirement 5: Recovery Concern Suggestion

**User Story:** As a user, I want to be warned when my recovery data indicates fatigue, so that I can adjust my training intensity accordingly.

#### Acceptance Criteria

1. WHEN average sleep hours over the recovery period are below 6 hours, THE Progression_Engine SHALL produce a suggestion of type `rest_day` for all exercises in the analyzed scope.
2. WHEN HRV is 20% or more below the user's baseline average, THE Progression_Engine SHALL produce a suggestion of type `rest_day` for all exercises in the analyzed scope.
3. WHEN a `rest_day` suggestion is produced, THE Progression_Engine SHALL retain the current weight and sets in the suggested values and include reasoning that recommends a lighter session.
4. THE Progression_Engine SHALL set the confidence to `high` when both sleep and HRV thresholds are breached simultaneously.
5. THE Progression_Engine SHALL set the confidence to `medium` when only one recovery threshold is breached.

### Requirement 6: Volume Ceiling Suggestion

**User Story:** As a user, I want to be alerted when my weekly volume for a muscle group exceeds safe limits, so that I can manage overreach risk.

#### Acceptance Criteria

1. WHEN total weekly sets for a muscle group exceed 20, THE Progression_Engine SHALL produce a suggestion of type `reduce_volume` for exercises contributing to that muscle group.
2. THE Progression_Engine SHALL use the `primary_muscle_group` field from the exercises table to classify exercises into muscle groups.
3. WHEN a `reduce_volume` suggestion is produced, THE Progression_Engine SHALL set the suggested sets to a value that brings the total weekly sets for the muscle group to 20 or below.
4. THE Progression_Engine SHALL set the confidence to `medium` for volume ceiling suggestions.
5. THE Progression_Engine SHALL include reasoning text that identifies the muscle group and the current weekly set total.

### Requirement 7: Maintain Suggestion

**User Story:** As a user, I want to know when my current load is appropriate, so that I have confidence to continue with my program as-is.

#### Acceptance Criteria

1. WHEN none of the progression rules (increase_weight, deload, reduce_weight, rest_day, reduce_volume) trigger for an exercise, THE Progression_Engine SHALL produce a suggestion of type `maintain`.
2. WHEN a `maintain` suggestion is produced, THE Progression_Engine SHALL set the suggested values equal to the current values.
3. THE Progression_Engine SHALL set the confidence to `high` for maintain suggestions.
4. THE Progression_Engine SHALL include reasoning text that explains the current load is appropriate.

### Requirement 8: Tool Input and Output Structure

**User Story:** As a developer, I want the tool to have a well-defined input/output contract, so that the agent can reliably call it and parse results.

#### Acceptance Criteria

1. THE Suggest_Progression_Tool SHALL accept an `exercise_history` parameter as an array of objects containing exercise name, muscle group, sets (with weight, reps, and RPE), and session dates.
2. THE Suggest_Progression_Tool SHALL accept a `recovery_summary` parameter as an object containing sleep hours, HRV in milliseconds, and resting heart rate.
3. THE Suggest_Progression_Tool SHALL accept a `program_targets` parameter as an object containing target sets, target rep range, target weight, and target RPE for each exercise.
4. THE Suggest_Progression_Tool SHALL accept a `scope` parameter with values `full_program` or `single_exercise`.
5. WHEN `scope` is `single_exercise`, THE Progression_Engine SHALL evaluate rules for only the first exercise in the exercise_history array.
6. WHEN `scope` is `full_program`, THE Progression_Engine SHALL evaluate rules for all exercises in the exercise_history array.
7. THE Suggest_Progression_Tool SHALL return an array of Suggestion objects, each containing `exercise_name`, `suggestion_type`, `current_values`, `suggested_values`, `confidence`, and `reasoning`.

### Requirement 9: Rule Priority and Conflict Resolution

**User Story:** As a user, I want only the most critical suggestion per exercise, so that I receive clear, unambiguous guidance.

#### Acceptance Criteria

1. WHEN multiple progression rules trigger for the same exercise, THE Progression_Engine SHALL apply rule priority in the following order: rest_day, deload, reduce_weight, reduce_volume, increase_weight, maintain.
2. THE Progression_Engine SHALL produce exactly one suggestion per exercise.
3. WHEN a `rest_day` suggestion applies globally (recovery concern), THE Progression_Engine SHALL override all other suggestion types for all exercises in scope.

### Requirement 10: System Prompt Integration

**User Story:** As a user, I want the agent to proactively offer progression advice when I ask about next steps, so that I receive contextual training recommendations.

#### Acceptance Criteria

1. THE Agent system prompt SHALL instruct the Agent to call `get_session_details`, `get_recovery_summary`, and `get_active_program` before calling `suggest_progression` when the user asks about progression, next steps, or program adjustments.
2. THE Agent system prompt SHALL instruct the Agent to present suggestions in a conversational format with reasoning.
3. THE Agent system prompt SHALL instruct the Agent to request explicit user confirmation before calling `program_modify` based on suggestions.

### Requirement 11: Progression Engine as Pure Function

**User Story:** As a developer, I want the progression logic isolated as a pure function, so that it can be unit tested independently of database and network dependencies.

#### Acceptance Criteria

1. THE Progression_Engine SHALL be implemented as an exported pure function in `supabase/functions/_shared/progression-engine.ts`.
2. THE Progression_Engine SHALL accept structured input data and return structured output data without performing database queries or network requests.
3. THE Progression_Engine SHALL be deterministic, producing the same output for the same input.
