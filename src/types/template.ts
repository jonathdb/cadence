/**
 * Template types for shareable program templates.
 * Validates: Requirements 6.1, 6.3
 */

// ─── Snapshot Types (frozen at publish time) ─────────────────────────────────

export interface ProgramDayItemSnapshot {
  type: 'exercise' | 'block';
  order: number;
  exercise_id?: string;
  exercise_name?: string; // denormalized for display
  target_sets: number;
  target_reps: string;
  target_weight?: number;
  target_rpe?: number;
  timer_config?: Record<string, unknown>;
  notes?: string;
}

export interface ProgramDaySnapshot {
  day_number: number;
  name: string;
  items: ProgramDayItemSnapshot[];
}

export interface ProgramSnapshot {
  name: string;
  program_days: ProgramDaySnapshot[];
}

// ─── Template Record Types ───────────────────────────────────────────────────

export interface ProgramTemplate {
  id: string;
  slug: string;
  author_id: string;
  title: string;
  description: string;
  tags: string[];
  program_snapshot: ProgramSnapshot;
  clone_count: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface TemplateCard {
  id: string;
  slug: string;
  title: string;
  description: string;
  author_display_name: string;
  tags: string[];
  clone_count: number;
  created_at: string;
}

// ─── Browse/Pagination Types ─────────────────────────────────────────────────

export interface BrowseOptions {
  /** created_at value of last item (for cursor-based pagination) */
  cursor?: string;
  /** id for tie-breaking in cursor pagination */
  cursorId?: string;
  /** Max templates per page (default 20) */
  limit?: number;
  /** Case-insensitive tag filter */
  tagFilter?: string;
}

export interface BrowseResult {
  templates: TemplateCard[];
  nextCursor: string | null;
  nextCursorId: string | null;
}

// ─── Error Type ──────────────────────────────────────────────────────────────

export type TemplateErrorCode = 'NOT_FOUND' | 'UNAUTHORIZED' | 'VALIDATION_ERROR' | 'DB_ERROR';

export class TemplateServiceError extends Error {
  constructor(
    message: string,
    public code: TemplateErrorCode
  ) {
    super(message);
    this.name = 'TemplateServiceError';
  }
}
