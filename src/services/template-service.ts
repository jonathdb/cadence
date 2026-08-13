/**
 * Template Service
 *
 * Handles publishing, unpublishing, browsing, previewing, and cloning
 * shareable program templates.
 *
 * Validates: Requirements 1.1-1.5, 2.1-2.2, 3.1-3.3, 4.1-4.4, 5.1-5.3
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
    BrowseOptions,
    BrowseResult,
    ProgramDayItemSnapshot,
    ProgramDaySnapshot,
    ProgramSnapshot,
    ProgramTemplate,
    TemplateCard,
} from '@/types/template';
import { TemplateServiceError } from '@/types/template';
import { generateUniqueSlug } from '@/utils/slug-generator';

// ─── Publish ─────────────────────────────────────────────────────────────────

export interface PublishOptions {
  title: string;
  description?: string;
  tags?: string[];
}

/**
 * Publish a program as a shareable template.
 *
 * Creates a frozen JSONB snapshot of the program structure and stores it
 * with a unique slug for public access.
 *
 * @throws TemplateServiceError on validation, ownership, or DB errors
 */
export async function publishTemplate(
  client: SupabaseClient,
  userId: string,
  programId: string,
  options: PublishOptions
): Promise<ProgramTemplate> {
  // Validate title
  if (!options.title || options.title.trim().length === 0) {
    throw new TemplateServiceError('Title is required', 'VALIDATION_ERROR');
  }

  // Fetch program and verify ownership
  const { data: program, error: progErr } = await client
    .from('programs')
    .select('id, user_id, name, status')
    .eq('id', programId)
    .single();

  if (progErr || !program) {
    throw new TemplateServiceError('Program not found', 'NOT_FOUND');
  }

  if (program.user_id !== userId) {
    throw new TemplateServiceError('Only the program owner can publish', 'UNAUTHORIZED');
  }

  // Fetch program days
  const { data: days } = await client
    .from('program_days')
    .select('id, day_number, name')
    .eq('program_id', programId)
    .order('day_number', { ascending: true });

  // Build snapshot
  const programDays: ProgramDaySnapshot[] = [];

  if (days && days.length > 0) {
    const dayIds = days.map(d => d.id);
    const { data: items } = await client
      .from('program_day_items')
      .select('program_day_id, type, order_index, exercise_id, target_sets, target_reps, target_weight, target_rpe, timer_config, notes')
      .in('program_day_id', dayIds)
      .order('order_index', { ascending: true });

    // Resolve exercise names for display
    const exerciseIds = (items ?? [])
      .filter(i => i.exercise_id)
      .map(i => i.exercise_id);

    let exerciseNameMap = new Map<string, string>();
    if (exerciseIds.length > 0) {
      const { data: exercises } = await client
        .from('exercises')
        .select('id, name')
        .in('id', exerciseIds);
      if (exercises) {
        exerciseNameMap = new Map(exercises.map(e => [e.id, e.name]));
      }
    }

    for (const day of days) {
      const dayItems: ProgramDayItemSnapshot[] = (items ?? [])
        .filter(i => i.program_day_id === day.id)
        .map(i => ({
          type: i.type as 'exercise' | 'block',
          order: i.order_index,
          exercise_id: i.exercise_id ?? undefined,
          exercise_name: i.exercise_id ? exerciseNameMap.get(i.exercise_id) : undefined,
          target_sets: i.target_sets,
          target_reps: i.target_reps,
          target_weight: i.target_weight ?? undefined,
          target_rpe: i.target_rpe ?? undefined,
          timer_config: i.timer_config ?? undefined,
          notes: i.notes ?? undefined,
        }));

      programDays.push({
        day_number: day.day_number,
        name: day.name,
        items: dayItems,
      });
    }
  }

  const snapshot: ProgramSnapshot = {
    name: program.name,
    program_days: programDays,
  };

  // Generate unique slug
  const slug = await generateUniqueSlug(options.title, async (candidateSlug) => {
    const { data } = await client
      .from('program_templates')
      .select('id')
      .eq('slug', candidateSlug)
      .maybeSingle();
    return data !== null;
  });

  // Insert template
  const { data: template, error: insertErr } = await client
    .from('program_templates')
    .insert({
      slug,
      author_id: userId,
      title: options.title.trim(),
      description: options.description?.trim() ?? '',
      tags: options.tags ?? [],
      program_snapshot: snapshot,
    })
    .select('*')
    .single();

  if (insertErr || !template) {
    throw new TemplateServiceError(
      `Failed to create template: ${insertErr?.message ?? 'Unknown error'}`,
      'DB_ERROR'
    );
  }

  return template as ProgramTemplate;
}

// ─── Unpublish ───────────────────────────────────────────────────────────────

/**
 * Unpublish a template (soft-delete). The template becomes invisible
 * in browse and deep links, but the record is retained.
 */
export async function unpublishTemplate(
  client: SupabaseClient,
  userId: string,
  templateId: string
): Promise<void> {
  // Verify ownership
  const { data: template, error: fetchErr } = await client
    .from('program_templates')
    .select('id, author_id')
    .eq('id', templateId)
    .single();

  if (fetchErr || !template) {
    throw new TemplateServiceError('Template not found', 'NOT_FOUND');
  }

  if (template.author_id !== userId) {
    throw new TemplateServiceError('Only the author can unpublish', 'UNAUTHORIZED');
  }

  const { error: updateErr } = await client
    .from('program_templates')
    .update({ is_published: false, updated_at: new Date().toISOString() })
    .eq('id', templateId);

  if (updateErr) {
    throw new TemplateServiceError(`Failed to unpublish: ${updateErr.message}`, 'DB_ERROR');
  }
}

// ─── Get by Slug ─────────────────────────────────────────────────────────────

/**
 * Fetch a published template by its slug.
 * Returns null if not found or not published.
 */
export async function getTemplateBySlug(
  client: SupabaseClient,
  slug: string
): Promise<ProgramTemplate | null> {
  const { data, error } = await client
    .from('program_templates')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();

  if (error) {
    console.error('getTemplateBySlug error:', error.message);
    return null;
  }

  return data as ProgramTemplate | null;
}

// ─── Clone ───────────────────────────────────────────────────────────────────

/**
 * Clone a template into the user's program library as a draft.
 * Uses the clone_template RPC for atomic execution.
 *
 * @returns The new program's ID
 */
export async function cloneTemplate(
  client: SupabaseClient,
  userId: string,
  templateId: string
): Promise<string> {
  const { data, error } = await client.rpc('clone_template', {
    p_user_id: userId,
    p_template_id: templateId,
  });

  if (error) {
    throw new TemplateServiceError(
      `Failed to clone template: ${error.message}`,
      'DB_ERROR'
    );
  }

  return data as string;
}

// ─── Browse ──────────────────────────────────────────────────────────────────

/**
 * Browse published templates with cursor-based pagination and optional tag filter.
 */
export async function browseTemplates(
  client: SupabaseClient,
  options: BrowseOptions = {}
): Promise<BrowseResult> {
  const { cursor, cursorId, limit = 20, tagFilter } = options;

  let query = client
    .from('program_templates')
    .select('id, slug, title, description, author_id, tags, clone_count, created_at')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1); // Fetch one extra to determine if there's a next page

  // Apply cursor-based pagination
  if (cursor && cursorId) {
    query = query.or(`created_at.lt.${cursor},and(created_at.eq.${cursor},id.lt.${cursorId})`);
  }

  // Apply tag filter (case-insensitive array containment)
  if (tagFilter && tagFilter.trim()) {
    query = query.contains('tags', [tagFilter.trim().toLowerCase()]);
  }

  const { data, error } = await query;

  if (error) {
    throw new TemplateServiceError(`Browse failed: ${error.message}`, 'DB_ERROR');
  }

  const rows = data ?? [];
  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;

  // Map to TemplateCard (author_display_name placeholder — would join in production)
  const templates: TemplateCard[] = pageRows.map(row => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    author_display_name: 'Cadence User', // Simplified — would join auth.users or a profiles table
    tags: row.tags,
    clone_count: row.clone_count,
    created_at: row.created_at,
  }));

  const lastItem = pageRows[pageRows.length - 1];

  return {
    templates,
    nextCursor: hasNextPage ? lastItem?.created_at ?? null : null,
    nextCursorId: hasNextPage ? lastItem?.id ?? null : null,
  };
}
