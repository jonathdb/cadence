/**
 * Analytics Engine for the Cadence AI Coach.
 *
 * PURE, deterministic functions over already-shaped inputs — NO database calls
 * and NO network access. Handlers in tool-handlers.ts are responsible for
 * fetching rows and shaping them into these input types.
 *
 * Strength analytics (Task 1):
 *   - Volume trend over N weeks
 *   - Per-muscle-group weekly volume + balance
 *   - Estimated-1RM / PR history (Brzycki), ported from src/services/pr-detection.ts
 *   - Training consistency / adherence (completed vs planned frequency)
 *
 * Cardio analytics (Task 2): see the "CARDIO ANALYTICS" section below.
 *
 * Muscle groups follow the 9-group model used by progression-engine.ts.
 */

// ─── Shared types ─────────────────────────────────────────────────────────────

export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves';

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves',
];

export type TrendDirection = 'increasing' | 'decreasing' | 'stable';

/** A single logged set flattened for analytics. */
export interface AnalyticsSet {
  weight: number;
  reps: number;
  rpe?: number | null;
  /** ISO timestamp the set was logged / the session completed. */
  logged_at: string;
  /** Primary muscle group for the set's exercise (already resolved). */
  muscle_group?: MuscleGroup | null;
  exercise_name?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Volume for a single set = reps × weight. */
export function setVolume(set: { reps: number; weight: number }): number {
  return (set.reps || 0) * (set.weight || 0);
}

/** ISO week bucket key (YYYY-Www) for grouping by week, UTC-based. */
export function isoWeekKey(iso: string): string {
  const d = new Date(iso);
  // Copy and normalize to Thursday of the current week (ISO 8601).
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7; // Sun=0 → 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Classify a numeric trend as increasing / decreasing / stable using the
 * relative slope between the first and last window. `threshold` is the minimum
 * fractional change (default 5%) required to be considered non-stable.
 */
export function classifyTrend(
  first: number,
  last: number,
  threshold = 0.05
): TrendDirection {
  if (first <= 0) {
    if (last <= 0) return 'stable';
    return 'increasing';
  }
  const change = (last - first) / first;
  if (change > threshold) return 'increasing';
  if (change < -threshold) return 'decreasing';
  return 'stable';
}

/** Round to nearest 0.5. */
export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

// ─── Volume trend over N weeks ──────────────────────────────────────────────────

export interface WeeklyVolumePoint {
  week: string;        // ISO week key
  volume: number;      // total reps*weight for the week
  sets: number;        // total sets logged that week
}

export interface VolumeTrend {
  weekly: WeeklyVolumePoint[];
  total_volume: number;
  avg_weekly_volume: number;
  trend: TrendDirection;
}

/**
 * Bucket sets into ISO weeks and compute the volume trend.
 * Weeks are returned oldest-first. Trend compares the first vs last week.
 */
export function computeVolumeTrend(sets: AnalyticsSet[]): VolumeTrend {
  const byWeek = new Map<string, { volume: number; sets: number }>();

  for (const s of sets) {
    const key = isoWeekKey(s.logged_at);
    const entry = byWeek.get(key) ?? { volume: 0, sets: 0 };
    entry.volume += setVolume(s);
    entry.sets += 1;
    byWeek.set(key, entry);
  }

  const weekly: WeeklyVolumePoint[] = Array.from(byWeek.entries())
    .map(([week, v]) => ({ week, volume: v.volume, sets: v.sets }))
    .sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0));

  const total_volume = weekly.reduce((sum, w) => sum + w.volume, 0);
  const avg_weekly_volume = weekly.length > 0 ? total_volume / weekly.length : 0;

  let trend: TrendDirection = 'stable';
  if (weekly.length >= 2) {
    trend = classifyTrend(weekly[0].volume, weekly[weekly.length - 1].volume);
  }

  return {
    weekly,
    total_volume,
    avg_weekly_volume: +avg_weekly_volume.toFixed(1),
    trend,
  };
}

// ─── Per-muscle-group weekly volume + balance ────────────────────────────────────

export interface MuscleGroupVolume {
  muscle_group: MuscleGroup;
  volume: number;
  sets: number;
  /** Sets per week averaged over the number of weeks covered. */
  weekly_sets: number;
  /** Share of total volume (0–1). */
  share: number;
}

export interface MuscleBalance {
  groups: MuscleGroupVolume[];
  total_volume: number;
  weeks_covered: number;
  /** Highest-share muscle group, if any. */
  most_trained: MuscleGroup | null;
  /** Lowest-share trained muscle group, if any. */
  least_trained: MuscleGroup | null;
  /** Muscle groups (from the 9-group model) with zero logged volume. */
  untrained: MuscleGroup[];
  /** Ratio of most-trained share to least-trained share (>=1); Infinity if a group is untrained but others aren't. */
  imbalance_ratio: number;
}

/**
 * Compute per-muscle-group volume and a balance summary over the provided sets.
 * Sets without a resolved muscle_group are ignored for grouping but still count
 * toward total volume attribution only if a group is present.
 */
export function computeMuscleBalance(sets: AnalyticsSet[]): MuscleBalance {
  const byGroup = new Map<MuscleGroup, { volume: number; sets: number }>();
  const weeks = new Set<string>();
  let total_volume = 0;

  for (const s of sets) {
    weeks.add(isoWeekKey(s.logged_at));
    if (!s.muscle_group) continue;
    const g = s.muscle_group;
    const entry = byGroup.get(g) ?? { volume: 0, sets: 0 };
    const v = setVolume(s);
    entry.volume += v;
    entry.sets += 1;
    total_volume += v;
    byGroup.set(g, entry);
  }

  const weeks_covered = Math.max(1, weeks.size);

  const groups: MuscleGroupVolume[] = Array.from(byGroup.entries())
    .map(([muscle_group, v]) => ({
      muscle_group,
      volume: v.volume,
      sets: v.sets,
      weekly_sets: +(v.sets / weeks_covered).toFixed(2),
      share: total_volume > 0 ? +(v.volume / total_volume).toFixed(4) : 0,
    }))
    .sort((a, b) => b.volume - a.volume);

  const trained = new Set(groups.map((g) => g.muscle_group));
  const untrained = MUSCLE_GROUPS.filter((m) => !trained.has(m));

  const most_trained = groups.length > 0 ? groups[0].muscle_group : null;
  const least_trained = groups.length > 0 ? groups[groups.length - 1].muscle_group : null;

  let imbalance_ratio = 1;
  if (groups.length > 0) {
    const maxShare = groups[0].share;
    const minShare = groups[groups.length - 1].share;
    imbalance_ratio = minShare > 0 ? +(maxShare / minShare).toFixed(2) : Infinity;
  }

  return {
    groups,
    total_volume,
    weeks_covered,
    most_trained,
    least_trained,
    untrained,
    imbalance_ratio,
  };
}

// ─── Estimated 1RM / PR history (ported from src/services/pr-detection.ts) ────────

export type PRType = 'weight' | 'reps_at_weight' | 'estimated_1rm';

/**
 * Brzycki estimated 1RM: weight × (36 / (37 - reps)). Valid for reps 1–36.
 * Returns 0 for invalid inputs.
 */
export function calculateEstimated1RM(weight: number, reps: number): number {
  if (reps < 1 || reps > 36 || weight <= 0) {
    return 0;
  }
  return weight * (36 / (37 - reps));
}

export interface PRRecord {
  exercise_name: string;
  pr_type: PRType;
  value: number;
  achieved_at: string;
  weight: number;
  reps: number;
}

export interface ExercisePRHistory {
  exercise_name: string;
  best_weight: number;
  best_estimated_1rm: number;
  /** Chronologically ordered PR events (oldest-first). */
  records: PRRecord[];
}

/**
 * Walk an exercise's sets in chronological order (oldest-first) and emit a PR
 * record each time a new all-time best is set. Priority within a single set,
 * matching pr-detection.ts: weight > estimated_1rm > reps_at_weight.
 *
 * `sets` MUST be ordered oldest-first by the caller.
 */
export function computeExercisePRHistory(
  exercise_name: string,
  sets: AnalyticsSet[]
): ExercisePRHistory {
  const records: PRRecord[] = [];
  let bestWeight = 0;
  let best1RM = 0;
  const bestRepsAtWeight = new Map<number, number>();

  for (const set of sets) {
    if (set.reps < 1 || set.weight <= 0) continue;

    const est = calculateEstimated1RM(set.weight, set.reps);
    const isWeightPR = set.weight > bestWeight;
    const is1RMPR = est > 0 && est > best1RM;
    const prevRepsAtWeight = bestRepsAtWeight.get(set.weight) ?? 0;
    const isRepsPR = prevRepsAtWeight > 0 && set.reps > prevRepsAtWeight;
    const firstAtWeight = prevRepsAtWeight === 0;

    // Update running bests before emitting so subsequent sets compare correctly.
    if (isWeightPR) bestWeight = set.weight;
    if (is1RMPR) best1RM = est;
    if (set.reps > prevRepsAtWeight) bestRepsAtWeight.set(set.weight, set.reps);

    // Priority: weight > estimated_1rm > reps_at_weight (only emit one per set).
    if (isWeightPR) {
      records.push({
        exercise_name,
        pr_type: 'weight',
        value: set.weight,
        achieved_at: set.logged_at,
        weight: set.weight,
        reps: set.reps,
      });
    } else if (is1RMPR) {
      records.push({
        exercise_name,
        pr_type: 'estimated_1rm',
        value: +est.toFixed(2),
        achieved_at: set.logged_at,
        weight: set.weight,
        reps: set.reps,
      });
    } else if (isRepsPR && !firstAtWeight) {
      records.push({
        exercise_name,
        pr_type: 'reps_at_weight',
        value: set.reps,
        achieved_at: set.logged_at,
        weight: set.weight,
        reps: set.reps,
      });
    }
  }

  return {
    exercise_name,
    best_weight: bestWeight,
    best_estimated_1rm: +best1RM.toFixed(2),
    records,
  };
}

// ─── Training consistency / adherence ─────────────────────────────────────────────

export interface AdherenceInput {
  /** ISO timestamps of completed sessions within the window. */
  completed_session_dates: string[];
  /** Planned sessions per week (from program or profile). */
  planned_per_week: number;
  /** Number of weeks in the analysis window (>=1). */
  weeks: number;
}

export interface Adherence {
  completed_sessions: number;
  planned_sessions: number;
  adherence_rate: number;     // 0–1, capped at 1
  avg_sessions_per_week: number;
  weeks: number;
  /** Longest run of consecutive weeks with >=1 completed session. */
  current_week_streak: number;
}

/**
 * Compute adherence over the window. adherence_rate is completed/planned capped
 * at 1. Handles no-history and single-session edge cases gracefully.
 */
export function computeAdherence(input: AdherenceInput): Adherence {
  const weeks = Math.max(1, input.weeks);
  const planned = Math.max(0, input.planned_per_week) * weeks;
  const completed = input.completed_session_dates.length;

  const adherence_rate = planned > 0 ? Math.min(1, completed / planned) : 0;
  const avg_sessions_per_week = +(completed / weeks).toFixed(2);

  // Week streak: count distinct trained weeks and find the longest consecutive run.
  const trainedWeeks = new Set(input.completed_session_dates.map(isoWeekKey));
  const sortedWeeks = Array.from(trainedWeeks).sort();
  let streak = 0;
  let best = 0;
  let prevWeekIndex: number | null = null;
  for (const wk of sortedWeeks) {
    const idx = weekOrdinal(wk);
    if (prevWeekIndex !== null && idx === prevWeekIndex + 1) {
      streak += 1;
    } else {
      streak = 1;
    }
    best = Math.max(best, streak);
    prevWeekIndex = idx;
  }

  return {
    completed_sessions: completed,
    planned_sessions: planned,
    adherence_rate: +adherence_rate.toFixed(3),
    avg_sessions_per_week,
    weeks,
    current_week_streak: best,
  };
}

/** Convert an ISO week key (YYYY-Www) to a monotonic ordinal for adjacency checks. */
function weekOrdinal(weekKey: string): number {
  const [yearStr, weekStr] = weekKey.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);
  return year * 53 + week;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CARDIO ANALYTICS (Task 2)
// ═══════════════════════════════════════════════════════════════════════════════

export type CardioActivityType = 'running' | 'cycling' | 'walking' | 'other';

/**
 * A single cardio effort flattened for analytics. Sourced from GPS `routes` or
 * `imported_workouts` (handlers convert their columns into this shape).
 */
export interface CardioEffort {
  activity_type: CardioActivityType;
  distance_meters: number;
  duration_seconds: number;
  /** Pace in seconds per km. If absent, derived from distance/duration when possible. */
  avg_pace_seconds_per_km?: number | null;
  avg_speed_kmh?: number | null;
  elevation_gain_meters?: number | null;
  /** ISO timestamp of the effort. */
  date: string;
}

/** Derive pace (s/km) from distance + duration; null when distance is 0. */
export function derivePace(distanceMeters: number, durationSeconds: number): number | null {
  if (distanceMeters <= 0 || durationSeconds <= 0) return null;
  const km = distanceMeters / 1000;
  return +(durationSeconds / km).toFixed(1);
}

/**
 * Normalize pace for elevation. Climbing costs roughly ~6 s/km per 10m of gain
 * per km (a common rule-of-thumb approximation). Returns an "equivalent flat"
 * pace that is faster (lower) than raw pace on hilly efforts, enabling fair
 * comparison across routes.
 *
 * flatPace = rawPace - adjustment, where
 * adjustment = (elevation_gain_m / km) * SECONDS_PER_10M_PER_KM / 10
 */
export const ELEV_SECONDS_PER_10M_PER_KM = 6;

export function elevationAdjustedPace(effort: CardioEffort): number | null {
  const rawPace =
    effort.avg_pace_seconds_per_km ??
    derivePace(effort.distance_meters, effort.duration_seconds);
  if (rawPace === null) return null;

  const km = effort.distance_meters / 1000;
  const gain = effort.elevation_gain_meters ?? 0;
  if (km <= 0 || gain <= 0) return +rawPace.toFixed(1);

  const gainPerKm = gain / km;
  const adjustment = (gainPerKm / 10) * ELEV_SECONDS_PER_10M_PER_KM;
  // Lower pace = faster; subtracting the hill penalty gives the flat-equivalent.
  return +Math.max(0, rawPace - adjustment).toFixed(1);
}

// ─── Pace / speed trend over time ────────────────────────────────────────────────

export interface CardioTrendPoint {
  week: string;
  avg_pace_seconds_per_km: number | null;
  avg_elevation_adjusted_pace: number | null;
  avg_speed_kmh: number | null;
  distance_meters: number;
  efforts: number;
}

export interface CardioTrend {
  activity_type: CardioActivityType;
  weekly: CardioTrendPoint[];
  /**
   * Pace trend semantics: "increasing" means getting FASTER (pace decreasing),
   * "decreasing" means getting SLOWER. This flips raw pace direction so the
   * label reads as fitness progress.
   */
  pace_trend: TrendDirection;
  best_pace_seconds_per_km: number | null;
}

/**
 * Compute a weekly pace/speed trend for a single activity type. Efforts of other
 * activity types should be filtered out by the caller (or pass mixed and this
 * groups by the provided type via `activityType`). Weeks oldest-first.
 */
export function computeCardioTrend(
  activityType: CardioActivityType,
  efforts: CardioEffort[]
): CardioTrend {
  const relevant = efforts.filter((e) => e.activity_type === activityType);

  const byWeek = new Map<string, {
    paceSum: number; paceN: number;
    adjSum: number; adjN: number;
    speedSum: number; speedN: number;
    distance: number; efforts: number;
  }>();

  let bestPace: number | null = null;

  for (const e of relevant) {
    const key = isoWeekKey(e.date);
    const entry = byWeek.get(key) ?? {
      paceSum: 0, paceN: 0, adjSum: 0, adjN: 0,
      speedSum: 0, speedN: 0, distance: 0, efforts: 0,
    };

    const pace = e.avg_pace_seconds_per_km ?? derivePace(e.distance_meters, e.duration_seconds);
    if (pace !== null) {
      entry.paceSum += pace;
      entry.paceN += 1;
      if (bestPace === null || pace < bestPace) bestPace = pace;
    }

    const adj = elevationAdjustedPace(e);
    if (adj !== null) {
      entry.adjSum += adj;
      entry.adjN += 1;
    }

    if (e.avg_speed_kmh != null) {
      entry.speedSum += e.avg_speed_kmh;
      entry.speedN += 1;
    }

    entry.distance += e.distance_meters;
    entry.efforts += 1;
    byWeek.set(key, entry);
  }

  const weekly: CardioTrendPoint[] = Array.from(byWeek.entries())
    .map(([week, v]) => ({
      week,
      avg_pace_seconds_per_km: v.paceN > 0 ? +(v.paceSum / v.paceN).toFixed(1) : null,
      avg_elevation_adjusted_pace: v.adjN > 0 ? +(v.adjSum / v.adjN).toFixed(1) : null,
      avg_speed_kmh: v.speedN > 0 ? +(v.speedSum / v.speedN).toFixed(2) : null,
      distance_meters: v.distance,
      efforts: v.efforts,
    }))
    .sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0));

  // Pace trend: prefer elevation-adjusted pace when available for both endpoints.
  let pace_trend: TrendDirection = 'stable';
  const paced = weekly.filter((w) => w.avg_pace_seconds_per_km !== null);
  if (paced.length >= 2) {
    const firstAdj = paced[0].avg_elevation_adjusted_pace;
    const lastAdj = paced[paced.length - 1].avg_elevation_adjusted_pace;
    const first = firstAdj ?? paced[0].avg_pace_seconds_per_km!;
    const last = lastAdj ?? paced[paced.length - 1].avg_pace_seconds_per_km!;
    // Raw pace down = faster = "increasing" fitness → flip the direction.
    const rawDirection = classifyTrend(first, last);
    pace_trend =
      rawDirection === 'increasing' ? 'decreasing'
        : rawDirection === 'decreasing' ? 'increasing'
          : 'stable';
  }

  return {
    activity_type: activityType,
    weekly,
    pace_trend,
    best_pace_seconds_per_km: bestPace,
  };
}

// ─── Per-distance-bucket pace ─────────────────────────────────────────────────────

export interface DistanceBucketStat {
  bucket: string;             // e.g. "0-5km"
  efforts: number;
  avg_pace_seconds_per_km: number | null;
  best_pace_seconds_per_km: number | null;
}

/** Default distance buckets in km, upper-exclusive; last bucket is open-ended. */
export const DISTANCE_BUCKETS_KM: number[] = [5, 10, 21.1];

/** Assign a distance (meters) to a bucket label based on DISTANCE_BUCKETS_KM. */
export function distanceBucketLabel(distanceMeters: number, buckets = DISTANCE_BUCKETS_KM): string {
  const km = distanceMeters / 1000;
  let lower = 0;
  for (const upper of buckets) {
    if (km < upper) return `${trimNum(lower)}-${trimNum(upper)}km`;
    lower = upper;
  }
  return `${trimNum(lower)}km+`;
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Group efforts into distance buckets and compute avg/best pace per bucket. */
export function computeDistanceBuckets(
  efforts: CardioEffort[],
  buckets = DISTANCE_BUCKETS_KM
): DistanceBucketStat[] {
  const map = new Map<string, { paceSum: number; paceN: number; best: number | null; efforts: number }>();

  for (const e of efforts) {
    const label = distanceBucketLabel(e.distance_meters, buckets);
    const entry = map.get(label) ?? { paceSum: 0, paceN: 0, best: null, efforts: 0 };
    const pace = e.avg_pace_seconds_per_km ?? derivePace(e.distance_meters, e.duration_seconds);
    if (pace !== null) {
      entry.paceSum += pace;
      entry.paceN += 1;
      if (entry.best === null || pace < entry.best) entry.best = pace;
    }
    entry.efforts += 1;
    map.set(label, entry);
  }

  return Array.from(map.entries())
    .map(([bucket, v]) => ({
      bucket,
      efforts: v.efforts,
      avg_pace_seconds_per_km: v.paceN > 0 ? +(v.paceSum / v.paceN).toFixed(1) : null,
      best_pace_seconds_per_km: v.best,
    }))
    .sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
}

// ─── Weekly cardio load ─────────────────────────────────────────────────────────

export interface WeeklyCardioLoadPoint {
  week: string;
  distance_meters: number;
  duration_seconds: number;
  efforts: number;
}

export interface CardioLoad {
  weekly: WeeklyCardioLoadPoint[];
  total_distance_meters: number;
  total_duration_seconds: number;
  avg_weekly_distance_meters: number;
  distance_trend: TrendDirection;
}

/** Aggregate weekly cardio load (distance + duration) across all activity types. */
export function computeCardioLoad(efforts: CardioEffort[]): CardioLoad {
  const byWeek = new Map<string, { distance: number; duration: number; efforts: number }>();

  for (const e of efforts) {
    const key = isoWeekKey(e.date);
    const entry = byWeek.get(key) ?? { distance: 0, duration: 0, efforts: 0 };
    entry.distance += e.distance_meters;
    entry.duration += e.duration_seconds;
    entry.efforts += 1;
    byWeek.set(key, entry);
  }

  const weekly: WeeklyCardioLoadPoint[] = Array.from(byWeek.entries())
    .map(([week, v]) => ({
      week,
      distance_meters: v.distance,
      duration_seconds: v.duration,
      efforts: v.efforts,
    }))
    .sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0));

  const total_distance_meters = weekly.reduce((s, w) => s + w.distance_meters, 0);
  const total_duration_seconds = weekly.reduce((s, w) => s + w.duration_seconds, 0);
  const avg_weekly_distance_meters = weekly.length > 0 ? total_distance_meters / weekly.length : 0;

  let distance_trend: TrendDirection = 'stable';
  if (weekly.length >= 2) {
    distance_trend = classifyTrend(weekly[0].distance_meters, weekly[weekly.length - 1].distance_meters);
  }

  return {
    weekly,
    total_distance_meters,
    total_duration_seconds,
    avg_weekly_distance_meters: +avg_weekly_distance_meters.toFixed(1),
    distance_trend,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRAM CRITIQUE (Task 8)
//
// Pure, deterministic critique of a training program against the user's profile
// and recent analytics. Produces structured findings + concrete proposed changes
// that the agent surfaces for approval (mutations still go through program_modify).
// ═══════════════════════════════════════════════════════════════════════════════

export type CritiqueSeverity = 'info' | 'suggestion' | 'warning';

export interface CritiqueFinding {
  area: 'muscle_balance' | 'frequency' | 'volume_vs_recovery' | 'progression' | 'equipment' | 'goal_alignment';
  severity: CritiqueSeverity;
  message: string;
  /** Optional concrete change the agent can propose via program_modify. */
  proposed_change?: string;
}

export interface ProgramCritiqueInput {
  /** Program day count (training days per week/cycle). */
  training_days: number;
  /** Per-exercise program targets with resolved muscle group. */
  targets: {
    exercise_name: string;
    muscle_group: MuscleGroup | null;
    target_sets: number;
    equipment?: string | null; // equipment the exercise requires, if known
  }[];
  profile: {
    goal?: string | null;
    experience_level?: string | null;
    weekly_frequency?: number | null;
    equipment?: string[] | null;
  } | null;
  /** From computeMuscleBalance over recent logged history (optional). */
  muscle_balance?: MuscleBalance | null;
  recovery_compromised?: boolean;
}

/** Recommended weekly set ranges per goal (per muscle group, rough guidance). */
const GOAL_WEEKLY_SETS: Record<string, { min: number; max: number }> = {
  hypertrophy: { min: 10, max: 20 },
  strength: { min: 6, max: 15 },
  endurance: { min: 6, max: 16 },
  general_fitness: { min: 6, max: 16 },
  weight_loss: { min: 8, max: 18 },
  athletic_performance: { min: 8, max: 18 },
};

/**
 * Critique a program. Deterministic: same input → same findings.
 */
export function critiqueProgram(input: ProgramCritiqueInput): CritiqueFinding[] {
  const findings: CritiqueFinding[] = [];
  const goal = input.profile?.goal ?? null;

  // 1) Weekly set volume per muscle group from program targets.
  const setsByMuscle = new Map<MuscleGroup, number>();
  for (const t of input.targets) {
    if (!t.muscle_group) continue;
    setsByMuscle.set(t.muscle_group, (setsByMuscle.get(t.muscle_group) ?? 0) + t.target_sets);
  }

  // 2) Muscle balance: untrained major groups + volume ceilings.
  const trainedGroups = new Set(setsByMuscle.keys());
  const majorGroups: MuscleGroup[] = ['chest', 'back', 'quads', 'hamstrings', 'shoulders'];
  const missingMajors = majorGroups.filter((m) => !trainedGroups.has(m));
  if (missingMajors.length > 0) {
    findings.push({
      area: 'muscle_balance',
      severity: 'warning',
      message: `No direct work for: ${missingMajors.join(', ')}.`,
      proposed_change: `Add at least one exercise targeting ${missingMajors.join(', ')}.`,
    });
  }

  // 3) Volume vs goal ranges.
  const range = goal ? GOAL_WEEKLY_SETS[goal] : null;
  if (range) {
    for (const [muscle, sets] of setsByMuscle.entries()) {
      if (sets > range.max) {
        findings.push({
          area: 'volume_vs_recovery',
          severity: 'warning',
          message: `${muscle} weekly sets (${sets}) exceed the ${goal} guideline (${range.max}).`,
          proposed_change: `Reduce ${muscle} volume toward ${range.max} sets/week.`,
        });
      } else if (sets < range.min) {
        findings.push({
          area: 'volume_vs_recovery',
          severity: 'suggestion',
          message: `${muscle} weekly sets (${sets}) are below the ${goal} guideline (${range.min}).`,
          proposed_change: `Add sets to bring ${muscle} toward ${range.min}/week.`,
        });
      }
    }
  }

  // 4) Frequency vs profile target.
  if (input.profile?.weekly_frequency != null && input.profile.weekly_frequency > 0) {
    const planned = input.profile.weekly_frequency;
    if (input.training_days < planned) {
      findings.push({
        area: 'frequency',
        severity: 'suggestion',
        message: `Program has ${input.training_days} training days but the profile targets ${planned}/week.`,
        proposed_change: `Add ${planned - input.training_days} training day(s) to match the target frequency.`,
      });
    } else if (input.training_days > planned) {
      findings.push({
        area: 'frequency',
        severity: 'info',
        message: `Program has ${input.training_days} training days, more than the ${planned}/week target.`,
      });
    }
  }

  // 5) Equipment mismatches.
  const available = new Set((input.profile?.equipment ?? []).map((e) => e.toLowerCase()));
  if (available.size > 0) {
    for (const t of input.targets) {
      const needed = t.equipment?.toLowerCase();
      if (needed && needed !== 'bodyweight' && !available.has(needed)) {
        findings.push({
          area: 'equipment',
          severity: 'warning',
          message: `${t.exercise_name} requires ${needed}, which is not in the user's available equipment.`,
          proposed_change: `Swap ${t.exercise_name} for an equivalent using available equipment.`,
        });
      }
    }
  }

  // 6) Progression signal from recent history (imbalance).
  if (input.muscle_balance && input.muscle_balance.imbalance_ratio !== Infinity && input.muscle_balance.imbalance_ratio > 3) {
    findings.push({
      area: 'muscle_balance',
      severity: 'suggestion',
      message: `Recent training is imbalanced (ratio ${input.muscle_balance.imbalance_ratio}× between most and least trained).`,
      proposed_change: `Rebalance volume toward ${input.muscle_balance.least_trained ?? 'undertrained groups'}.`,
    });
  }

  // 7) Recovery-aware note.
  if (input.recovery_compromised) {
    findings.push({
      area: 'volume_vs_recovery',
      severity: 'warning',
      message: 'Recent recovery is compromised (low sleep or depressed HRV).',
      proposed_change: 'Hold or reduce volume this week; prioritize a deload or rest day.',
    });
  }

  // 8) Goal alignment sanity.
  if (goal && !GOAL_WEEKLY_SETS[goal]) {
    findings.push({
      area: 'goal_alignment',
      severity: 'info',
      message: `Goal "${goal}" has no specific volume guideline; using general defaults.`,
    });
  }

  if (findings.length === 0) {
    findings.push({
      area: 'goal_alignment',
      severity: 'info',
      message: 'Program looks well-aligned with the profile and recent training. No changes needed.',
    });
  }

  return findings;
}
