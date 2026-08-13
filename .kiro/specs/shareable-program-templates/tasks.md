# Implementation Plan: Shareable Program Templates

## Overview

Implement the shareable program templates feature spanning a Supabase migration (two tables + RLS + clone RPC), a slug-generation utility, a template service layer, and three new Expo Router screens (browse, preview, deep link). The implementation follows an incremental approach: database first, then utility/service layer, then UI screens, then wiring.

## Tasks

- [ ] 1. Database migration — tables, indexes, RLS, and clone RPC
  - [ ] 1.1 Create Supabase migration for program_templates and template_clones tables
    - Create migration file `supabase/migrations/20250101000013_program_templates.sql`
    - Define `program_templates` table with columns: id (uuid PK), slug (text unique), author_id (uuid FK auth.users), title (text), description (text default ''), tags (text[] default '{}'), program_snapshot (jsonb), clone_count (integer default 0), is_published (boolean default true), created_at (timestamptz), updated_at (timestamptz)
    - Define `template_clones` table with columns: id (uuid PK), template_id (uuid FK program_templates), user_id (uuid FK auth.users), cloned_at (timestamptz default now())
    - Add indexes: author_id, partial index on created_at DESC WHERE is_published = true, partial index on slug WHERE is_published = true, GIN index on tags
    - Add indexes on template_clones: template_id, user_id
    - _Requirements: 6.1, 6.2_

  - [ ] 1.2 Add RLS policies to program_templates and template_clones
    - Enable RLS on both tables
    - Create "Public read published templates" SELECT policy on program_templates using `is_published = true`
    - Create "Author manages own templates" ALL policy on program_templates using `auth.uid() = author_id`
    - Create "Authenticated insert own clones" INSERT policy on template_clones with check `auth.uid() = user_id`
    - Create "Public read clones" SELECT policy on template_clones using `true`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ] 1.3 Create clone_template RPC function
    - Create migration file `supabase/migrations/20250101000014_clone_template_rpc.sql`
    - Implement `clone_template(p_user_id uuid, p_template_id uuid)` as SECURITY DEFINER plpgsql function
    - Function fetches program_snapshot from published template, inserts program (status 'draft'), iterates program_days and program_day_items, records clone in template_clones, increments clone_count
    - Raise exception if template not found or not published
    - _Requirements: 4.1, 4.2, 4.3_

- [ ] 2. Slug generator utility
  - [ ] 2.1 Implement slug-generator.ts
    - Create `src/utils/slug-generator.ts`
    - Implement `slugify(title)`: lowercase, strip diacritics, remove non-alphanumeric, replace spaces with hyphens, collapse hyphens, trim, truncate to 64 chars
    - Implement `generateRandomSuffix()`: 4-char alphanumeric string
    - Implement `appendSuffix(baseSlug, suffix)`: trim base to fit within 64 chars with separator and suffix
    - Implement `generateUniqueSlug(title, existsCheck)`: generate base slug, check collision, append suffix on collision with retry loop (max 10 attempts, timestamp fallback)
    - _Requirements: 1.2, 1.3_

  - [ ]* 2.2 Write property test for slug generation invariants
    - **Property 2: Slug generation invariants**
    - Test that for any title string, generated slugs are URL-safe (only lowercase a-z, 0-9, hyphens), ≤64 characters, and unique when collision handling is engaged
    - Use fast-check to generate arbitrary title strings
    - **Validates: Requirements 1.2, 1.3**

- [ ] 3. Template service layer
  - [ ] 3.1 Define template types and interfaces
    - Create `src/types/template.ts`
    - Define `ProgramSnapshot`, `ProgramDaySnapshot`, `ProgramDayItemSnapshot` interfaces
    - Define `ProgramTemplate`, `TemplateCard`, `BrowseOptions`, `BrowseResult` interfaces
    - Define `TemplateServiceError` class with error codes (NOT_FOUND, UNAUTHORIZED, VALIDATION_ERROR, DB_ERROR)
    - _Requirements: 6.1, 6.3_

  - [ ] 3.2 Implement publishTemplate function
    - Create `src/services/template-service.ts`
    - Implement `publishTemplate(client, userId, programId, options)`: validate title is not empty, fetch program with program_days and program_day_items, verify ownership, build JSONB snapshot, generate unique slug via slug-generator, insert into program_templates, return created template
    - Throw TemplateServiceError on not found, unauthorized, or validation failures
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 3.3 Write property test for publish snapshot faithfulness
    - **Property 1: Publish snapshot faithfulness**
    - Test that for any valid program structure, the published snapshot contains the same name, day count, day names, day_numbers, and item fields
    - Use fast-check to generate arbitrary program structures
    - **Validates: Requirements 1.1, 1.4**

  - [ ] 3.4 Implement unpublishTemplate function
    - Add `unpublishTemplate(client, userId, templateId)` to template-service.ts
    - Verify the user is the author, then update `is_published = false` and `updated_at = now()`
    - Throw UNAUTHORIZED if user is not the author, NOT_FOUND if template doesn't exist
    - _Requirements: 2.1_

  - [ ] 3.5 Implement getTemplateBySlug function
    - Add `getTemplateBySlug(client, slug)` to template-service.ts
    - Query program_templates where slug matches AND is_published = true
    - Return null if not found
    - _Requirements: 3.1, 3.3_

  - [ ] 3.6 Implement cloneTemplate function
    - Add `cloneTemplate(client, userId, templateId)` to template-service.ts
    - Call the `clone_template` RPC with userId and templateId
    - Return the new program ID
    - Handle RPC errors and wrap in TemplateServiceError
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 3.7 Write property test for clone round-trip fidelity
    - **Property 4: Clone round-trip fidelity**
    - Test that cloning produces a program whose structure matches the snapshot content exactly
    - **Validates: Requirements 4.1**

  - [ ] 3.8 Implement browseTemplates function
    - Add `browseTemplates(client, options)` to template-service.ts
    - Query published templates ordered by created_at DESC with cursor-based pagination (keyed on created_at + id for tie-breaking)
    - Default limit: 20
    - Support optional case-insensitive tag filter using array containment or ilike on tags
    - Join author display_name for TemplateCard rendering
    - Return BrowseResult with nextCursor and nextCursorId
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 3.9 Write property test for browse ordering and tag filtering
    - **Property 6: Browse ordering and pagination**
    - Test that results are always sorted by created_at descending, contain at most `limit` items, and pagination produces no duplicates
    - **Property 7: Tag filter correctness**
    - Test that filtering by tag returns only templates with a matching tag (case-insensitive) and never excludes valid matches
    - **Validates: Requirements 5.1, 5.3**

- [ ] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. UI screens — Browse, Preview, and Deep Link
  - [ ] 5.1 Update program tab layout with new stack screens
    - Modify `src/app/(tabs)/program/_layout.tsx`
    - Add Stack.Screen entries for `templates` (title: 'Browse Templates') and `template-preview` (title: 'Template Preview')
    - _Requirements: 5.1_

  - [ ] 5.2 Implement Browse Templates screen
    - Create `src/app/(tabs)/program/templates.tsx`
    - Render a FlatList of TemplateCard items with title, description, author display name, tag pills, and clone count
    - Implement infinite scroll using onEndReached calling browseTemplates with cursor pagination
    - Add a tag filter text input that filters templates via case-insensitive tag matching
    - Show loading and empty states
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ] 5.3 Implement Template Preview screen
    - Create `src/app/(tabs)/program/template-preview.tsx`
    - Accept template slug or id as route parameter
    - Fetch template via getTemplateBySlug
    - Display template title, description, author display name, tags, clone count, and full program structure (days and items)
    - Render "Clone" button: if authenticated, call cloneTemplate and navigate to new program; if unauthenticated, redirect to auth flow
    - Display "Template not found" message when slug doesn't match
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.4_

  - [ ] 5.4 Implement deep link route for /t/[slug]
    - Create `src/app/t/_layout.tsx` with a Stack layout (headerShown: false)
    - Create `src/app/t/[slug].tsx` that extracts slug param, fetches template by slug, and renders the Preview Screen content
    - Configure Expo Router linking for cadence.app/t/:slug
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ] 5.5 Add "Publish as Template" button to program detail screen
    - Identify the program detail screen (likely in `src/app/(tabs)/program/` or edit flow)
    - Add "Publish as Template" button visible only when the authenticated user is the program owner
    - On tap, show a form/modal for title, description, and tags, then call publishTemplate
    - Display the resulting Deep_Link to the user after successful publish
    - _Requirements: 1.1, 1.5_

  - [ ] 5.6 Add "Unpublish" action for template authors
    - On the Preview Screen or a template management view, show "Unpublish" button only if the current user is the template author
    - On tap, call unpublishTemplate and navigate back or update UI state
    - _Requirements: 2.1, 2.2_

  - [ ] 5.7 Add navigation entry to Browse Templates from Program tab
    - Add a button or tab entry in the program index or library screen that navigates to the Browse Templates screen
    - _Requirements: 5.1_

- [ ] 6. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The clone operation uses a SECURITY DEFINER RPC for atomicity — the service layer simply calls it
- The design uses TypeScript throughout — all code examples should use TypeScript
- Cursor-based pagination avoids offset drift when new templates are published between page fetches
- Supabase migration numbering follows the existing convention (sequential after 20250101000012)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2"] },
    { "id": 2, "tasks": ["3.2", "3.4", "3.5"] },
    { "id": 3, "tasks": ["3.3", "3.6", "3.8"] },
    { "id": 4, "tasks": ["3.7", "3.9"] },
    { "id": 5, "tasks": ["5.1", "5.4"] },
    { "id": 6, "tasks": ["5.2", "5.3", "5.5"] },
    { "id": 7, "tasks": ["5.6", "5.7"] }
  ]
}
```
