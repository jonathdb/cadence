# Requirements Document

## Introduction

Shareable Program Templates allows users to publish their training programs as public templates that anyone can preview via a unique link. Authenticated users can clone templates into their own program library. This feature adds community-driven content sharing to Cadence without introducing social features like feeds, profiles, or comments.

## Glossary

- **Template_System**: The subsystem responsible for publishing, storing, browsing, previewing, and cloning program templates.
- **Program_Template**: A frozen JSONB snapshot of a program (including program_days and program_day_items) stored in the program_templates table.
- **Template_Slug**: A URL-safe, unique identifier derived from the template title, used in shareable links (max 64 characters).
- **Template_Author**: The authenticated user who published the program as a template.
- **Template_Clone**: A new program created in a user's library by copying the JSONB snapshot from a Program_Template.
- **Browse_Screen**: The screen within the Program tab that displays recently published templates in a paginated list.
- **Preview_Screen**: A read-only screen displaying the full structure of a Program_Template with a clone action.
- **Deep_Link**: A URL in the format cadence.app/t/{slug} that navigates directly to a template's Preview_Screen.

## Requirements

### Requirement 1: Publish Program as Template

**User Story:** As a program author, I want to publish my program as a shareable template, so that other users can discover and clone my training plan.

#### Acceptance Criteria

1. WHEN the Template_Author taps "Publish as Template" on a program they own, THE Template_System SHALL create a Program_Template containing a frozen JSONB snapshot of the program, its program_days, and its program_day_items.
2. WHEN a Program_Template is created, THE Template_System SHALL generate a unique Template_Slug derived from the template title with a maximum length of 64 characters.
3. IF the generated Template_Slug already exists in the database, THEN THE Template_System SHALL append a random suffix to produce a unique Template_Slug.
4. WHEN a Program_Template is created, THE Template_System SHALL store the Template_Author's user ID as the author_id on the Program_Template record.
5. THE Template_System SHALL display the "Publish as Template" button only on program detail screens where the authenticated user is the program owner.

### Requirement 2: Unpublish Template

**User Story:** As a template author, I want to unpublish my template, so that it is no longer publicly visible or clonable.

#### Acceptance Criteria

1. WHEN the Template_Author taps "Unpublish" on a Program_Template they authored, THE Template_System SHALL set the is_published flag to false on the Program_Template record.
2. WHILE a Program_Template has is_published set to false, THE Template_System SHALL exclude the Program_Template from the Browse_Screen results and return a not-found response for its Deep_Link.

### Requirement 3: Template Preview via Deep Link

**User Story:** As any user (including unauthenticated), I want to view a template's structure via a shareable link, so that I can evaluate the program before cloning.

#### Acceptance Criteria

1. WHEN a user navigates to a Deep_Link (cadence.app/t/{slug}), THE Template_System SHALL display the Preview_Screen showing the template title, description, author display name, tags, clone count, and full program structure.
2. THE Template_System SHALL allow unauthenticated users to access the Preview_Screen without requiring login.
3. IF the Template_Slug in the Deep_Link does not match any published Program_Template, THEN THE Template_System SHALL display a "Template not found" message.

### Requirement 4: Clone Template

**User Story:** As an authenticated user, I want to clone a template into my program library, so that I can use the training plan as a starting point.

#### Acceptance Criteria

1. WHEN an authenticated user taps "Clone" on the Preview_Screen, THE Template_System SHALL create a new program with status "draft" in the user's library by inserting a program, program_days, and program_day_items from the Program_Template's JSONB snapshot.
2. WHEN a clone operation completes, THE Template_System SHALL insert a record into the template_clones table with the template_id, user_id, and current timestamp.
3. WHEN a clone operation completes, THE Template_System SHALL increment the clone_count on the Program_Template record.
4. IF an unauthenticated user taps "Clone" on the Preview_Screen, THEN THE Template_System SHALL redirect the user to the login screen before proceeding with the clone operation.

### Requirement 5: Browse Templates Screen

**User Story:** As a user, I want to browse recently published templates, so that I can discover new training programs to try.

#### Acceptance Criteria

1. WHEN the user navigates to the Browse_Screen from the Program tab, THE Template_System SHALL display a paginated list of published Program_Templates ordered by created_at descending, with 20 templates per page.
2. THE Template_System SHALL display each template card with the title, description, author display name, tag pills, and clone count.
3. WHEN the user enters a search term in the tag filter, THE Template_System SHALL filter the displayed templates to those with at least one tag matching the search term using case-insensitive text matching.

### Requirement 6: Template Data Model and Storage

**User Story:** As a developer, I want a well-defined data model for templates, so that the feature integrates cleanly with the existing Supabase schema.

#### Acceptance Criteria

1. THE Template_System SHALL store Program_Templates in a program_templates table with columns: id (uuid, PK), slug (text, unique), author_id (uuid, FK to auth.users), title (text), description (text), tags (text array), program_snapshot (jsonb), clone_count (integer, default 0), is_published (boolean, default true), created_at (timestamptz), updated_at (timestamptz).
2. THE Template_System SHALL store clone records in a template_clones table with columns: id (uuid, PK), template_id (uuid, FK to program_templates), user_id (uuid, FK to auth.users), cloned_at (timestamptz, default now).
3. THE Template_System SHALL enforce that the program_snapshot JSONB is immutable after creation — edits to the original program do not affect the stored snapshot.

### Requirement 7: Access Control via Row Level Security

**User Story:** As a developer, I want proper RLS policies on template tables, so that access is correctly scoped to public reads and authenticated writes.

#### Acceptance Criteria

1. THE Template_System SHALL allow any user (including anonymous) to read rows from the program_templates table where is_published equals true.
2. THE Template_System SHALL allow only the Template_Author (where auth.uid() equals author_id) to insert, update, or delete rows in the program_templates table.
3. THE Template_System SHALL allow only authenticated users to insert rows into the template_clones table where auth.uid() equals the user_id column value.
4. THE Template_System SHALL allow any user (including anonymous) to read rows from the template_clones table for aggregate clone count purposes.
