/**
 * Tool handler registry for Cadence Agent tool calls.
 * Each handler receives the Supabase client, user_id, and tool arguments,
 * and returns the result of executing the tool.
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 4.2, 5.3, 6.1, 6.2, 15.2, 22.3, 26.1, 26.2, 26.3
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSpotifyAccessToken, spotifyApiRequest } from './spotify-client.ts';

// --- BPM Range for pace-based playlist suggestions ---
interface BpmRange {
  min: number;
  max: number;
  label: string;
}

/**
 * Determines the ideal BPM range for music based on activity type and pace.
 * BPM correlation for running cadence:
 *   - Fast running (< 300 s/km = sub-5:00): 175-185 BPM
 *   - Moderate running (300-360 s/km = 5:00-6:00): 170-180 BPM
 *   - Easy running (360-420 s/km = 6:00-7:00): 150-165 BPM
 *   - Slow running/jogging (> 420 s/km = 7:00+): 140-155 BPM
 *   - Walking: 115-135 BPM
 *   - Cycling: 130-160 BPM (based on effort rather than cadence)
 */
function determineBpmRange(
  activityType: string,
  paceSecondsPerKm: number | null
): BpmRange {
  if (activityType === 'walking') {
    return { min: 115, max: 135, label: 'walking pace' };
  }

  if (activityType === 'cycling') {
    return { min: 130, max: 160, label: 'cycling tempo' };
  }

  // Running — use pace to determine BPM
  if (!paceSecondsPerKm) {
    // Default moderate running BPM when no pace data available
    return { min: 160, max: 175, label: 'moderate running' };
  }

  if (paceSecondsPerKm < 300) {
    return { min: 175, max: 185, label: 'fast running' };
  } else if (paceSecondsPerKm <= 360) {
    return { min: 170, max: 180, label: 'moderate running' };
  } else if (paceSecondsPerKm <= 420) {
    return { min: 150, max: 165, label: 'easy running' };
  } else {
    return { min: 140, max: 155, label: 'slow jogging' };
  }
}

/**
 * Builds a Spotify search query string optimized for finding playlists that
 * match the user's activity intensity and BPM range.
 */
function buildPacePlaylistQuery(
  activityType: string,
  bpmRange: BpmRange,
  durationMinutes?: number | null
): string {
  const parts: string[] = [];

  // Activity-specific keywords
  switch (activityType) {
    case 'running':
      parts.push(`${bpmRange.label} ${bpmRange.min}-${bpmRange.max} bpm running`);
      break;
    case 'cycling':
      parts.push(`cycling workout ${bpmRange.min}-${bpmRange.max} bpm`);
      break;
    case 'walking':
      parts.push('walking workout upbeat');
      break;
  }

  // Add duration context for longer sessions
  if (durationMinutes && durationMinutes >= 60) {
    parts.push('long');
  }

  return parts.join(' ');
}

export type ToolHandler = (
  supabase: SupabaseClient,
  userId: string,
  args: Record<string, unknown>
) => Promise<unknown>;

// --- Program Day Item interface for type safety ---
interface ProgramDayItemInput {
  type: 'exercise' | 'block';
  exercise_name: string;
  target_sets: number;
  target_reps: string;
  target_weight?: number;
  target_rpe?: number;
  timer_config?: Record<string, unknown>;
  notes?: string;
}

interface ProgramDayInput {
  name: string;
  day_number: number;
  items: ProgramDayItemInput[];
}

interface ProgramModifyChange {
  action: string;
  day_number?: number;
  exercise_name?: string;
  updates?: Record<string, unknown>;
}

// --- Helper: Look up exercise by name (global or user's private) ---
async function resolveExerciseId(
  supabase: SupabaseClient,
  userId: string,
  exerciseName: string
): Promise<string> {
  const { data, error } = await supabase
    .from('exercises')
    .select('id')
    .or(`is_global.eq.true,user_id.eq.${userId}`)
    .ilike('name', exerciseName)
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`Exercise not found: "${exerciseName}"`);
  }
  return data.id;
}

// --- Helper: Fetch full program structure for before/after state ---
async function fetchProgramStructure(
  supabase: SupabaseClient,
  programId: string
): Promise<Record<string, unknown>> {
  const { data: program, error: progErr } = await supabase
    .from('programs')
    .select('id, name, status')
    .eq('id', programId)
    .single();

  if (progErr || !program) {
    throw new Error(`Program not found: ${programId}`);
  }

  const { data: days, error: daysErr } = await supabase
    .from('program_days')
    .select('id, day_number, name')
    .eq('program_id', programId)
    .order('day_number');

  if (daysErr) {
    throw new Error(`Failed to fetch program days: ${daysErr.message}`);
  }

  const daysWithItems = [];
  for (const day of days || []) {
    const { data: items } = await supabase
      .from('program_day_items')
      .select('id, type, "order", exercise_id, block_id, target_sets, target_reps, target_weight, target_rpe, timer_config, notes')
      .eq('program_day_id', day.id)
      .order('"order"');

    daysWithItems.push({ ...day, items: items || [] });
  }

  return { ...program, days: daysWithItems };
}

// --- program_create handler ---
async function handleProgramCreate(
  supabase: SupabaseClient,
  userId: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const name = args.name as string;
  const days = args.days as ProgramDayInput[];

  if (!name || !days || !Array.isArray(days)) {
    throw new Error('program_create requires "name" and "days" arguments');
  }

  // 1. Insert program with status 'draft'
  const { data: program, error: progErr } = await supabase
    .from('programs')
    .insert({ user_id: userId, name, status: 'draft' })
    .select('id')
    .single();

  if (progErr || !program) {
    throw new Error(`Failed to create program: ${progErr?.message}`);
  }

  const programId = program.id;

  // 2. For each day: insert program_day, then items
  for (const day of days) {
    const { data: programDay, error: dayErr } = await supabase
      .from('program_days')
      .insert({
        program_id: programId,
        day_number: day.day_number,
        name: day.name,
      })
      .select('id')
      .single();

    if (dayErr || !programDay) {
      throw new Error(`Failed to create program day "${day.name}": ${dayErr?.message}`);
    }

    const programDayId = programDay.id;

    // Insert items for this day
    for (let i = 0; i < day.items.length; i++) {
      const item = day.items[i];
      const order = i + 1;

      if (item.type === 'block') {
        // Create block first, then insert program_day_item referencing it
        const { data: block, error: blockErr } = await supabase
          .from('blocks')
          .insert({
            program_day_id: programDayId,
            name: item.exercise_name, // Block uses exercise_name field as its name
            type: 'custom', // Default block type
            timer_config: item.timer_config || null,
          })
          .select('id')
          .single();

        if (blockErr || !block) {
          throw new Error(`Failed to create block "${item.exercise_name}": ${blockErr?.message}`);
        }

        const { error: itemErr } = await supabase
          .from('program_day_items')
          .insert({
            program_day_id: programDayId,
            type: 'block',
            order,
            block_id: block.id,
            target_sets: item.target_sets,
            target_reps: item.target_reps,
            target_weight: item.target_weight || null,
            target_rpe: item.target_rpe || null,
            timer_config: item.timer_config || null,
            notes: item.notes || null,
          });

        if (itemErr) {
          throw new Error(`Failed to insert block item: ${itemErr.message}`);
        }
      } else {
        // type === 'exercise': look up exercise by name, insert item
        const exerciseId = await resolveExerciseId(supabase, userId, item.exercise_name);

        const { error: itemErr } = await supabase
          .from('program_day_items')
          .insert({
            program_day_id: programDayId,
            type: 'exercise',
            order,
            exercise_id: exerciseId,
            target_sets: item.target_sets,
            target_reps: item.target_reps,
            target_weight: item.target_weight || null,
            target_rpe: item.target_rpe || null,
            timer_config: item.timer_config || null,
            notes: item.notes || null,
          });

        if (itemErr) {
          throw new Error(`Failed to insert exercise item "${item.exercise_name}": ${itemErr.message}`);
        }
      }
    }
  }

  return {
    program_id: programId,
    name,
    status: 'draft',
    days_count: days.length,
  };
}

// --- program_modify handler ---
async function handleProgramModify(
  supabase: SupabaseClient,
  userId: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const programId = args.program_id as string;
  const changes = args.changes as ProgramModifyChange[];
  const reason = args.reason as string;

  if (!programId || !changes || !Array.isArray(changes) || !reason) {
    throw new Error('program_modify requires "program_id", "changes", and "reason" arguments');
  }

  // Verify program belongs to user
  const { data: program, error: progErr } = await supabase
    .from('programs')
    .select('id, user_id, status')
    .eq('id', programId)
    .eq('user_id', userId)
    .single();

  if (progErr || !program) {
    throw new Error('Program not found or not owned by user');
  }

  // Capture before_state
  const beforeState = await fetchProgramStructure(supabase, programId);

  // Apply changes based on action type
  for (const change of changes) {
    switch (change.action) {
      case 'add_day': {
        if (!change.updates) {
          throw new Error('add_day requires "updates" with day name');
        }
        const dayName = (change.updates.name as string) || `Day ${change.day_number || 1}`;
        const dayNumber = change.day_number || 1;

        const { error } = await supabase
          .from('program_days')
          .insert({
            program_id: programId,
            day_number: dayNumber,
            name: dayName,
          });

        if (error) {
          throw new Error(`Failed to add day: ${error.message}`);
        }
        break;
      }

      case 'remove_day': {
        if (!change.day_number) {
          throw new Error('remove_day requires "day_number"');
        }

        const { data: day } = await supabase
          .from('program_days')
          .select('id')
          .eq('program_id', programId)
          .eq('day_number', change.day_number)
          .single();

        if (day) {
          const { error } = await supabase
            .from('program_days')
            .delete()
            .eq('id', day.id);

          if (error) {
            throw new Error(`Failed to remove day: ${error.message}`);
          }
        }
        break;
      }

      case 'modify_day': {
        if (!change.day_number || !change.updates) {
          throw new Error('modify_day requires "day_number" and "updates"');
        }

        const { error } = await supabase
          .from('program_days')
          .update(change.updates)
          .eq('program_id', programId)
          .eq('day_number', change.day_number);

        if (error) {
          throw new Error(`Failed to modify day: ${error.message}`);
        }
        break;
      }

      case 'add_exercise': {
        if (!change.day_number || !change.exercise_name) {
          throw new Error('add_exercise requires "day_number" and "exercise_name"');
        }

        const { data: day } = await supabase
          .from('program_days')
          .select('id')
          .eq('program_id', programId)
          .eq('day_number', change.day_number)
          .single();

        if (!day) {
          throw new Error(`Day ${change.day_number} not found`);
        }

        const exerciseId = await resolveExerciseId(supabase, userId, change.exercise_name);

        // Get current max order for this day
        const { data: maxOrderResult } = await supabase
          .from('program_day_items')
          .select('"order"')
          .eq('program_day_id', day.id)
          .order('"order"', { ascending: false })
          .limit(1)
          .single();

        const nextOrder = (maxOrderResult?.order || 0) + 1;
        const updates = change.updates || {};

        const { error } = await supabase
          .from('program_day_items')
          .insert({
            program_day_id: day.id,
            type: 'exercise',
            order: nextOrder,
            exercise_id: exerciseId,
            target_sets: (updates.target_sets as number) || 3,
            target_reps: (updates.target_reps as string) || '8-12',
            target_weight: (updates.target_weight as number) || null,
            target_rpe: (updates.target_rpe as number) || null,
            timer_config: (updates.timer_config as Record<string, unknown>) || null,
            notes: (updates.notes as string) || null,
          });

        if (error) {
          throw new Error(`Failed to add exercise: ${error.message}`);
        }
        break;
      }

      case 'remove_exercise': {
        if (!change.day_number || !change.exercise_name) {
          throw new Error('remove_exercise requires "day_number" and "exercise_name"');
        }

        const { data: day } = await supabase
          .from('program_days')
          .select('id')
          .eq('program_id', programId)
          .eq('day_number', change.day_number)
          .single();

        if (!day) {
          throw new Error(`Day ${change.day_number} not found`);
        }

        const exerciseId = await resolveExerciseId(supabase, userId, change.exercise_name);

        const { error } = await supabase
          .from('program_day_items')
          .delete()
          .eq('program_day_id', day.id)
          .eq('exercise_id', exerciseId);

        if (error) {
          throw new Error(`Failed to remove exercise: ${error.message}`);
        }
        break;
      }

      case 'modify_exercise': {
        if (!change.day_number || !change.exercise_name || !change.updates) {
          throw new Error('modify_exercise requires "day_number", "exercise_name", and "updates"');
        }

        const { data: day } = await supabase
          .from('program_days')
          .select('id')
          .eq('program_id', programId)
          .eq('day_number', change.day_number)
          .single();

        if (!day) {
          throw new Error(`Day ${change.day_number} not found`);
        }

        const exerciseId = await resolveExerciseId(supabase, userId, change.exercise_name);

        const { error } = await supabase
          .from('program_day_items')
          .update(change.updates)
          .eq('program_day_id', day.id)
          .eq('exercise_id', exerciseId);

        if (error) {
          throw new Error(`Failed to modify exercise: ${error.message}`);
        }
        break;
      }

      default:
        throw new Error(`Unknown modification action: ${change.action}`);
    }
  }

  // Capture after_state
  const afterState = await fetchProgramStructure(supabase, programId);

  // Record modification_history (before/after state)
  const { error: histErr } = await supabase
    .from('modification_history')
    .insert({
      program_id: programId,
      user_id: userId,
      change_type: reason,
      before_state: beforeState,
      after_state: afterState,
      source: 'agent',
    });

  if (histErr) {
    console.error('Failed to record modification history:', histErr.message);
  }

  return {
    program_id: programId,
    modifications_applied: changes.length,
  };
}

// --- program_activate handler ---
async function handleProgramActivate(
  supabase: SupabaseClient,
  userId: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const programId = args.program_id as string;

  if (!programId) {
    throw new Error('program_activate requires "program_id" argument');
  }

  // Call the transactional activate_program RPC function
  const { error } = await supabase.rpc('activate_program', {
    p_user_id: userId,
    p_program_id: programId,
  });

  if (error) {
    throw new Error(`Failed to activate program: ${error.message}`);
  }

  return {
    program_id: programId,
    status: 'active',
  };
}

/**
 * Registry mapping tool names to their handler functions.
 */
const toolHandlerRegistry: Record<string, ToolHandler> = {
  // Program edits (Task 4.3)
  program_create: handleProgramCreate,
  program_modify: handleProgramModify,
  program_activate: handleProgramActivate,

  /**
   * journal_draft — Creates a journal entry with agent_drafted = true.
   * Subject to the journal_edits Permission_Category.
   * Validates: Requirement 22.3
   */
  journal_draft: async (supabase, userId, args) => {
    const sessionId = args.session_id as string | undefined;
    const content = args.content as string | undefined;

    if (!content) {
      throw new Error('journal_draft requires a "content" argument');
    }

    const insertPayload: Record<string, unknown> = {
      user_id: userId,
      content,
      agent_drafted: true,
    };

    if (sessionId) {
      insertPayload.session_id = sessionId;
    }

    const { data, error } = await supabase
      .from('journal_entries')
      .insert(insertPayload)
      .select('id, content')
      .single();

    if (error) {
      throw new Error(`Failed to create journal entry: ${error.message}`);
    }

    return {
      journal_entry_id: data.id,
      content_preview: data.content.substring(0, 100),
    };
  },

  // Spotify actions (Task 4.5) — Validates: Requirements 26.1, 26.2, 26.3

  /**
   * spotify_search_playlist — Search Spotify for playlists matching a query.
   * Subject to the spotify_actions Permission_Category.
   */
  spotify_search_playlist: async (supabase, userId, args) => {
    const query = args.query as string | undefined;
    const limit = (args.limit as number) ?? 5;

    if (!query) {
      throw new Error('spotify_search_playlist requires a "query" argument');
    }

    const accessToken = await getSpotifyAccessToken(supabase, userId);

    const encodedQuery = encodeURIComponent(query);
    const data = (await spotifyApiRequest(
      accessToken,
      'GET',
      `/search?type=playlist&q=${encodedQuery}&limit=${limit}`
    )) as { playlists?: { items?: Array<Record<string, unknown>> } };

    const items = data?.playlists?.items ?? [];

    const playlists = items.map((item: Record<string, unknown>) => ({
      id: item.id,
      name: item.name,
      description: (item.description as string) || '',
      tracks_total: (item.tracks as Record<string, unknown>)?.total ?? 0,
      external_url:
        (item.external_urls as Record<string, unknown>)?.spotify ?? null,
    }));

    return { playlists };
  },

  /**
   * spotify_create_playlist — Create a new Spotify playlist for the user.
   * Optionally adds initial tracks.
   * Subject to the spotify_actions Permission_Category.
   */
  spotify_create_playlist: async (supabase, userId, args) => {
    const name = args.name as string | undefined;
    const description = (args.description as string) || '';
    const trackUris = (args.track_uris as string[]) || [];

    if (!name) {
      throw new Error('spotify_create_playlist requires a "name" argument');
    }

    const accessToken = await getSpotifyAccessToken(supabase, userId);

    // Get the Spotify user ID
    const meData = (await spotifyApiRequest(
      accessToken,
      'GET',
      '/me'
    )) as { id: string };
    const spotifyUserId = meData.id;

    // Create the playlist (private by default)
    const createData = (await spotifyApiRequest(
      accessToken,
      'POST',
      `/users/${spotifyUserId}/playlists`,
      {
        name,
        description,
        public: false,
      }
    )) as {
      id: string;
      name: string;
      external_urls: { spotify: string };
    };

    const playlistId = createData.id;
    let tracksAdded = 0;

    // Add tracks if provided
    if (trackUris.length > 0) {
      await spotifyApiRequest(
        accessToken,
        'POST',
        `/playlists/${playlistId}/tracks`,
        { uris: trackUris }
      );
      tracksAdded = trackUris.length;
    }

    return {
      playlist_id: playlistId,
      name: createData.name,
      external_url: createData.external_urls?.spotify ?? null,
      tracks_added: tracksAdded,
    };
  },

  /**
   * spotify_modify_playlist — Add or remove tracks from an existing playlist.
   * Subject to the spotify_actions Permission_Category.
   */
  spotify_modify_playlist: async (supabase, userId, args) => {
    const playlistId = args.playlist_id as string | undefined;
    const addTracks = (args.add_tracks as string[]) || [];
    const removeTracks = (args.remove_tracks as string[]) || [];

    if (!playlistId) {
      throw new Error(
        'spotify_modify_playlist requires a "playlist_id" argument'
      );
    }

    if (addTracks.length === 0 && removeTracks.length === 0) {
      throw new Error(
        'spotify_modify_playlist requires at least one of "add_tracks" or "remove_tracks"'
      );
    }

    const accessToken = await getSpotifyAccessToken(supabase, userId);

    let tracksAdded = 0;
    let tracksRemoved = 0;

    // Add tracks
    if (addTracks.length > 0) {
      await spotifyApiRequest(
        accessToken,
        'POST',
        `/playlists/${playlistId}/tracks`,
        { uris: addTracks }
      );
      tracksAdded = addTracks.length;
    }

    // Remove tracks
    if (removeTracks.length > 0) {
      await spotifyApiRequest(
        accessToken,
        'DELETE',
        `/playlists/${playlistId}/tracks`,
        { tracks: removeTracks.map((uri: string) => ({ uri })) }
      );
      tracksRemoved = removeTracks.length;
    }

    return {
      playlist_id: playlistId,
      tracks_added: tracksAdded,
      tracks_removed: tracksRemoved,
    };
  },

  /**
   * spotify_suggest_pace_playlist — Suggests playlists matching the user's running/cycling/walking pace.
   * Uses route history context to correlate pace to ideal BPM and search for matching playlists.
   * Subject to the spotify_actions Permission_Category.
   * Validates: Requirement 35.1
   */
  spotify_suggest_pace_playlist: async (supabase, userId, args) => {
    const activityType = args.activity_type as string | undefined;
    const targetPace = args.target_pace_seconds_per_km as number | undefined;
    const durationMinutes = args.duration_minutes as number | undefined;
    const recentRouteSummary = args.recent_route_summary as {
      avg_pace_seconds_per_km?: number;
      avg_speed_kmh?: number;
      distance_meters?: number;
      elevation_gain_meters?: number;
    } | undefined;

    if (!activityType || !['running', 'cycling', 'walking'].includes(activityType)) {
      throw new Error(
        'spotify_suggest_pace_playlist requires "activity_type" (running, cycling, or walking)'
      );
    }

    // Determine the effective pace: prefer explicit target, fall back to route history average
    const effectivePace =
      targetPace ?? recentRouteSummary?.avg_pace_seconds_per_km ?? null;

    // Correlate pace to ideal BPM range based on activity type
    const bpmRange = determineBpmRange(activityType, effectivePace);

    // Build a search query combining activity type and BPM/energy descriptors
    const searchQuery = buildPacePlaylistQuery(activityType, bpmRange, durationMinutes);

    // Search Spotify for matching playlists
    const accessToken = await getSpotifyAccessToken(supabase, userId);

    const encodedQuery = encodeURIComponent(searchQuery);
    const searchLimit = 5;
    const data = (await spotifyApiRequest(
      accessToken,
      'GET',
      `/search?type=playlist&q=${encodedQuery}&limit=${searchLimit}`
    )) as { playlists?: { items?: Array<Record<string, unknown>> } };

    const items = data?.playlists?.items ?? [];

    const playlists = items.map((item: Record<string, unknown>) => ({
      id: item.id,
      name: item.name,
      description: (item.description as string) || '',
      tracks_total: (item.tracks as Record<string, unknown>)?.total ?? 0,
      external_url:
        (item.external_urls as Record<string, unknown>)?.spotify ?? null,
    }));

    return {
      activity_type: activityType,
      target_bpm_range: bpmRange,
      effective_pace_seconds_per_km: effectivePace,
      duration_minutes: durationMinutes ?? null,
      route_context_used: !!recentRouteSummary,
      playlists,
    };
  },

  /**
   * get_route_history — Returns recent GPS route summaries (distance, duration, pace, speed,
   * elevation gain, date). Optionally includes the full GPS point_stream data.
   * Subject to the health_access Permission_Category.
   * Validates: Requirements 33.1, 33.2, 34.1, 34.2
   */
  get_route_history: async (supabase, userId, args) => {
    const limit = (args.limit as number) ?? 10;
    const includeFullPoints = (args.include_full_points as boolean) ?? false;

    // Select summary columns; optionally include point_stream
    const selectColumns = [
      'id',
      'session_id',
      'program_day_id',
      'distance_meters',
      'duration_seconds',
      'avg_pace_seconds_per_km',
      'avg_speed_kmh',
      'elevation_gain_meters',
      'started_at',
      'completed_at',
      'created_at',
    ];

    if (includeFullPoints) {
      selectColumns.push('point_stream');
    }

    const { data, error } = await supabase
      .from('routes')
      .select(selectColumns.join(', '))
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch route history: ${error.message}`);
    }

    const routes = (data ?? []).map(
      (r: Record<string, unknown>) => {
        const summary: Record<string, unknown> = {
          id: r.id,
          session_id: r.session_id ?? null,
          program_day_id: r.program_day_id ?? null,
          distance_km: r.distance_meters
            ? +((r.distance_meters as number) / 1000).toFixed(2)
            : 0,
          duration_minutes: r.duration_seconds
            ? +((r.duration_seconds as number) / 60).toFixed(1)
            : 0,
          pace_min_per_km: r.avg_pace_seconds_per_km
            ? +((r.avg_pace_seconds_per_km as number) / 60).toFixed(2)
            : null,
          speed_kmh: r.avg_speed_kmh
            ? +(r.avg_speed_kmh as number).toFixed(2)
            : null,
          elevation_gain_meters: r.elevation_gain_meters ?? null,
          date: r.created_at,
        };

        if (includeFullPoints && r.point_stream) {
          summary.points = r.point_stream;
        }

        return summary;
      }
    );

    return { routes, count: routes.length };
  },

  /**
   * get_recovery_summary — Returns normalized health data summary (sleep, HRV, activity).
   * Returns only normalized Cadence-owned summaries, never raw records.
   * Validates: Requirement 15.2
   */
  get_recovery_summary: async (supabase, userId, args) => {
    const days = (args.days as number) ?? 7;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const sinceDateStr = sinceDate.toISOString().split('T')[0];

    // Query most recent sleep summary within the date range
    const { data: sleepData } = await supabase
      .from('imported_sleep_summaries')
      .select('date, total_duration_minutes, deep_minutes, rem_minutes')
      .eq('user_id', userId)
      .gte('date', sinceDateStr)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    // Query most recent heart rate summary within the date range
    const { data: hrData } = await supabase
      .from('imported_heart_rate_summaries')
      .select('date, resting_bpm, average_bpm')
      .eq('user_id', userId)
      .gte('date', sinceDateStr)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    // Query most recent activity snapshot within the date range
    const { data: activityData } = await supabase
      .from('imported_activity_snapshots')
      .select('date, steps, hrv_ms, vo2_max')
      .eq('user_id', userId)
      .gte('date', sinceDateStr)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    return {
      sleep: sleepData
        ? {
            date: sleepData.date,
            total_hours: +(sleepData.total_duration_minutes / 60).toFixed(1),
            deep_minutes: sleepData.deep_minutes ?? null,
            rem_minutes: sleepData.rem_minutes ?? null,
          }
        : null,
      heart_rate: hrData
        ? {
            date: hrData.date,
            resting_bpm: hrData.resting_bpm ?? null,
            average_bpm: hrData.average_bpm ?? null,
          }
        : null,
      activity: activityData
        ? {
            date: activityData.date,
            steps: activityData.steps ?? null,
            hrv_ms: activityData.hrv_ms ?? null,
            vo2_max: activityData.vo2_max ?? null,
          }
        : null,
    };
  },

  /**
   * get_recent_workouts_summary — Returns a summary of recent imported workouts.
   * Returns only normalized Cadence-owned summaries, never raw records.
   * Validates: Requirement 15.2
   */
  get_recent_workouts_summary: async (supabase, userId, args) => {
    const limit = (args.limit as number) ?? 5;

    const { data, error } = await supabase
      .from('imported_workouts')
      .select('workout_type, start_time, duration_seconds, distance_meters')
      .eq('user_id', userId)
      .order('start_time', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch workouts summary: ${error.message}`);
    }

    const workouts = (data ?? []).map(
      (w: {
        workout_type: string;
        start_time: string;
        duration_seconds: number;
        distance_meters: number | null;
      }) => ({
        workout_type: w.workout_type,
        start_time: w.start_time,
        duration_minutes: +(w.duration_seconds / 60).toFixed(1),
        distance_km: w.distance_meters
          ? +(w.distance_meters / 1000).toFixed(2)
          : null,
      })
    );

    return { workouts };
  },
};

/**
 * Retrieves a tool handler by name.
 * Returns undefined if the tool name is not registered.
 */
export function getToolHandler(toolName: string): ToolHandler | undefined {
  return toolHandlerRegistry[toolName];
}

/**
 * Registers a new tool handler (useful for testing or dynamic registration).
 */
export function registerToolHandler(
  toolName: string,
  handler: ToolHandler
): void {
  toolHandlerRegistry[toolName] = handler;
}

/**
 * Returns all registered tool names.
 */
export function getRegisteredToolNames(): string[] {
  return Object.keys(toolHandlerRegistry);
}
