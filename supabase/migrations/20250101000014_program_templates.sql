-- Migration: Program Templates (Shareable)
-- Adds tables for publishing and cloning program templates.
-- Validates: Requirements 6.1, 6.2, 7.1, 7.2, 7.3, 7.4

-- ============================================================================
-- TABLE: program_templates
-- Stores published program templates with frozen JSONB snapshots.
-- ============================================================================
CREATE TABLE program_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  author_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  program_snapshot jsonb NOT NULL,
  clone_count integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_program_templates_author_id ON program_templates(author_id);
CREATE INDEX idx_program_templates_published ON program_templates(created_at DESC)
  WHERE is_published = true;
CREATE INDEX idx_program_templates_slug ON program_templates(slug)
  WHERE is_published = true;
CREATE INDEX idx_program_templates_tags ON program_templates USING gin(tags);

-- ============================================================================
-- TABLE: template_clones
-- Tracks who cloned which template (for analytics + clone count).
-- ============================================================================
CREATE TABLE template_clones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES program_templates ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  cloned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_template_clones_template_id ON template_clones(template_id);
CREATE INDEX idx_template_clones_user_id ON template_clones(user_id);

-- ============================================================================
-- RLS Policies
-- ============================================================================
ALTER TABLE program_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_clones ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous/unauthenticated) can read published templates
CREATE POLICY "Public read published templates"
  ON program_templates FOR SELECT
  USING (is_published = true);

-- Author can do everything on their own templates
CREATE POLICY "Author manages own templates"
  ON program_templates FOR ALL
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- Authenticated users can insert their own clone records
CREATE POLICY "Authenticated insert own clones"
  ON template_clones FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Anyone can read clone records (for aggregate counts)
CREATE POLICY "Public read clones"
  ON template_clones FOR SELECT
  USING (true);
