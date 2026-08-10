# Design Document

## Overview

This feature adds `planned_duration_minutes` to the `program_days` table and threads it through the tool handler layer (create, modify, retrieve) and tool definitions. The change is minimal and purely additive — no existing behavior is altered.

## Architecture

The change spans three layers:

1. **Database layer** — A new nullable column with a CHECK constraint, delivered via migration.
2. **Tool handler layer** — Modifications to `handleProgramCreate`, `handleProgramModify`, `get_active_program`, and `get_programs` in `tool-handlers.ts`.
3. **Tool definition layer** — Schema updates in `tool-definitions.ts` to expose the field to the LLM.

No new services, APIs, or dependencies are introduced.

## Components

### 1. Migration File

**File:** `supabase/migrations/20250101000012_add_planned_duration_minutes.sql`

Adds the column and constraint in a single `ALTER TABLE` statement.

```sql
ALTER TABLE program_days
  ADD COLUMN planned_duration_minutes integer
  CONSTRAINT chk_planned_duration_minutes
    CHECK (planned_duration_minutes IS NULL OR (planned_duration_minutes >= 1 AND planned_duration_minutes <= 480));
```

### 2. Tool Handler: `handleProgramCreate`

**File:** `supabase/functions/_shared/tool-handlers.ts`

In the day insertion loop, include `planned_duration_minutes` from the input:

```typescript
const { data: programDay, error: dayErr } = await supabase
  .from('program_days')
  .insert({
    program_id: programId,
    day_number: day.day_number,
    name: day.name,
    planned_duration_minutes: day.planned_duration_minutes ?? null,
  })
  .select('id')
  .single();
```

The `ProgramDayInput` interface gains:

```typescript
interface ProgramDayInput {
  name: string;
  day_number: number;
  planned_duration_minutes?: number | null;
  items: ProgramDayItemInput[];
}
```

### 3. Tool Handler: `handleProgramModify` — `modify_day` action

No code changes needed in the `modify_day` case. The current implementation already passes `change.updates` directly to `.update(change.updates)`, so any key present in `updates` (including `planned_duration_minutes`) is applied as-is. The database CHECK constraint handles validation.

### 4. Tool Handler: `get_active_program`

**File:** `supabase/functions/_shared/tool-handlers.ts`

Update the program_days select query to include the new column:

```typescript
const { data: days, error: daysErr } = await supabase
  .from('program_days')
  .select('id, day_number, name, planned_duration_minutes')
  .eq('program_id', program.id)
  .order('day_number');
```

Include it in the response object:

```typescript
daysWithItems.push({
  id: day.id,
  day_number: day.day_number,
  name: day.name,
  planned_duration_minutes: day.planned_duration_minutes ?? null,
  items: resolvedItems,
});
```

### 5. Tool Handler: `get_programs`

**File:** `supabase/functions/_shared/tool-handlers.ts`

The current `get_programs` handler returns only summary counts per program. To satisfy Requirement 4.2, extend the response to include day-level detail with `planned_duration_minutes`. Update the per-program loop:

```typescript
const { data: programDays } = await supabase
  .from('program_days')
  .select('id, day_number, name, planned_duration_minutes')
  .eq('program_id', program.id)
  .order('day_number');

result.push({
  id: program.id,
  name: program.name,
  status: program.status,
  created_at: program.created_at,
  updated_at: program.updated_at,
  days_count: programDays?.length ?? 0,
  sessions_count: sessionsCount,
  days: (programDays || []).map((d) => ({
    day_number: d.day_number,
    name: d.name,
    planned_duration_minutes: d.planned_duration_minutes ?? null,
  })),
});
```

### 6. Tool Handler: `fetchProgramStructure` helper

Update the select query used for before/after state snapshots:

```typescript
const { data: days, error: daysErr } = await supabase
  .from('program_days')
  .select('id, day_number, name, planned_duration_minutes')
  .eq('program_id', programId)
  .order('day_number');
```

### 7. Tool Definitions

**File:** `supabase/functions/_shared/tool-definitions.ts`

#### program_create — day object schema

```typescript
{
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Day name (e.g. "Push Day")' },
    day_number: { type: 'integer', description: 'Order index (1-based)' },
    planned_duration_minutes: {
      type: 'integer',
      description: 'Planned session duration in minutes (1-480). Omit if unknown.',
    },
    items: { /* ... existing ... */ },
  },
  required: ['name', 'day_number', 'items'],
}
```

#### program_modify — description update

Update the `program_modify` tool description to note `planned_duration_minutes` support:

```typescript
description:
  'Modify the user\'s active program. Specify the changes to apply. ' +
  'The modify_day action accepts updates including name and planned_duration_minutes (1-480 or null).',
```

#### get_active_program — description update

```typescript
description:
  'Retrieve the user\'s currently active training program with full structure ' +
  '(days with planned_duration_minutes, exercises, blocks, targets). Returns null if no active program exists.',
```

#### get_programs — description update

```typescript
description:
  'List all of the user\'s programs (active, draft, archived) with summary info ' +
  'and day details including planned_duration_minutes.',
```

## Data Model

### program_days table (after migration)

| Column | Type | Nullable | Constraint |
|--------|------|----------|------------|
| id | uuid | NO | PK, default gen_random_uuid() |
| program_id | uuid | NO | FK → programs |
| day_number | integer | NO | — |
| name | text | NO | — |
| planned_duration_minutes | integer | YES | CHECK: NULL OR 1–480 |

## Error Handling

- **Constraint violation on insert/update**: Supabase/Postgres returns a `23514` error code (check_violation). The existing tool handler error paths (`throw new Error(...)`) propagate this to the caller naturally — no additional error handling is required.
- **Invalid type (non-integer)**: The tool definition schema declares the field as `integer`. If the LLM passes a non-integer, Supabase's PostgREST layer rejects it with a type mismatch error before reaching the constraint.
- **NULL handling**: Omitted fields default to `null` via the `?? null` pattern in `handleProgramCreate`. The modify path passes through whatever is in `updates`, including explicit `null`.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: CHECK constraint range enforcement

*For any* integer value `v`, inserting or updating `planned_duration_minutes` to `v` on a `program_days` row SHALL succeed if and only if `v` is NULL or `v` is in the range [1, 480] inclusive. All other values SHALL be rejected with a constraint violation.

**Validates: Requirements 1.2, 1.3**

### Property 2: Create persistence round-trip

*For any* valid `planned_duration_minutes` value (an integer in [1, 480] or NULL), creating a program day with that value via `program_create` and then retrieving the program via `get_active_program` SHALL return the same value in the corresponding day object.

**Validates: Requirements 2.1, 2.2, 2.3, 4.1**

### Property 3: Modify persistence round-trip

*For any* valid `planned_duration_minutes` value (an integer in [1, 480] or NULL), updating an existing program day via `program_modify` with a `modify_day` action containing that value and then retrieving the program SHALL return the updated value in the corresponding day object.

**Validates: Requirements 3.1, 3.2, 3.3, 4.1**
