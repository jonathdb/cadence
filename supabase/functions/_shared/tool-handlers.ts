/**
 * Tool handler registry for Cadence Agent tool calls.
 * Each handler receives the Supabase client, user_id, and tool arguments,
 * and returns the result of executing the tool.
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 4.2, 5.3, 6.1, 6.2, 15.2, 22.3, 26.1, 26.2, 26.3
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
    AnalyticsSet,
    CardioActivityType,
    CardioEffort,
    MuscleGroup,
} from './analytics-engine.ts';
import {
    computeAdherence,
    computeCardioLoad,
    computeCardioTrend,
    computeDistanceBuckets,
    computeExercisePRHistory,
    computeMuscleBalance,
    computeVolumeTrend,
    critiqueProgram,
} from './analytics-engine.ts';
import type {
    CardioProgressionInput,
    ExerciseHistory as EngineExerciseHistory,
    ProgramTarget as EngineProgramTarget,
    ProfileForProgression,
    RecoveryV2,
} from './progression-engine.ts';
import { evaluateProgressionV2 } from './progression-engine.ts';
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
 *   - Slow running/jogging (> 420 s/km = 7:00+): 140-150 BPM
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
    return { min: 140, max: 150, label: 'slow jogging' };
  }
}

// --- Session Context for program-based pace derivation ---

/**
 * Represents the context of a training session from a user's program.
 * Used to derive a target pace when no route history is available.
 * Validates: Requirements 5.1, 5.3, 5.4
 */
export interface SessionContext {
  session_type: 'easy run' | 'tempo run' | 'interval session' | 'long run';
  planned_duration_minutes?: number; // 1-480
  intensity_label?: 'low' | 'moderate' | 'high';
}

/**
 * Derives a target pace (seconds per km) from session context.
 * Maps session types to base pace estimates and adjusts by intensity:
 *   - "easy run" → 390 s/km
 *   - "tempo run" → 310 s/km
 *   - "interval session" → 280 s/km
 *   - "long run" → 360 s/km
 * Intensity adjustments:
 *   - "low" → +30 s/km
 *   - "moderate" → no change
 *   - "high" → -20 s/km
 *
 * Validates: Requirements 5.3, 5.4
 */
export function deriveSessionPace(sessionContext: SessionContext): number {
  const basePaceMap: Record<string, number> = {
    'easy run': 390,
    'tempo run': 310,
    'interval session': 280,
    'long run': 360,
  };

  let pace = basePaceMap[sessionContext.session_type];
  if (pace === undefined) {
    throw new Error(
      `Unrecognized session_type: "${sessionContext.session_type}". Valid options: easy run, tempo run, interval session, long run`
    );
  }

  // Adjust by intensity
  switch (sessionContext.intensity_label) {
    case 'low':
      pace += 30;
      break;
    case 'high':
      pace -= 20;
      break;
    // 'moderate' or undefined = no adjustment
  }

  return pace;
}

export interface MusicSeedsInput {
  genres?: string[];       // Valid Spotify genre identifiers (e.g., "pop", "electronic")
  seed_artists?: string[]; // Spotify artist IDs or artist names (resolved to IDs by handler)
  seed_tracks?: string[];  // Spotify track IDs or track names (resolved to IDs by handler)
}

export interface ResolvedMusicSeeds {
  genres: string[];        // Passed through as-is
  seed_artists: string[];  // Resolved to Spotify artist IDs
  seed_tracks: string[];   // Resolved to Spotify track IDs
}

/**
 * Validates and truncates the combined seed count (max 5 per original Spotify API constraint).
 * Since the Recommendations API is deprecated, we now truncate excess seeds
 * rather than throwing, to gracefully degrade for playlist search.
 * Validates: Requirements 11.4, 11.5
 */
export function validateSeedCount(
  genres: string[] = [],
  seedArtists: string[] = [],
  seedTracks: string[] = []
): { genres: string[]; seedArtists: string[]; seedTracks: string[] } {
  const total = genres.length + seedArtists.length + seedTracks.length;
  if (total <= 5) {
    return { genres, seedArtists, seedTracks };
  }

  // Truncate: prioritize genres first, then artists, then tracks
  const result: string[] = [];
  for (const g of genres) { if (result.length < 5) result.push(g); }
  const truncatedGenres = result.slice(0, genres.length);
  const remaining = 5 - truncatedGenres.length;
  const truncatedArtists = seedArtists.slice(0, remaining);
  const finalRemaining = remaining - truncatedArtists.length;
  const truncatedTracks = seedTracks.slice(0, finalRemaining);

  return {
    genres: truncatedGenres,
    seedArtists: truncatedArtists,
    seedTracks: truncatedTracks,
  };
}

/**
 * Resolves a value to a Spotify artist ID.
 * If the value looks like a Spotify ID (22-char alphanumeric), returns it as-is.
 * Otherwise, searches Spotify for the artist name and returns the top result's ID.
 * Validates: Requirements 11.2, 11.6
 */
export async function resolveArtistId(
  value: string,
  accessToken: string
): Promise<string | null> {
  if (/^[a-zA-Z0-9]{22}$/.test(value)) {
    return value;
  }

  const response = await spotifyApiRequest(
    accessToken,
    'GET',
    `/search?q=${encodeURIComponent(value)}&type=artist&limit=1`
  ) as { artists?: { items?: Array<{ id: string }> } };

  return response.artists?.items?.[0]?.id ?? null;
}

/**
 * Resolves a value to a Spotify track ID.
 * If the value looks like a Spotify ID (22-char alphanumeric), returns it as-is.
 * Otherwise, searches Spotify for the track name and returns the top result's ID.
 * Validates: Requirements 11.3, 11.6
 */
export async function resolveTrackId(
  value: string,
  accessToken: string
): Promise<string | null> {
  if (/^[a-zA-Z0-9]{22}$/.test(value)) {
    return value;
  }

  const response = await spotifyApiRequest(
    accessToken,
    'GET',
    `/search?q=${encodeURIComponent(value)}&type=track&limit=1`
  ) as { tracks?: { items?: Array<{ id: string }> } };

  return response.tracks?.items?.[0]?.id ?? null;
}

/**
 * Resolves all seed values, filtering out any that fail to resolve.
 * Returns the resolved MusicSeeds ready for the Recommendations API.
 * Validates: Requirements 11.2, 11.3, 11.6
 */
export async function resolveSeeds(
  genres: string[] = [],
  seedArtists: string[] = [],
  seedTracks: string[] = [],
  accessToken: string
): Promise<ResolvedMusicSeeds> {
  const resolvedArtists = (
    await Promise.all(seedArtists.map((a) => resolveArtistId(a, accessToken)))
  ).filter((id): id is string => id !== null);

  const resolvedTracks = (
    await Promise.all(seedTracks.map((t) => resolveTrackId(t, accessToken)))
  ).filter((id): id is string => id !== null);

  return {
    genres,
    seed_artists: resolvedArtists,
    seed_tracks: resolvedTracks,
  };
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

// --- Analytics helpers (Task 3) ---

/** ISO timestamp for `days` ago from now. */
function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/**
 * Resolve a batch of exercise ids to their primary muscle group, mapped into the
 * analytics-engine 9-group model. Unknown/unmappable groups resolve to null.
 */
async function resolveMuscleGroups(
  supabase: SupabaseClient,
  exerciseIds: string[]
): Promise<Map<string, MuscleGroup | null>> {
  const result = new Map<string, MuscleGroup | null>();
  if (exerciseIds.length === 0) return result;

  const { data } = await supabase
    .from('exercises')
    .select('id, primary_muscle_group')
    .in('id', exerciseIds);

  for (const row of (data ?? []) as { id: string; primary_muscle_group: string }[]) {
    result.set(row.id, normalizeMuscleGroup(row.primary_muscle_group));
  }
  return result;
}

const VALID_MUSCLE_GROUPS = new Set<MuscleGroup>([
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves',
]);

/** Map a free-text muscle group to the 9-group model (best-effort), else null. */
function normalizeMuscleGroup(raw: string | null | undefined): MuscleGroup | null {
  if (!raw) return null;
  const g = raw.trim().toLowerCase();
  if (VALID_MUSCLE_GROUPS.has(g as MuscleGroup)) return g as MuscleGroup;
  // Common synonyms / aliases
  const aliases: Record<string, MuscleGroup> = {
    quadriceps: 'quads',
    quad: 'quads',
    hamstring: 'hamstrings',
    glute: 'glutes',
    calf: 'calves',
    delts: 'shoulders',
    deltoids: 'shoulders',
    lats: 'back',
    pecs: 'chest',
    bicep: 'biceps',
    tricep: 'triceps',
  };
  return aliases[g] ?? null;
}

/** Map an imported workout_type string to a cardio activity type. */
function mapWorkoutTypeToActivity(workoutType: string | null | undefined): CardioActivityType {
  const t = (workoutType ?? '').toLowerCase();
  if (t.includes('run') || t.includes('jog')) return 'running';
  if (t.includes('cycl') || t.includes('bike') || t.includes('ride')) return 'cycling';
  if (t.includes('walk') || t.includes('hik')) return 'walking';
  return 'other';
}

/**
 * Backfill the personal_records table with the latest computed PR per exercise when
 * it is not already persisted. Non-fatal: logs and continues on error. The table
 * exists in the schema but was previously never written to.
 */
async function backfillPersonalRecords(
  supabase: SupabaseClient,
  userId: string,
  setsByExercise: Map<string, AnalyticsSet[]>,
  nameById: Map<string, string>
): Promise<void> {
  try {
    for (const [exerciseId, exSets] of setsByExercise.entries()) {
      const history = computeExercisePRHistory(nameById.get(exerciseId) ?? 'Unknown', exSets);
      const latest = history.records[history.records.length - 1];
      if (!latest) continue;

      // Skip if an equal-or-better record of the same type already exists.
      const { data: existing } = await supabase
        .from('personal_records')
        .select('id, value')
        .eq('user_id', userId)
        .eq('exercise_id', exerciseId)
        .eq('pr_type', latest.pr_type)
        .order('value', { ascending: false })
        .limit(1);

      const bestExisting = (existing ?? [])[0] as { value: number } | undefined;
      if (bestExisting && bestExisting.value >= latest.value) continue;

      await supabase.from('personal_records').insert({
        user_id: userId,
        exercise_id: exerciseId,
        pr_type: latest.pr_type,
        value: latest.value,
        achieved_at: latest.achieved_at,
      });
    }
  } catch (err) {
    console.error('[get_pr_history] personal_records backfill failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Assemble program targets for the user's active program in the engine's shape,
 * plus a name→muscle-group map used to tag exercise history.
 */
async function assembleProgramTargets(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  programTargets: EngineProgramTarget[];
  exerciseNameToMuscle: Map<string, MuscleGroup>;
  exerciseNameToEquipment: Map<string, string | null>;
}> {
  const programTargets: EngineProgramTarget[] = [];
  const exerciseNameToMuscle = new Map<string, MuscleGroup>();
  const exerciseNameToEquipment = new Map<string, string | null>();

  const { data: program } = await supabase
    .from('programs')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (!program) return { programTargets, exerciseNameToMuscle, exerciseNameToEquipment };

  const { data: days } = await supabase
    .from('program_days')
    .select('id')
    .eq('program_id', program.id);

  const dayIds = (days ?? []).map((d: { id: string }) => d.id);
  if (dayIds.length === 0) return { programTargets, exerciseNameToMuscle, exerciseNameToEquipment };

  const { data: items } = await supabase
    .from('program_day_items')
    .select('exercise_id, target_sets, target_reps, target_weight, target_rpe')
    .in('program_day_id', dayIds)
    .eq('type', 'exercise');

  const itemRows = (items ?? []) as {
    exercise_id: string | null;
    target_sets: number;
    target_reps: string;
    target_weight: number | null;
    target_rpe: number | null;
  }[];

  const exerciseIds = Array.from(new Set(itemRows.map((i) => i.exercise_id).filter((x): x is string => !!x)));
  const { data: exercises } = await supabase
    .from('exercises')
    .select('id, name, primary_muscle_group, equipment')
    .in('id', exerciseIds);

  const exById = new Map(
    ((exercises ?? []) as { id: string; name: string; primary_muscle_group: string; equipment: string | null }[]).map((e) => [e.id, e])
  );

  for (const item of itemRows) {
    if (!item.exercise_id) continue;
    const ex = exById.get(item.exercise_id);
    if (!ex) continue;
    const muscle = normalizeMuscleGroup(ex.primary_muscle_group);
    if (muscle) exerciseNameToMuscle.set(ex.name, muscle);
    exerciseNameToEquipment.set(ex.name, ex.equipment ?? null);
    programTargets.push({
      exercise_name: ex.name,
      target_sets: item.target_sets,
      target_rep_range: item.target_reps,
      target_weight: item.target_weight ?? 0,
      target_rpe: item.target_rpe,
    });
  }

  return { programTargets, exerciseNameToMuscle, exerciseNameToEquipment };
}

/**
 * Assemble recent per-exercise session history (most-recent-first) for the engine.
 * Scans the user's most recent completed sessions and groups logged sets by exercise.
 */
async function assembleExerciseHistory(
  supabase: SupabaseClient,
  userId: string,
  exerciseNameToMuscle: Map<string, MuscleGroup>,
  sessionsToScan: number
): Promise<EngineExerciseHistory[]> {
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, completed_at')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(sessionsToScan);

  const sessionRows = (sessions ?? []) as { id: string; completed_at: string }[];
  if (sessionRows.length === 0) return [];

  const sessionIds = sessionRows.map((s) => s.id);
  const completedAtById = new Map(sessionRows.map((s) => [s.id, s.completed_at]));

  const { data: sets } = await supabase
    .from('logged_sets')
    .select('session_id, exercise_id, reps, weight, rpe')
    .in('session_id', sessionIds);

  const setRows = (sets ?? []) as {
    session_id: string;
    exercise_id: string;
    reps: number;
    weight: number;
    rpe: number | null;
  }[];

  // Resolve exercise names + muscle groups.
  const exerciseIds = Array.from(new Set(setRows.map((s) => s.exercise_id)));
  const { data: exercises } = await supabase
    .from('exercises')
    .select('id, name, primary_muscle_group')
    .in('id', exerciseIds);
  const exById = new Map(
    ((exercises ?? []) as { id: string; name: string; primary_muscle_group: string }[]).map((e) => [e.id, e])
  );

  // Group: exercise → session → sets.
  const byExercise = new Map<string, Map<string, { weight: number; reps: number; rpe: number | null }[]>>();
  for (const s of setRows) {
    const ex = exById.get(s.exercise_id);
    if (!ex) continue;
    const perSession = byExercise.get(ex.name) ?? new Map();
    const arr = perSession.get(s.session_id) ?? [];
    arr.push({ weight: s.weight, reps: s.reps, rpe: s.rpe });
    perSession.set(s.session_id, arr);
    byExercise.set(ex.name, perSession);
  }

  const history: EngineExerciseHistory[] = [];
  for (const [exerciseName, perSession] of byExercise.entries()) {
    const muscle = exerciseNameToMuscle.get(exerciseName)
      ?? normalizeMuscleGroup(exById.get(
        setRows.find((s) => exById.get(s.exercise_id)?.name === exerciseName)?.exercise_id ?? ''
      )?.primary_muscle_group)
      ?? 'chest'; // safe default for the engine's muscle-group typing

    // Order sessions most-recent-first by completed_at.
    const sessionEntries = Array.from(perSession.entries())
      .sort((a, b) => {
        const at = new Date(completedAtById.get(a[0]) ?? 0).getTime();
        const bt = new Date(completedAtById.get(b[0]) ?? 0).getTime();
        return bt - at;
      })
      .map(([sessionId, sessionSets]) => ({
        session_date: completedAtById.get(sessionId) ?? new Date().toISOString(),
        sets: sessionSets,
      }));

    history.push({ exercise_name: exerciseName, muscle_group: muscle, sessions: sessionEntries });
  }

  return history;
}

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
  planned_duration_minutes?: number | null;
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
    .select('id, day_number, name, planned_duration_minutes')
    .eq('program_id', programId)
    .order('day_number');

  if (daysErr) {
    throw new Error(`Failed to fetch program days: ${daysErr.message}`);
  }

  const daysWithItems = [];
  for (const day of days || []) {
    const { data: items } = await supabase
      .from('program_day_items')
      .select('id, type, order_index, exercise_id, block_id, target_sets, target_reps, target_weight, target_rpe, timer_config, notes')
      .eq('program_day_id', day.id)
      .order('order_index');

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
        planned_duration_minutes: day.planned_duration_minutes ?? null,
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
            order_index: order,
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
            order_index: order,
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
          .select('order_index')
          .eq('program_day_id', day.id)
          .order('order_index', { ascending: false })
          .limit(1)
          .single();

        const nextOrder = (maxOrderResult?.order_index || 0) + 1;
        const updates = change.updates || {};

        const { error } = await supabase
          .from('program_day_items')
          .insert({
            program_day_id: day.id,
            type: 'exercise',
            order_index: nextOrder,
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

    const items = (data?.playlists?.items ?? []).filter((item): item is Record<string, unknown> => item !== null);

    const playlists = items.map((item: Record<string, unknown>) => ({
      id: item.id,
      name: item.name,
      description: (item.description as string) || '',
      tracks_total: (item.tracks as Record<string, unknown>)?.total ?? 0,
      external_url:
        (item.external_urls as Record<string, unknown>)?.spotify ?? null,
      image_url: (item.images as Array<{url: string}>)?.[0]?.url ?? null,
    }));

    return { playlists };
  },

  /**
   * spotify_search_tracks — Search Spotify for tracks matching a query.
   * Returns track URIs that can be used with spotify_create_playlist or spotify_modify_playlist.
   * Subject to the spotify_actions Permission_Category.
   */
  spotify_search_tracks: async (supabase, userId, args) => {
    const query = args.query as string | undefined;
    // Default to 1 for single-track lookups, clamp to Spotify's range (1-50)
    const rawLimit = args.limit != null ? Number(args.limit) : 1;
    const limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(rawLimit, 50) : 1;

    if (!query) {
      throw new Error('spotify_search_tracks requires a "query" argument');
    }

    const accessToken = await getSpotifyAccessToken(supabase, userId);

    const encodedQuery = encodeURIComponent(query);
    const data = (await spotifyApiRequest(
      accessToken,
      'GET',
      `/search?type=track&q=${encodedQuery}&limit=${limit}`
    )) as { tracks?: { items?: Array<Record<string, unknown>> } };

    const items = (data?.tracks?.items ?? []).filter(
      (item): item is Record<string, unknown> => item !== null
    );

    const tracks = items.map((item: Record<string, unknown>) => ({
      id: item.id,
      name: item.name,
      artist: ((item.artists as Array<{ name: string }>)?.[0])?.name ?? 'Unknown',
      album: (item.album as Record<string, unknown>)?.name ?? 'Unknown',
      uri: item.uri,
      duration_ms: item.duration_ms,
      external_url: (item.external_urls as Record<string, unknown>)?.spotify ?? null,
    }));

    return { tracks };
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
    
    // Debug: log stored scopes to verify what was actually granted
    const { data: tokenRecord } = await supabase
      .from('user_spotify_tokens')
      .select('scopes, expires_at')
      .eq('user_id', userId)
      .single();
    console.log(`[spotify_create_playlist] Stored scopes: ${JSON.stringify(tokenRecord?.scopes)}`);
    console.log(`[spotify_create_playlist] Token expires_at: ${tokenRecord?.expires_at}`);
    console.log(`[spotify_create_playlist] Token obtained (first 10 chars): ${accessToken.substring(0, 10)}...`);

    // Get the Spotify user ID
    const meData = (await spotifyApiRequest(
      accessToken,
      'GET',
      '/me'
    )) as { id: string; product?: string };
    const spotifyUserId = meData.id;
    console.log(`[spotify_create_playlist] Spotify user: ${spotifyUserId}, product: ${(meData as Record<string, unknown>).product ?? 'unknown'}`);

    // Create the playlist — try both new and old endpoints with retries
    // /me/playlists is the Feb 2026 endpoint but intermittently returns 400
    // /users/{id}/playlists is the legacy endpoint but sometimes works
    let createData: { id: string; name: string; external_urls: { spotify: string }; images?: Array<{ url: string }> } | null = null;
    const endpoints = [`/me/playlists`, `/users/${spotifyUserId}/playlists`];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`[spotify_create_playlist] POST ${endpoint}, name: "${name}"`);
        createData = (await spotifyApiRequest(
          accessToken,
          'POST',
          endpoint,
          {
            name,
            description,
            public: false,
          }
        )) as { id: string; name: string; external_urls: { spotify: string }; images?: Array<{ url: string }> };
        console.log(`[spotify_create_playlist] Success on ${endpoint}, playlist id: ${createData.id}`);
        break; // Success — stop trying
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : '';
        console.log(`[spotify_create_playlist] ${endpoint} failed: ${errMsg.substring(0, 80)}`);
        // If this is the last endpoint, throw
        if (endpoint === endpoints[endpoints.length - 1]) {
          throw err;
        }
        // Otherwise try the next endpoint
      }
    }

    if (!createData) {
      throw new Error('Failed to create playlist after retries');
    }

    const playlistId = createData.id;
    let tracksAdded = 0;

    // Add tracks if provided
    if (trackUris.length > 0) {
      console.log(`[spotify_create_playlist] Adding ${trackUris.length} tracks to playlist ${playlistId} via /items`);
      await spotifyApiRequest(
        accessToken,
        'POST',
        `/playlists/${playlistId}/items`,
        { uris: trackUris }
      );
      tracksAdded = trackUris.length;
      console.log(`[spotify_create_playlist] Successfully added ${tracksAdded} tracks`);
    }

    return {
      playlist_id: playlistId,
      name: createData.name,
      external_url: createData.external_urls?.spotify ?? null,
      tracks_added: tracksAdded,
      image_url: createData.images?.[0]?.url ?? null,
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
        `/playlists/${playlistId}/items`,
        { uris: addTracks }
      );
      tracksAdded = addTracks.length;
    }

    // Remove tracks (Spotify /items endpoint expects { uris: ["spotify:track:..."] })
    if (removeTracks.length > 0) {
      await spotifyApiRequest(
        accessToken,
        'DELETE',
        `/playlists/${playlistId}/items`,
        { uris: removeTracks }
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
   * spotify_suggest_pace_playlist — Suggests playlists/tracks matching the user's running/cycling/walking pace.
   * Uses fallback hierarchy for pace: target_pace → route summary → session_context → activity defaults.
   * Supports music preference seeds via Spotify Recommendations API with retry-without-seeds fallback.
   * Subject to the spotify_actions Permission_Category.
   * Validates: Requirements 4.1, 5.2, 5.3, 11.4, 11.6, 14.1, 14.2, 14.3, 14.4, 14.5, 15.1, 15.3, 15.4
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
    const sessionContext = args.session_context as SessionContext | undefined;
    const genres = (args.genres as string[]) || [];
    const seedArtists = (args.seed_artists as string[]) || [];
    const seedTracks = (args.seed_tracks as string[]) || [];

    if (!activityType || !['running', 'cycling', 'walking'].includes(activityType)) {
      throw new Error(
        'spotify_suggest_pace_playlist requires "activity_type" (running, cycling, or walking)'
      );
    }

    // 1. Truncate seeds to max 5 — Requirement 11.4
    const truncatedSeeds = validateSeedCount(genres, seedArtists, seedTracks);
    const effectiveGenres = truncatedSeeds.genres;
    const effectiveArtists = truncatedSeeds.seedArtists;
    const effectiveTracks = truncatedSeeds.seedTracks;

    // 2. Determine effective pace using fallback hierarchy — Requirement 4.1
    const effectivePace =
      targetPace
      ?? recentRouteSummary?.avg_pace_seconds_per_km
      ?? (sessionContext ? deriveSessionPace(sessionContext) : null);

    // 3. Determine BPM range (independent of music seeds) — Requirement 14.5
    const bpmRange = determineBpmRange(activityType, effectivePace);

    // 4. Get Spotify access token
    const accessToken = await getSpotifyAccessToken(supabase, userId);

    // 5. Check if seeds are provided
    const hasSeeds = effectiveGenres.length + effectiveArtists.length + effectiveTracks.length > 0;

    if (hasSeeds) {
      // 5a. Build a search query from seed terms — Requirement 11.6
      // Note: Spotify Recommendations API was deprecated (Nov 2024), so we use
      // playlist search with seed information incorporated into the query.
      const seedTerms: string[] = [];
      if (effectiveGenres.length > 0) {
        seedTerms.push(...effectiveGenres);
      }
      if (effectiveArtists.length > 0) {
        seedTerms.push(...effectiveArtists);
      }
      if (effectiveTracks.length > 0) {
        seedTerms.push(...effectiveTracks);
      }

      // Build a search query combining seeds with BPM/activity context
      const seedQuery = `${seedTerms.join(' ')} ${bpmRange.label} ${bpmRange.min}-${bpmRange.max} bpm ${activityType}`;
      const encodedSeedQuery = encodeURIComponent(seedQuery);

      const seedSearchData = await spotifyApiRequest(
        accessToken,
        'GET',
        `/search?type=playlist&q=${encodedSeedQuery}&limit=5`
      ) as { playlists?: { items?: Array<Record<string, unknown>> } };

      const seedItems = (seedSearchData?.playlists?.items ?? []).filter(
        (item): item is Record<string, unknown> => item !== null
      );

      if (seedItems.length > 0) {
        const playlists = seedItems.map((item: Record<string, unknown>) => ({
          id: item.id,
          name: item.name,
          description: (item.description as string) || '',
          tracks_total: (item.tracks as Record<string, unknown>)?.total ?? 0,
          external_url: (item.external_urls as Record<string, unknown>)?.spotify ?? null,
          image_url: (item.images as Array<{url: string}>)?.[0]?.url ?? null,
        }));

        return {
          activity_type: activityType,
          target_bpm_range: bpmRange,
          effective_pace_seconds_per_km: effectivePace,
          duration_minutes: durationMinutes ?? null,
          route_context_used: !!recentRouteSummary,
          source: 'playlist_search_with_seeds',
          playlists,
        };
      }

      // 5c. Retry without seeds — broader search
      const fallbackSeedQuery = `${activityType} workout ${bpmRange.label}`;
      const fallbackSeedData = await spotifyApiRequest(
        accessToken,
        'GET',
        `/search?type=playlist&q=${encodeURIComponent(fallbackSeedQuery)}&limit=5`
      ) as { playlists?: { items?: Array<Record<string, unknown>> } };

      const fallbackSeedItems = (fallbackSeedData?.playlists?.items ?? []).filter(
        (item): item is Record<string, unknown> => item !== null
      );

      if (fallbackSeedItems.length > 0) {
        const playlists = fallbackSeedItems.map((item: Record<string, unknown>) => ({
          id: item.id,
          name: item.name,
          description: (item.description as string) || '',
          tracks_total: (item.tracks as Record<string, unknown>)?.total ?? 0,
          external_url: (item.external_urls as Record<string, unknown>)?.spotify ?? null,
          image_url: (item.images as Array<{url: string}>)?.[0]?.url ?? null,
        }));

        return {
          activity_type: activityType,
          target_bpm_range: bpmRange,
          effective_pace_seconds_per_km: effectivePace,
          duration_minutes: durationMinutes ?? null,
          route_context_used: !!recentRouteSummary,
          source: 'playlist_search_without_seeds',
          playlists,
        };
      }
    } else {
      // 5d. No seeds — use existing playlist search logic — Requirement 15.1, 15.3
      const searchQuery = buildPacePlaylistQuery(activityType, bpmRange, durationMinutes);
      const encodedQuery = encodeURIComponent(searchQuery);
      const searchLimit = 5;

      const data = await spotifyApiRequest(
        accessToken,
        'GET',
        `/search?type=playlist&q=${encodedQuery}&limit=${searchLimit}`
      ) as { playlists?: { items?: Array<Record<string, unknown>> } };

      const items = (data?.playlists?.items ?? []).filter(
        (item): item is Record<string, unknown> => item !== null
      );

      if (items.length > 0) {
        const playlists = items.map((item: Record<string, unknown>) => ({
          id: item.id,
          name: item.name,
          description: (item.description as string) || '',
          tracks_total: (item.tracks as Record<string, unknown>)?.total ?? 0,
          external_url: (item.external_urls as Record<string, unknown>)?.spotify ?? null,
          image_url: (item.images as Array<{url: string}>)?.[0]?.url ?? null,
        }));

        return {
          activity_type: activityType,
          target_bpm_range: bpmRange,
          effective_pace_seconds_per_km: effectivePace,
          duration_minutes: durationMinutes ?? null,
          route_context_used: !!recentRouteSummary,
          source: 'playlist_search',
          playlists,
        };
      }
    }

    // 6. Fallback: widen BPM ±10 and retry playlist search
    const widenedBpmRange = {
      min: bpmRange.min - 10,
      max: bpmRange.max + 10,
      label: `${bpmRange.label} (widened)`,
    };
    const widenedQuery = buildPacePlaylistQuery(activityType, widenedBpmRange, durationMinutes);
    const widenedData = await spotifyApiRequest(
      accessToken,
      'GET',
      `/search?type=playlist&q=${encodeURIComponent(widenedQuery)}&limit=5`
    ) as { playlists?: { items?: Array<Record<string, unknown>> } };

    const widenedItems = (widenedData?.playlists?.items ?? []).filter(
      (item): item is Record<string, unknown> => item !== null
    );

    if (widenedItems.length > 0) {
      const playlists = widenedItems.map((item: Record<string, unknown>) => ({
        id: item.id,
        name: item.name,
        description: (item.description as string) || '',
        tracks_total: (item.tracks as Record<string, unknown>)?.total ?? 0,
        external_url: (item.external_urls as Record<string, unknown>)?.spotify ?? null,
        image_url: (item.images as Array<{url: string}>)?.[0]?.url ?? null,
      }));

      return {
        activity_type: activityType,
        target_bpm_range: widenedBpmRange,
        effective_pace_seconds_per_km: effectivePace,
        duration_minutes: durationMinutes ?? null,
        route_context_used: !!recentRouteSummary,
        source: 'playlist_search',
        playlists,
      };
    }

    // 7. Final fallback: generic activity search
    const fallbackQuery = `${activityType} workout`;
    const fallbackData = await spotifyApiRequest(
      accessToken,
      'GET',
      `/search?type=playlist&q=${encodeURIComponent(fallbackQuery)}&limit=5`
    ) as { playlists?: { items?: Array<Record<string, unknown>> } };

    const fallbackItems = (fallbackData?.playlists?.items ?? []).filter(
      (item): item is Record<string, unknown> => item !== null
    );

    const playlists = fallbackItems.map((item: Record<string, unknown>) => ({
      id: item.id,
      name: item.name,
      description: (item.description as string) || '',
      tracks_total: (item.tracks as Record<string, unknown>)?.total ?? 0,
      external_url: (item.external_urls as Record<string, unknown>)?.spotify ?? null,
      image_url: (item.images as Array<{url: string}>)?.[0]?.url ?? null,
    }));

    return {
      activity_type: activityType,
      target_bpm_range: bpmRange,
      effective_pace_seconds_per_km: effectivePace,
      duration_minutes: durationMinutes ?? null,
      route_context_used: !!recentRouteSummary,
      source: 'playlist_search',
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
   * get_recovery_summary — Returns a normalized recovery summary AVERAGED across the
   * requested window (default 7 days), plus the latest reading and an HRV baseline.
   * Returns only normalized Cadence-owned summaries, never raw records.
   *
   * Previously this returned only the single most-recent record per category, which
   * ignored the `days` window. It now averages across the window so the progression
   * engine can compare the latest HRV against a baseline.
   * Validates: Requirement 15.2
   */
  get_recovery_summary: async (supabase, userId, args) => {
    const days = (args.days as number) ?? 7;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const sinceDateStr = sinceDate.toISOString().split('T')[0];

    const avg = (nums: number[]): number | null =>
      nums.length > 0 ? nums.reduce((s, n) => s + n, 0) / nums.length : null;

    // Sleep — all records in the window (most-recent-first)
    const { data: sleepRows } = await supabase
      .from('imported_sleep_summaries')
      .select('date, total_duration_minutes, deep_minutes, rem_minutes')
      .eq('user_id', userId)
      .gte('date', sinceDateStr)
      .order('date', { ascending: false });

    // Heart rate — all records in the window
    const { data: hrRows } = await supabase
      .from('imported_heart_rate_summaries')
      .select('date, resting_bpm, average_bpm, max_bpm')
      .eq('user_id', userId)
      .gte('date', sinceDateStr)
      .order('date', { ascending: false });

    // Activity — all records in the window (HRV lives here)
    const { data: activityRows } = await supabase
      .from('imported_activity_snapshots')
      .select('date, steps, hrv_ms, vo2_max')
      .eq('user_id', userId)
      .gte('date', sinceDateStr)
      .order('date', { ascending: false });

    const sleep = sleepRows ?? [];
    const hr = hrRows ?? [];
    const activity = activityRows ?? [];

    const sleepMinutes = sleep
      .map((r: { total_duration_minutes: number }) => r.total_duration_minutes)
      .filter((n: number) => n != null);
    const restingBpms = hr
      .map((r: { resting_bpm: number | null }) => r.resting_bpm)
      .filter((n: number | null): n is number => n != null);
    const hrvValues = activity
      .map((r: { hrv_ms: number | null }) => r.hrv_ms)
      .filter((n: number | null): n is number => n != null);

    const avgSleepMin = avg(sleepMinutes);
    const latestSleep = sleep[0] ?? null;
    const latestHr = hr[0] ?? null;
    const latestActivity = activity[0] ?? null;
    const latestHrv = hrvValues.length > 0 ? hrvValues[0] : null;
    const hrvBaseline = avg(hrvValues);

    return {
      window_days: days,
      sample_counts: { sleep: sleep.length, heart_rate: hr.length, activity: activity.length },
      sleep: {
        avg_total_hours: avgSleepMin != null ? +(avgSleepMin / 60).toFixed(1) : null,
        latest_total_hours: latestSleep ? +(latestSleep.total_duration_minutes / 60).toFixed(1) : null,
        latest_date: latestSleep?.date ?? null,
        latest_deep_minutes: latestSleep?.deep_minutes ?? null,
        latest_rem_minutes: latestSleep?.rem_minutes ?? null,
      },
      heart_rate: {
        avg_resting_bpm: restingBpms.length > 0 ? +avg(restingBpms)!.toFixed(1) : null,
        latest_resting_bpm: latestHr?.resting_bpm ?? null,
        latest_average_bpm: latestHr?.average_bpm ?? null,
        latest_max_bpm: latestHr?.max_bpm ?? null,
        latest_date: latestHr?.date ?? null,
      },
      activity: {
        latest_steps: latestActivity?.steps ?? null,
        latest_vo2_max: latestActivity?.vo2_max ?? null,
        latest_date: latestActivity?.date ?? null,
      },
      hrv: {
        latest_ms: latestHrv,
        baseline_ms: hrvBaseline != null ? +hrvBaseline.toFixed(1) : null,
      },
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

  /**
   * get_active_program — Retrieves the user's currently active training program
   * with full nested structure (days, items with exercise/block resolution).
   * Returns { active_program: null } when no active program exists.
   * Validates: Requirements 6.1, 6.2, 6.3, 6.5, 6.6, 6.7
   */
  get_active_program: async (supabase, userId, _args) => {
    // Query programs where user_id = userId and status = 'active'
    const { data: program, error: progErr } = await supabase
      .from('programs')
      .select('id, name, status, created_at, updated_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (progErr && progErr.code !== 'PGRST116') {
      // PGRST116 = no rows returned (not a real error, just means no active program)
      throw new Error(`Failed to fetch active program: ${progErr.message}`);
    }

    if (!program) {
      return { active_program: null };
    }

    // Fetch program days
    const { data: days, error: daysErr } = await supabase
      .from('program_days')
      .select('id, day_number, name, planned_duration_minutes')
      .eq('program_id', program.id)
      .order('day_number');

    if (daysErr) {
      throw new Error(`Failed to fetch program days: ${daysErr.message}`);
    }

    // Build nested structure with items for each day
    const daysWithItems = [];
    for (const day of days || []) {
      const { data: items, error: itemsErr } = await supabase
        .from('program_day_items')
        .select('id, type, order_index, exercise_id, block_id, target_sets, target_reps, target_weight, target_rpe, timer_config, notes')
        .eq('program_day_id', day.id)
        .order('order_index');

      if (itemsErr) {
        throw new Error(`Failed to fetch items for day ${day.name}: ${itemsErr.message}`);
      }

      // Resolve exercise names and block details
      const resolvedItems = [];
      for (const item of items || []) {
        let exercise_name: string | null = null;
        let block_name: string | null = null;
        let block_type: string | null = null;
        let block_timer_config: unknown = null;

        if (item.type === 'exercise' && item.exercise_id) {
          const { data: exercise } = await supabase
            .from('exercises')
            .select('name')
            .eq('id', item.exercise_id)
            .single();
          exercise_name = exercise?.name ?? null;
        }

        if (item.type === 'block' && item.block_id) {
          const { data: block } = await supabase
            .from('blocks')
            .select('name, type, timer_config')
            .eq('id', item.block_id)
            .single();
          block_name = block?.name ?? null;
          block_type = block?.type ?? null;
          block_timer_config = block?.timer_config ?? null;
        }

        resolvedItems.push({
          type: item.type,
          order: item.order_index,
          exercise_name,
          block_name,
          block_type,
          block_timer_config,
          target_sets: item.target_sets,
          target_reps: item.target_reps,
          target_weight: item.target_weight,
          target_rpe: item.target_rpe,
          timer_config: item.timer_config,
          notes: item.notes,
        });
      }

      daysWithItems.push({
        id: day.id,
        day_number: day.day_number,
        name: day.name,
        planned_duration_minutes: day.planned_duration_minutes ?? null,
        items: resolvedItems,
      });
    }

    return {
      active_program: {
        id: program.id,
        name: program.name,
        status: program.status,
        created_at: program.created_at,
        updated_at: program.updated_at,
        days: daysWithItems,
      },
    };
  },

  /**
   * get_programs — Returns a list of the user's programs with summary counts.
   * Optionally filtered by status. Ordered by updated_at descending.
   * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
   */
  get_programs: async (supabase, userId, args) => {
    const status = (args.status as string) ?? 'all';
    const validStatuses = ['active', 'draft', 'archived', 'all'];

    if (!validStatuses.includes(status)) {
      throw new Error(
        `Unrecognized status: "${status}". Valid options: ${validStatuses.join(', ')}`
      );
    }

    // Build query
    let query = supabase
      .from('programs')
      .select('id, name, status, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: programs, error: progErr } = await query;

    if (progErr) {
      throw new Error(`Failed to fetch programs: ${progErr.message}`);
    }

    if (!programs || programs.length === 0) {
      return { programs: [] };
    }

    // For each program, get days and sessions_count
    const result = [];
    for (const program of programs) {
      // Fetch program days with planned_duration_minutes
      const { data: programDays } = await supabase
        .from('program_days')
        .select('id, day_number, name, planned_duration_minutes')
        .eq('program_id', program.id)
        .order('day_number');

      // Count completed sessions (via program_days)
      let sessionsCount = 0;
      if (programDays && programDays.length > 0) {
        const dayIds = programDays.map((d: { id: string }) => d.id);
        const { count } = await supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .in('program_day_id', dayIds)
          .eq('status', 'completed');
        sessionsCount = count ?? 0;
      }

      result.push({
        id: program.id,
        name: program.name,
        status: program.status,
        created_at: program.created_at,
        updated_at: program.updated_at,
        days_count: programDays?.length ?? 0,
        sessions_count: sessionsCount,
        days: (programDays || []).map((d: { day_number: number; name: string; planned_duration_minutes: number | null }) => ({
          day_number: d.day_number,
          name: d.name,
          planned_duration_minutes: d.planned_duration_minutes ?? null,
        })),
      });
    }

    return { programs: result };
  },

  /**
   * get_session_history — Returns recent completed session summaries with aggregates.
   * Optionally filters by program_id. Returns empty list for unauthorized program_id
   * (no existence leakage) or when no sessions match.
   * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.6, 7.7, 7.8
   */
  get_session_history: async (supabase, userId, args) => {
    const limit = (args.limit as number) ?? 10;
    const programId = args.program_id as string | undefined;

    // Validate limit range (Requirement 7.8)
    if (limit < 1 || limit > 100) {
      throw new Error('Parameter "limit" must be between 1 and 100.');
    }

    // Build query for completed sessions (Requirement 7.4)
    let query = supabase
      .from('sessions')
      .select('id, program_day_id, status, started_at, completed_at, created_at')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(limit);

    // If filtering by program_id, get program_day_ids for that program (Requirement 7.3)
    if (programId) {
      // Verify program belongs to the user — return empty if not (Requirement 7.7)
      const { data: programCheck } = await supabase
        .from('programs')
        .select('id')
        .eq('id', programId)
        .eq('user_id', userId)
        .single();

      if (!programCheck) {
        return { sessions: [] };
      }

      const { data: programDays } = await supabase
        .from('program_days')
        .select('id')
        .eq('program_id', programId);

      const dayIds = (programDays || []).map((d: { id: string }) => d.id);
      if (dayIds.length === 0) {
        return { sessions: [] };
      }

      query = query.in('program_day_id', dayIds);
    }

    const { data: sessions, error: sessErr } = await query;

    if (sessErr) {
      throw new Error(`Failed to fetch session history: ${sessErr.message}`);
    }

    // Return empty list when no sessions match (Requirement 7.6)
    if (!sessions || sessions.length === 0) {
      return { sessions: [] };
    }

    // For each session, compute aggregates (Requirement 7.1)
    const result = [];
    for (const session of sessions) {
      // Get program day name
      let programDayName = 'Unknown';
      if (session.program_day_id) {
        const { data: dayData } = await supabase
          .from('program_days')
          .select('name')
          .eq('id', session.program_day_id)
          .single();
        programDayName = dayData?.name ?? 'Unknown';
      }

      // Get logged sets for aggregates
      const { data: sets } = await supabase
        .from('logged_sets')
        .select('weight, reps, is_pr')
        .eq('session_id', session.id);

      const totalSets = sets?.length ?? 0;
      const totalVolume = (sets ?? []).reduce(
        (sum: number, s: { weight: number; reps: number }) =>
          sum + ((s.weight || 0) * (s.reps || 0)),
        0
      );
      const prCount = (sets ?? []).filter(
        (s: { is_pr: boolean }) => s.is_pr
      ).length;

      // Calculate duration in seconds
      const durationSeconds = session.completed_at && session.started_at
        ? Math.round(
            (new Date(session.completed_at).getTime() -
              new Date(session.started_at).getTime()) /
              1000
          )
        : 0;

      result.push({
        id: session.id,
        program_day_name: programDayName,
        completed_at: session.completed_at,
        total_duration_seconds: durationSeconds,
        total_sets: totalSets,
        total_volume_kg: totalVolume,
        pr_count: prCount,
      });
    }

    return { sessions: result };
  },

  /**
   * get_session_details — Returns detailed information about a specific workout session,
   * including logged sets grouped by exercise and block completions.
   * Subject to the health_access Permission_Category.
   * Validates: Requirements 8.1, 8.3, 8.4, 8.6, 8.7
   */
  get_session_details: async (supabase, userId, args) => {
    const sessionId = args.session_id as string | undefined;

    if (!sessionId) {
      throw new Error('get_session_details requires a "session_id" argument');
    }

    // Verify session belongs to authenticated user
    const { data: session, error: sessErr } = await supabase
      .from('sessions')
      .select('id, program_day_id, status, started_at, completed_at')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (sessErr || !session) {
      throw new Error('Session not found');
    }

    // Get program day name
    let programDayName = 'Unknown';
    if (session.program_day_id) {
      const { data: dayData } = await supabase
        .from('program_days')
        .select('name')
        .eq('id', session.program_day_id)
        .single();
      programDayName = dayData?.name ?? 'Unknown';
    }

    // Calculate duration
    const totalDurationSeconds = session.completed_at && session.started_at
      ? Math.round((new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()) / 1000)
      : null;

    // Fetch logged sets ordered by exercise then set_number
    const { data: sets, error: setsErr } = await supabase
      .from('logged_sets')
      .select('exercise_id, set_number, reps, weight, rpe, is_pr, pr_type, actual_duration_seconds')
      .eq('session_id', sessionId)
      .order('exercise_id')
      .order('set_number');

    if (setsErr) {
      throw new Error(`Failed to fetch logged sets: ${setsErr.message}`);
    }

    // Group sets by exercise and resolve names
    const exerciseGroups: Record<string, { exercise_name: string; sets: unknown[] }> = {};
    for (const set of sets || []) {
      if (!exerciseGroups[set.exercise_id]) {
        // Resolve exercise name
        const { data: exercise } = await supabase
          .from('exercises')
          .select('name')
          .eq('id', set.exercise_id)
          .single();

        exerciseGroups[set.exercise_id] = {
          exercise_name: exercise?.name ?? 'Unknown',
          sets: [],
        };
      }

      exerciseGroups[set.exercise_id].sets.push({
        set_number: set.set_number,
        reps: set.reps,
        weight: set.weight,
        rpe: set.rpe ?? null,
        is_pr: set.is_pr ?? false,
        pr_type: set.pr_type ?? null,
        actual_duration_seconds: set.actual_duration_seconds ?? null,
      });
    }

    const exercises = Object.values(exerciseGroups);

    // Fetch block completions
    const { data: blockCompletions } = await supabase
      .from('block_completions')
      .select('block_id, actual_duration_seconds, actual_rounds')
      .eq('session_id', sessionId);

    // Resolve block names
    const resolvedBlockCompletions = [];
    for (const bc of blockCompletions || []) {
      const { data: block } = await supabase
        .from('blocks')
        .select('name')
        .eq('id', bc.block_id)
        .single();

      resolvedBlockCompletions.push({
        block_name: block?.name ?? 'Unknown',
        actual_duration_seconds: bc.actual_duration_seconds,
        actual_rounds: bc.actual_rounds,
      });
    }

    return {
      session: {
        id: session.id,
        program_day_name: programDayName,
        status: session.status,
        started_at: session.started_at,
        completed_at: session.completed_at,
        total_duration_seconds: totalDurationSeconds,
      },
      exercises,
      block_completions: resolvedBlockCompletions,
    };
  },

  /**
   * get_training_analytics — Strength analytics over a rolling window: volume trend,
   * per-muscle-group balance, and consistency/adherence. Fetches completed sessions
   * + logged sets in the window, resolves each exercise's primary muscle group, and
   * delegates the math to the pure analytics-engine.
   * Subject to the health_access Permission_Category.
   */
  get_training_analytics: async (supabase, userId, args) => {
    const weeks = Math.min(Math.max((args.weeks as number) ?? 8, 1), 52);
    const plannedPerWeek = (args.planned_per_week as number) ?? 3;
    const sinceIso = daysAgoIso(weeks * 7);

    // Completed sessions in the window
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, completed_at')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('completed_at', sinceIso)
      .order('completed_at', { ascending: false });

    const sessionRows = (sessions ?? []) as { id: string; completed_at: string }[];
    if (sessionRows.length === 0) {
      return {
        window_weeks: weeks,
        volume_trend: computeVolumeTrend([]),
        muscle_balance: computeMuscleBalance([]),
        adherence: computeAdherence({ completed_session_dates: [], planned_per_week: plannedPerWeek, weeks }),
      };
    }

    const sessionIds = sessionRows.map((s) => s.id);
    const completedAtById = new Map(sessionRows.map((s) => [s.id, s.completed_at]));

    // Logged sets for those sessions
    const { data: sets } = await supabase
      .from('logged_sets')
      .select('session_id, exercise_id, reps, weight, rpe, logged_at')
      .in('session_id', sessionIds);

    const setRows = (sets ?? []) as {
      session_id: string;
      exercise_id: string;
      reps: number;
      weight: number;
      rpe: number | null;
      logged_at: string;
    }[];

    // Resolve primary muscle group per exercise (batched)
    const muscleByExercise = await resolveMuscleGroups(
      supabase,
      Array.from(new Set(setRows.map((s) => s.exercise_id)))
    );

    const analyticsSets: AnalyticsSet[] = setRows.map((s) => ({
      weight: s.weight,
      reps: s.reps,
      rpe: s.rpe,
      logged_at: s.logged_at ?? completedAtById.get(s.session_id) ?? sinceIso,
      muscle_group: muscleByExercise.get(s.exercise_id) ?? null,
    }));

    return {
      window_weeks: weeks,
      volume_trend: computeVolumeTrend(analyticsSets),
      muscle_balance: computeMuscleBalance(analyticsSets),
      adherence: computeAdherence({
        completed_session_dates: sessionRows.map((s) => s.completed_at),
        planned_per_week: plannedPerWeek,
        weeks,
      }),
    };
  },

  /**
   * get_pr_history — Per-exercise PR timeline computed from logged sets. Also backfills
   * the personal_records table when the latest computed PR is not yet persisted (the
   * table exists but was previously never written to).
   * Subject to the health_access Permission_Category.
   */
  get_pr_history: async (supabase, userId, args) => {
    const exerciseNameArg = (args.exercise_name as string | undefined)?.trim();
    const limitExercises = Math.min(Math.max((args.limit as number) ?? 10, 1), 50);

    // Resolve target exercise ids (optionally filtered by name)
    let exerciseQuery = supabase
      .from('exercises')
      .select('id, name')
      .or(`is_global.eq.true,user_id.eq.${userId}`);
    if (exerciseNameArg) {
      exerciseQuery = exerciseQuery.ilike('name', exerciseNameArg);
    }
    const { data: exercises } = await exerciseQuery;
    const exerciseRows = (exercises ?? []) as { id: string; name: string }[];
    if (exerciseRows.length === 0) {
      return { pr_history: [] };
    }

    const nameById = new Map(exerciseRows.map((e) => [e.id, e.name]));
    const exerciseIds = exerciseRows.map((e) => e.id);

    // Only sets belonging to this user's sessions. Fetch the user's sessions first.
    const { data: userSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('user_id', userId);
    const userSessionIds = new Set((userSessions ?? []).map((s: { id: string }) => s.id));

    const { data: sets } = await supabase
      .from('logged_sets')
      .select('session_id, exercise_id, reps, weight, logged_at')
      .in('exercise_id', exerciseIds)
      .order('logged_at', { ascending: true }); // oldest-first for PR walk

    const setRows = ((sets ?? []) as {
      session_id: string;
      exercise_id: string;
      reps: number;
      weight: number;
      logged_at: string;
    }[]).filter((s) => userSessionIds.has(s.session_id));

    // Group oldest-first by exercise
    const byExercise = new Map<string, AnalyticsSet[]>();
    for (const s of setRows) {
      const arr = byExercise.get(s.exercise_id) ?? [];
      arr.push({ weight: s.weight, reps: s.reps, logged_at: s.logged_at });
      byExercise.set(s.exercise_id, arr);
    }

    const histories = Array.from(byExercise.entries())
      .map(([exerciseId, exSets]) =>
        computeExercisePRHistory(nameById.get(exerciseId) ?? 'Unknown', exSets)
      )
      .filter((h) => h.records.length > 0)
      .sort((a, b) => b.best_estimated_1rm - a.best_estimated_1rm)
      .slice(0, limitExercises);

    // Backfill personal_records for the latest PR of each exercise if missing.
    await backfillPersonalRecords(supabase, userId, byExercise, nameById);

    return { pr_history: histories };
  },

  /**
   * get_cardio_analytics — Cardio pace/speed trend, per-distance-bucket pace, and weekly
   * load, combining GPS routes and imported health-provider workouts. Delegates the math
   * to the pure analytics-engine.
   * Subject to the health_access Permission_Category.
   */
  get_cardio_analytics: async (supabase, userId, args) => {
    const weeks = Math.min(Math.max((args.weeks as number) ?? 8, 1), 52);
    const activityType = ((args.activity_type as string) ?? 'running') as CardioActivityType;
    const sinceIso = daysAgoIso(weeks * 7);

    // GPS routes (running/walking). routes has no activity type; treat as the requested type.
    const { data: routes } = await supabase
      .from('routes')
      .select('distance_meters, duration_seconds, avg_pace_seconds_per_km, avg_speed_kmh, elevation_gain_meters, created_at')
      .eq('user_id', userId)
      .gte('created_at', sinceIso);

    // Imported health-provider workouts (carry a workout_type)
    const { data: imported } = await supabase
      .from('imported_workouts')
      .select('workout_type, start_time, duration_seconds, distance_meters, average_pace_seconds_per_km, average_speed_kmh, elevation_gain_meters')
      .eq('user_id', userId)
      .gte('start_time', sinceIso);

    const routeEfforts: CardioEffort[] = (routes ?? []).map((r: Record<string, unknown>) => ({
      activity_type: activityType,
      distance_meters: (r.distance_meters as number) ?? 0,
      duration_seconds: (r.duration_seconds as number) ?? 0,
      avg_pace_seconds_per_km: (r.avg_pace_seconds_per_km as number) ?? null,
      avg_speed_kmh: (r.avg_speed_kmh as number) ?? null,
      elevation_gain_meters: (r.elevation_gain_meters as number) ?? null,
      date: (r.created_at as string),
    }));

    const importedEfforts: CardioEffort[] = (imported ?? []).map((w: Record<string, unknown>) => ({
      activity_type: mapWorkoutTypeToActivity(w.workout_type as string),
      distance_meters: (w.distance_meters as number) ?? 0,
      duration_seconds: (w.duration_seconds as number) ?? 0,
      avg_pace_seconds_per_km: (w.average_pace_seconds_per_km as number) ?? null,
      avg_speed_kmh: (w.average_speed_kmh as number) ?? null,
      elevation_gain_meters: (w.elevation_gain_meters as number) ?? null,
      date: (w.start_time as string),
    }));

    const allEfforts = [...routeEfforts, ...importedEfforts];
    const typeEfforts = allEfforts.filter((e) => e.activity_type === activityType);

    return {
      window_weeks: weeks,
      activity_type: activityType,
      effort_count: typeEfforts.length,
      pace_trend: computeCardioTrend(activityType, allEfforts),
      distance_buckets: computeDistanceBuckets(typeEfforts),
      weekly_load: computeCardioLoad(allEfforts),
    };
  },

  /**
   * suggest_progression — Unified, profile-aware progression suggestions.
   *
   * The SERVER assembles all inputs (exercise history, program targets, recovery
   * window, cardio analytics, and profile) from the DB and passes them to the
   * pure progression engine v2. The model no longer hand-assembles fragile
   * payloads — any args are treated only as optional overrides.
   * Subject to the program_edits Permission_Category.
   */
  suggest_progression: async (supabase, userId, args) => {
    const scope = ((args.scope as string) ?? 'full_program') as 'full_program' | 'single_exercise';
    const sessionsToScan = Math.min(Math.max((args.sessions as number) ?? 6, 1), 30);

    // 1) Program targets from the active program.
    const { programTargets, exerciseNameToMuscle } = await assembleProgramTargets(supabase, userId);

    // 2) Exercise history (recent sessions per exercise, most-recent-first).
    const exerciseHistory = await assembleExerciseHistory(
      supabase,
      userId,
      exerciseNameToMuscle,
      sessionsToScan
    );

    // 3) Recovery window (reuse the recovery handler; map to the engine shape).
    const recoveryRaw = (await toolHandlerRegistry.get_recovery_summary(supabase, userId, { days: 7 })) as any;
    const recovery: RecoveryV2 = {
      avg_sleep_hours: recoveryRaw?.sleep?.avg_total_hours ?? null,
      hrv_latest_ms: recoveryRaw?.hrv?.latest_ms ?? null,
      hrv_baseline_ms: recoveryRaw?.hrv?.baseline_ms ?? null,
      resting_hr_bpm: recoveryRaw?.heart_rate?.avg_resting_bpm ?? null,
    };

    // 4) Cardio analytics for running (default) — mapped to the engine input.
    const cardio: CardioProgressionInput[] = [];
    try {
      const cardioRaw = (await toolHandlerRegistry.get_cardio_analytics(supabase, userId, { activity_type: 'running', weeks: 8 })) as any;
      if (cardioRaw?.effort_count > 0) {
        cardio.push({
          activity_type: cardioRaw.activity_type,
          pace_trend: cardioRaw.pace_trend?.pace_trend ?? 'stable',
          weekly_distance_trend: cardioRaw.weekly_load?.distance_trend ?? 'stable',
          avg_weekly_distance_meters: cardioRaw.weekly_load?.avg_weekly_distance_meters ?? 0,
          effort_count: cardioRaw.effort_count ?? 0,
        });
      }
    } catch {
      // Cardio is optional — proceed with strength-only if it fails.
    }

    // 5) Profile.
    const { data: profileRow } = await supabase
      .from('user_profiles')
      .select('goal, experience_level, injuries, equipment')
      .eq('user_id', userId)
      .maybeSingle();
    const profile: ProfileForProgression | null = profileRow ?? null;

    const result = evaluateProgressionV2({
      exercise_history: exerciseHistory,
      recovery,
      program_targets: programTargets,
      profile,
      cardio,
      scope,
    });

    return result;
  },

  /**
   * critique_program — Reviews the user's ACTIVE program against their profile and
   * recent training analytics, returning structured findings + concrete proposed
   * changes. Does NOT mutate anything — the agent must present findings and route
   * any change through program_modify (approval gate unchanged).
   * Subject to the program_edits Permission_Category.
   */
  critique_program: async (supabase, userId, _args) => {
    // Active program id + training-day count.
    const { data: program } = await supabase
      .from('programs')
      .select('id, name')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (!program) {
      return { active_program: null, findings: [], note: 'No active program to critique.' };
    }

    const { data: days } = await supabase
      .from('program_days')
      .select('id')
      .eq('program_id', program.id);
    const trainingDays = (days ?? []).length;

    // Program targets (with muscle group + equipment) reuse the progression assembly helper.
    const { programTargets, exerciseNameToMuscle, exerciseNameToEquipment } = await assembleProgramTargets(supabase, userId);
    const targets = programTargets.map((t) => ({
      exercise_name: t.exercise_name,
      muscle_group: exerciseNameToMuscle.get(t.exercise_name) ?? null,
      target_sets: t.target_sets,
      equipment: exerciseNameToEquipment.get(t.exercise_name) ?? null,
    }));

    // Profile.
    const { data: profileRow } = await supabase
      .from('user_profiles')
      .select('goal, experience_level, weekly_frequency, equipment')
      .eq('user_id', userId)
      .maybeSingle();

    // Recent muscle balance from logged history (last 8 weeks) + recovery flag.
    let muscleBalance = null;
    try {
      const analytics = (await toolHandlerRegistry.get_training_analytics(supabase, userId, { weeks: 8 })) as any;
      muscleBalance = analytics?.muscle_balance ?? null;
    } catch {
      // optional
    }

    let recoveryCompromised = false;
    try {
      const recoveryRaw = (await toolHandlerRegistry.get_recovery_summary(supabase, userId, { days: 7 })) as any;
      const sleep = recoveryRaw?.sleep?.avg_total_hours;
      const hrvLatest = recoveryRaw?.hrv?.latest_ms;
      const hrvBaseline = recoveryRaw?.hrv?.baseline_ms;
      const sleepBreach = sleep != null && sleep < 6;
      const hrvBreach = hrvLatest != null && hrvBaseline != null && hrvBaseline > 0 &&
        (hrvBaseline - hrvLatest) / hrvBaseline >= 0.2;
      recoveryCompromised = sleepBreach || hrvBreach;
    } catch {
      // optional
    }

    const findings = critiqueProgram({
      training_days: trainingDays,
      targets,
      profile: profileRow ?? null,
      muscle_balance: muscleBalance,
      recovery_compromised: recoveryCompromised,
    });

    return {
      program: { id: program.id, name: program.name, training_days: trainingDays },
      findings,
    };
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
