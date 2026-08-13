# Implementation Plan: Adaptive Programming

## Overview

Implement a heuristic-based progression engine as a pure function in the Supabase Edge Functions shared directory, register a `suggest_progression` tool in the existing agent tool framework, and update the system prompt to guide the agent in using the tool. The engine evaluates exercise history, recovery data, and program targets to produce structured progression suggestions.

## Tasks

- [ ] 1. Create Progression Engine module with types and helpers
  - [ ] 1.1 Create `supabase/functions/_shared/progression-engine.ts` with all exported types and interfaces
    - Define `MuscleGroup`, `SuggestionType`, `Confidence`, `Scope` types
    - Define `SetData`, `SessionEntry`, `ExerciseHistory`, `RecoverySummary`, `ProgramTarget`, `ProgressionInput` input interfaces
    - Define `ExerciseValues`, `Suggestion` output interfaces
    - Export the `RULE_PRIORITY` array
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7, 11.1_

  - [ ] 1.2 Implement helper functions in progression-engine.ts
    - Implement `roundToHalf(value: number): number` for rounding to nearest 0.5 kg
    - Implement `parseRepRange(range: string): { lower: number; upper: number }` with fallback for unparseable input
    - Implement `isUpperBody(muscleGroup: MuscleGroup): boolean` for muscle group classification
    - Implement `getWeightIncrement(muscleGroup: MuscleGroup): number` returning 2.5 for upper body, 5.0 for lower body
    - _Requirements: 2.2, 2.3, 4.1, 11.2_

- [ ] 2. Implement rule evaluation functions
  - [ ] 2.1 Implement `evaluateRecoveryConcern` function
    - Check sleep breach: `avg_sleep_hours < 6`
    - Check HRV breach: `(hrv_baseline_ms - hrv_ms) / hrv_baseline_ms >= 0.20`
    - Handle `hrv_baseline_ms = 0` by skipping HRV check
    - Return confidence `high` when both breached, `medium` when only one
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

  - [ ] 2.2 Implement `evaluateDeload` function
    - Filter sets with non-null RPE
    - Check if >50% of sets with RPE data have RPE > 9 in the most recent session
    - Return `{ triggered: false }` when no sets have RPE data
    - _Requirements: 3.1_

  - [ ] 2.3 Implement `evaluateReduceWeight` function
    - Iterate sessions most-recent-first counting consecutive sessions where average reps < lower bound
    - Return triggered when streak >= 2, with streak count
    - _Requirements: 4.1_

  - [ ] 2.4 Implement `evaluateReduceVolume` function
    - Calculate total weekly sets per muscle group from program_targets joined with exercise_history
    - Return a Map of muscle groups to their weekly set totals
    - _Requirements: 6.1, 6.2_

  - [ ] 2.5 Implement `evaluateIncreaseWeight` function
    - Iterate sessions most-recent-first counting consecutive sessions where all sets with RPE have RPE < 7
    - Break on sessions with no RPE data
    - Return triggered when streak >= 2, with streak count
    - _Requirements: 2.1_

- [ ] 3. Implement main `evaluateProgression` function
  - [ ] 3.1 Implement scope handling and recovery concern global override
    - Slice exercise_history based on scope (`single_exercise` → first only, `full_program` → all)
    - Evaluate recovery concern first; if triggered, return `rest_day` for all exercises with current values preserved
    - Handle empty exercise_history by returning empty array
    - Handle exercises with empty sessions by producing `maintain`
    - _Requirements: 5.1, 5.2, 5.3, 8.5, 8.6, 9.3_

  - [ ] 3.2 Implement per-exercise rule evaluation with priority ordering
    - Evaluate rules in priority order: deload → reduce_weight → reduce_volume → increase_weight → maintain
    - For deload: set `weight = roundToHalf(current * 0.9)`, `sets = max(1, current - 1)`, confidence `high`
    - For reduce_weight: set `weight = roundToHalf(current * 0.95)`, confidence based on streak (≥3 = high, 2 = medium)
    - For reduce_volume: calculate suggested sets to bring muscle group total to ≤ 20, confidence `medium`
    - For increase_weight: add increment based on muscle group, confidence based on streak (≥3 = high, 2 = medium)
    - For maintain: preserve current values, confidence `high`
    - Include reasoning text for each suggestion type
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 3.2, 3.3, 3.4, 3.5, 4.2, 4.3, 4.4, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 9.1, 9.2_

- [ ] 4. Checkpoint - Verify progression engine logic
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Register tool in the agent framework
  - [ ] 5.1 Add tool definition schema in `supabase/functions/_shared/tool-definitions.ts`
    - Add the `suggest_progression` function-calling schema with `exercise_history`, `recovery_summary`, `program_targets`, and `scope` parameters
    - Match the exact schema structure from the design document
    - _Requirements: 1.1, 8.1, 8.2, 8.3, 8.4_

  - [ ] 5.2 Add tool handler in `supabase/functions/_shared/tool-handlers.ts`
    - Import `evaluateProgression` and input types from `progression-engine.ts`
    - Register `suggest_progression` handler that delegates to the progression engine
    - Handler should cast args and default scope to `'full_program'` if not provided
    - _Requirements: 1.1, 11.2_

  - [ ] 5.3 Add permission mapping in `supabase/functions/_shared/tool-executor.ts`
    - Add `suggest_progression: 'program_edits'` to `TOOL_PERMISSION_MAP`
    - _Requirements: 1.2, 1.3, 1.4_

- [ ] 6. Update system prompt for progression advice
  - [ ] 6.1 Add progression-related instructions to `getSystemPrompt()` in `supabase/functions/agent-chat/index.ts`
    - Add `suggest_progression` to the capabilities list
    - Add guideline: call `get_session_details`, `get_recovery_summary`, and `get_active_program` before calling `suggest_progression` when user asks about progression, next steps, or program adjustments
    - Add guideline: present suggestions conversationally with reasoning
    - Add guideline: request explicit user confirmation before calling `program_modify` based on suggestions
    - _Requirements: 10.1, 10.2, 10.3_

- [ ] 7. Checkpoint - Verify tool integration
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Write unit tests for progression engine
  - [ ]* 8.1 Write unit tests for helper functions
    - Test `roundToHalf` with various values (exact halves, rounding up, rounding down)
    - Test `parseRepRange` with valid ranges and unparseable input
    - Test `isUpperBody` for all muscle groups
    - Test `getWeightIncrement` for upper and lower body
    - File: `tests/unit/progression-engine.test.ts`
    - _Requirements: 2.2, 2.3, 4.1, 11.3_

  - [ ]* 8.2 Write unit tests for rule evaluation scenarios
    - Test deload: >50% sets with RPE > 9 triggers deload; ≤50% does not
    - Test reduce_weight: 2-session and 3-session miss streaks with correct confidence
    - Test increase_weight: 2-session and 3-session low-RPE streaks with correct confidence
    - Test recovery concern: sleep breach only, HRV breach only, both breached, neither breached
    - Test volume ceiling: muscle group over 20 sets, reduce_volume suggestion
    - Test maintain: no rules trigger → maintain with current values
    - Test reasoning text content (deload mentions "one week", reduce_volume identifies muscle group)
    - File: `tests/unit/progression-engine.test.ts`
    - _Requirements: 2.1, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4_

  - [ ]* 8.3 Write unit tests for tool registration and permission mapping
    - Verify tool definition schema exists with correct structure
    - Verify permission map has `suggest_progression` → `program_edits`
    - File: `tests/unit/progression-engine.test.ts`
    - _Requirements: 1.1, 1.2_

- [ ] 9. Write property-based tests for progression engine
  - [ ]* 9.1 Write property test for determinism
    - **Property 1: Determinism**
    - For any valid ProgressionInput, calling evaluateProgression twice with the same input produces identical output
    - **Validates: Requirements 11.3**
    - File: `tests/property/progression-engine.prop.ts`

  - [ ]* 9.2 Write property test for exactly one suggestion per exercise
    - **Property 2: Exactly one suggestion per exercise**
    - Output array length equals 1 for single_exercise scope, N for full_program scope
    - **Validates: Requirements 8.5, 8.6, 9.2**
    - File: `tests/property/progression-engine.prop.ts`

  - [ ]* 9.3 Write property test for output structure completeness
    - **Property 3: Output structure completeness**
    - Every Suggestion has non-empty exercise_name, valid suggestion_type, complete current_values and suggested_values, valid confidence, and non-empty reasoning
    - **Validates: Requirements 8.7**
    - File: `tests/property/progression-engine.prop.ts`

  - [ ]* 9.4 Write property test for recovery concern global override
    - **Property 4: Recovery concern global override**
    - When sleep < 6 or HRV drop >= 20%, all suggestions are rest_day with suggested_values equal to current_values
    - **Validates: Requirements 5.1, 5.2, 5.3, 9.3**
    - File: `tests/property/progression-engine.prop.ts`

  - [ ]* 9.5 Write property test for recovery confidence based on threshold count
    - **Property 5: Recovery confidence based on threshold count**
    - Confidence is high when both thresholds breached, medium when only one
    - **Validates: Requirements 5.4, 5.5**
    - File: `tests/property/progression-engine.prop.ts`

  - [ ]* 9.6 Write property test for increase weight rule and increment
    - **Property 6: Increase weight rule trigger and increment**
    - When RPE < 7 for 2+ consecutive sessions and no higher-priority rule triggers, suggestion is increase_weight with correct increment (2.5 upper, 5.0 lower)
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - File: `tests/property/progression-engine.prop.ts`

  - [ ]* 9.7 Write property test for increase weight confidence
    - **Property 7: Increase weight confidence based on streak**
    - Confidence is high for streak ≥ 3, medium for streak = 2
    - **Validates: Requirements 2.4, 2.5**
    - File: `tests/property/progression-engine.prop.ts`

  - [ ]* 9.8 Write property test for deload calculation
    - **Property 8: Deload calculation**
    - When >50% sets have RPE > 9 and no rest_day override, suggestion is deload with weight = roundToHalf(current * 0.9), sets = max(1, current - 1), confidence = high
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.5**
    - File: `tests/property/progression-engine.prop.ts`

  - [ ]* 9.9 Write property test for reduce weight calculation and confidence
    - **Property 9: Reduce weight calculation and confidence**
    - When reps below lower bound for 2+ sessions and no higher-priority rule, weight = roundToHalf(current * 0.95), confidence high for streak ≥ 3, medium for streak = 2
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    - File: `tests/property/progression-engine.prop.ts`

  - [ ]* 9.10 Write property test for volume ceiling enforcement
    - **Property 10: Volume ceiling enforcement**
    - When weekly sets > 20 and no higher-priority rule, suggestion is reduce_volume with sets bringing total ≤ 20, confidence medium
    - **Validates: Requirements 6.1, 6.3, 6.4**
    - File: `tests/property/progression-engine.prop.ts`

  - [ ]* 9.11 Write property test for maintain preserves values
    - **Property 11: Maintain preserves values**
    - When no rule triggers, suggestion is maintain with suggested_values = current_values, confidence high
    - **Validates: Requirements 7.1, 7.2, 7.3**
    - File: `tests/property/progression-engine.prop.ts`

  - [ ]* 9.12 Write property test for rule priority ordering
    - **Property 12: Rule priority ordering**
    - When multiple rules would trigger, only the highest-priority rule produces the suggestion
    - **Validates: Requirements 9.1**
    - File: `tests/property/progression-engine.prop.ts`

  - [ ]* 9.13 Write property test for weight rounding invariant
    - **Property 13: Weight rounding invariant**
    - For any suggestion that modifies weight, suggested_values.weight is a multiple of 0.5
    - **Validates: Requirements 3.2, 4.2**
    - File: `tests/property/progression-engine.prop.ts`

  - [ ]* 9.14 Write property test for rep range parsing round-trip
    - **Property 14: Rep range parsing round-trip**
    - For any string "{lower}-{upper}" with positive integers where lower ≤ upper, parseRepRange produces { lower, upper } matching the originals
    - **Validates: Requirements 4.1, 8.3**
    - File: `tests/property/progression-engine.prop.ts`

- [ ] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The progression engine is a pure function with no DB dependencies, making it ideal for thorough testing
- All weight calculations use `roundToHalf` to ensure 0.5 kg plate granularity
- The `fast-check` library is already installed in the project for property-based testing

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2"] },
    { "id": 5, "tasks": ["5.1", "5.2", "5.3", "6.1"] },
    { "id": 6, "tasks": ["8.1", "8.2", "8.3"] },
    { "id": 7, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7", "9.8", "9.9", "9.10", "9.11", "9.12", "9.13", "9.14"] }
  ]
}
```
