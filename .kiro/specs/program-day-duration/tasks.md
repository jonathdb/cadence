# Implementation Plan: Program Day Duration

## Overview

Add an optional `planned_duration_minutes` column to the `program_days` table and thread it through the tool handler and tool definition layers. The implementation follows a migration-first approach, then updates handlers to persist/retrieve the field, and finally exposes it in tool definitions.

## Tasks

- [x] 1. Database migration
  - [x] 1.1 Create migration file `supabase/migrations/20250101000012_add_planned_duration_minutes.sql`
    - Add nullable integer column `planned_duration_minutes` to the `program_days` table
    - Add CHECK constraint `chk_planned_duration_minutes` allowing NULL or values between 1 and 480 inclusive
    - Use a single `ALTER TABLE` statement
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Tool handler updates
  - [x] 2.1 Update `handleProgramCreate` in `supabase/functions/_shared/tool-handlers.ts`
    - Add `planned_duration_minutes?: number | null` to the `ProgramDayInput` interface
    - Include `planned_duration_minutes: day.planned_duration_minutes ?? null` in the program_days insert call
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 2.2 Update `get_active_program` handler in `supabase/functions/_shared/tool-handlers.ts`
    - Add `planned_duration_minutes` to the `.select()` query for program_days
    - Include `planned_duration_minutes: day.planned_duration_minutes ?? null` in the response day objects
    - _Requirements: 4.1, 4.3_

  - [x] 2.3 Update `get_programs` handler in `supabase/functions/_shared/tool-handlers.ts`
    - Fetch program_days with `id, day_number, name, planned_duration_minutes` per program
    - Add a `days` array to each program result containing `day_number`, `name`, and `planned_duration_minutes`
    - _Requirements: 4.2, 4.3_

  - [x] 2.4 Update `fetchProgramStructure` helper in `supabase/functions/_shared/tool-handlers.ts`
    - Add `planned_duration_minutes` to the `.select()` query for program_days
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Checkpoint - Verify handler changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Tool definition updates
  - [x] 4.1 Update `program_create` tool definition in `supabase/functions/_shared/tool-definitions.ts`
    - Add `planned_duration_minutes` as an optional integer property to the day object schema
    - Include description: `'Planned session duration in minutes (1-480). Omit if unknown.'`
    - Do NOT add it to the `required` array
    - _Requirements: 5.1_

  - [x] 4.2 Update `program_modify` tool definition in `supabase/functions/_shared/tool-definitions.ts`
    - Update the description to mention `planned_duration_minutes` support in `modify_day` updates
    - _Requirements: 5.2_

  - [x] 4.3 Update `get_active_program` tool definition in `supabase/functions/_shared/tool-definitions.ts`
    - Update the description to mention `planned_duration_minutes` in the response
    - _Requirements: 5.3_

  - [x] 4.4 Update `get_programs` tool definition in `supabase/functions/_shared/tool-definitions.ts`
    - Update the description to mention day details including `planned_duration_minutes` in the response
    - _Requirements: 5.4_

- [x] 5. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- The `modify_day` handler already passes `change.updates` directly to `.update()`, so `planned_duration_minutes` flows through without code changes (the database CHECK constraint handles validation)
- Tasks reference specific sub-requirements for traceability
- The migration must be sequenced after `20250101000011`
- All code is TypeScript targeting Supabase Edge Functions (Deno runtime)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["4.1", "4.2", "4.3", "4.4"] }
  ]
}
```
