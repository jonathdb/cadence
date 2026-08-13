/**
 * Progression Engine for Cadence AI Agent.
 *
 * A pure, deterministic function that evaluates exercise history, recovery data,
 * and program targets against heuristic progression rules. Returns structured
 * suggestions for next-session adjustments.
 *
 * Rules (priority order):
 * 1. rest_day — recovery concern (sleep < 6h or HRV 20%+ below baseline)
 * 2. deload — RPE > 9 on majority of sets in most recent session
 * 3. reduce_weight — missed reps for 2+ consecutive sessions
 * 4. reduce_volume — weekly sets per muscle group > 20
 * 5. increase_weight — RPE < 7 on all sets for 2+ consecutive sessions
 * 6. maintain — default when no rules trigger
 *
 * Validates: Requirements 2.1-2.5, 3.1-3.5, 4.1-4.4, 5.1-5.5, 6.1-6.5, 7.1-7.4, 8.1-8.7, 9.1-9.3, 11.1-11.3
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps'   // upper body
  | 'quads' | 'hamstrings' | 'glutes' | 'calves';           // lower body

export type SuggestionType =
  | 'rest_day'
  | 'deload'
  | 'reduce_weight'
  | 'reduce_volume'
  | 'increase_weight'
  | 'maintain';

export type Confidence = 'high' | 'medium';

export type Scope = 'full_program' | 'single_exercise';

export interface SetData {
  weight: number;
  reps: number;
  rpe: number | null;
}

export interface SessionEntry {
  session_date: string;
  sets: SetData[];
}

export interface ExerciseHistory {
  exercise_name: string;
  muscle_group: MuscleGroup;
  sessions: SessionEntry[]; // ordered most-recent-first
}

export interface RecoverySummary {
  avg_sleep_hours: number;
  hrv_ms: number;
  hrv_baseline_ms: number;
  resting_hr_bpm: number;
}

export interface ProgramTarget {
  exercise_name: string;
  target_sets: number;
  target_rep_range: string; // e.g. "8-12"
  target_weight: number;
  target_rpe: number | null;
}

export interface ProgressionInput {
  exercise_history: ExerciseHistory[];
  recovery_summary: RecoverySummary;
  program_targets: ProgramTarget[];
  scope: Scope;
}

export interface ExerciseValues {
  weight: number;
  sets: number;
}

export interface Suggestion {
  exercise_name: string;
  suggestion_type: SuggestionType;
  current_values: ExerciseValues;
  suggested_values: ExerciseValues;
  confidence: Confidence;
  reasoning: string;
}

// ─── Rule Priority ───────────────────────────────────────────────────────────

export const RULE_PRIORITY: SuggestionType[] = [
  'rest_day',
  'deload',
  'reduce_weight',
  'reduce_volume',
  'increase_weight',
  'maintain',
];

// ─── Helper Functions ────────────────────────────────────────────────────────

/** Rounds a number to the nearest 0.5 */
export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/** Parses "8-12" → { lower: 8, upper: 12 }. Falls back to { lower: 0, upper: Infinity } on failure. */
export function parseRepRange(range: string): { lower: number; upper: number } {
  const parts = range.split('-');
  if (parts.length !== 2) {
    return { lower: 0, upper: Infinity };
  }
  const lower = parseInt(parts[0], 10);
  const upper = parseInt(parts[1], 10);
  if (isNaN(lower) || isNaN(upper)) {
    return { lower: 0, upper: Infinity };
  }
  return { lower, upper };
}

/** Classifies a muscle group as upper body */
export function isUpperBody(muscleGroup: MuscleGroup): boolean {
  return ['chest', 'back', 'shoulders', 'biceps', 'triceps'].includes(muscleGroup);
}

/** Determines weight increment: +2.5kg upper body, +5kg lower body */
export function getWeightIncrement(muscleGroup: MuscleGroup): number {
  return isUpperBody(muscleGroup) ? 2.5 : 5.0;
}

// ─── Rule Evaluation Functions ───────────────────────────────────────────────

/**
 * Rule 1: Recovery Concern (rest_day)
 * Triggers when sleep < 6h avg OR HRV 20%+ below baseline.
 */
export function evaluateRecoveryConcern(
  recovery: RecoverySummary
): { triggered: boolean; confidence: Confidence } {
  const sleepBreach = recovery.avg_sleep_hours < 6;

  // Skip HRV check if baseline is 0 (avoid division by zero)
  let hrvBreach = false;
  if (recovery.hrv_baseline_ms > 0) {
    const hrvDrop = (recovery.hrv_baseline_ms - recovery.hrv_ms) / recovery.hrv_baseline_ms;
    hrvBreach = hrvDrop >= 0.20;
  }

  if (!sleepBreach && !hrvBreach) {
    return { triggered: false, confidence: 'medium' };
  }

  return {
    triggered: true,
    confidence: sleepBreach && hrvBreach ? 'high' : 'medium',
  };
}

/**
 * Rule 2: Deload
 * Triggers when >50% of sets with RPE data have RPE > 9 in the most recent session.
 */
export function evaluateDeload(
  latestSession: SessionEntry
): { triggered: boolean } {
  const setsWithRpe = latestSession.sets.filter(s => s.rpe !== null);
  if (setsWithRpe.length === 0) return { triggered: false };

  const highRpeSets = setsWithRpe.filter(s => s.rpe! > 9);
  return { triggered: highRpeSets.length > setsWithRpe.length / 2 };
}

/**
 * Rule 3: Reduce Weight
 * Triggers when average reps < lower bound of target range for 2+ consecutive sessions.
 */
export function evaluateReduceWeight(
  sessions: SessionEntry[],
  targetRepRange: { lower: number; upper: number }
): { triggered: boolean; streak: number } {
  let streak = 0;
  for (const session of sessions) {
    if (session.sets.length === 0) break;
    const avgReps = session.sets.reduce((sum, s) => sum + s.reps, 0) / session.sets.length;
    if (avgReps < targetRepRange.lower) {
      streak++;
    } else {
      break;
    }
  }
  return { triggered: streak >= 2, streak };
}

/**
 * Rule 4: Reduce Volume
 * Calculates total weekly sets per muscle group from program targets.
 * Returns a Map of muscle groups to their weekly set totals.
 */
export function evaluateReduceVolume(
  exerciseHistory: ExerciseHistory[],
  programTargets: ProgramTarget[]
): Map<MuscleGroup, number> {
  const weeklySetsByMuscle = new Map<MuscleGroup, number>();

  for (const target of programTargets) {
    const exercise = exerciseHistory.find(e => e.exercise_name === target.exercise_name);
    if (!exercise) continue;
    const current = weeklySetsByMuscle.get(exercise.muscle_group) ?? 0;
    weeklySetsByMuscle.set(exercise.muscle_group, current + target.target_sets);
  }

  return weeklySetsByMuscle;
}

/**
 * Rule 5: Increase Weight
 * Triggers when all sets with RPE have RPE < 7 for 2+ consecutive sessions.
 */
export function evaluateIncreaseWeight(
  sessions: SessionEntry[]
): { triggered: boolean; streak: number } {
  let streak = 0;
  for (const session of sessions) {
    const setsWithRpe = session.sets.filter(s => s.rpe !== null);
    if (setsWithRpe.length === 0) break; // No RPE data — can't evaluate
    const allBelowSeven = setsWithRpe.every(s => s.rpe! < 7);
    if (allBelowSeven) {
      streak++;
    } else {
      break;
    }
  }
  return { triggered: streak >= 2, streak };
}

// ─── Main Evaluation Function ────────────────────────────────────────────────

/**
 * Evaluate progression rules for the given input and return one suggestion per exercise.
 *
 * This is a pure, deterministic function — same input always produces same output.
 * No database queries or network calls.
 */
export function evaluateProgression(input: ProgressionInput): Suggestion[] {
  const { exercise_history, recovery_summary, program_targets, scope } = input;

  // Handle empty input
  if (exercise_history.length === 0) return [];

  // Determine which exercises to evaluate based on scope
  const exercises = scope === 'single_exercise'
    ? exercise_history.slice(0, 1)
    : exercise_history;

  // ─── Check recovery concern first (global override) ──────────────────────
  const recoveryConcern = evaluateRecoveryConcern(recovery_summary);
  if (recoveryConcern.triggered) {
    return exercises.map(ex => {
      const target = program_targets.find(t => t.exercise_name === ex.exercise_name);
      const currentWeight = target?.target_weight ?? ex.sessions[0]?.sets[0]?.weight ?? 0;
      const currentSets = target?.target_sets ?? ex.sessions[0]?.sets.length ?? 0;
      return {
        exercise_name: ex.exercise_name,
        suggestion_type: 'rest_day' as SuggestionType,
        current_values: { weight: currentWeight, sets: currentSets },
        suggested_values: { weight: currentWeight, sets: currentSets },
        confidence: recoveryConcern.confidence,
        reasoning: 'Recovery data indicates fatigue. Consider a lighter session or rest day.',
      };
    });
  }

  // ─── Calculate volume map for reduce_volume checks ───────────────────────
  const weeklySetsByMuscle = evaluateReduceVolume(exercise_history, program_targets);

  // ─── Evaluate each exercise individually ─────────────────────────────────
  return exercises.map(ex => {
    const target = program_targets.find(t => t.exercise_name === ex.exercise_name);
    const currentWeight = target?.target_weight ?? 0;
    const currentSets = target?.target_sets ?? 0;
    const repRange = parseRepRange(target?.target_rep_range ?? '8-12');

    // Handle exercises with no session data
    if (ex.sessions.length === 0) {
      return {
        exercise_name: ex.exercise_name,
        suggestion_type: 'maintain' as SuggestionType,
        current_values: { weight: currentWeight, sets: currentSets },
        suggested_values: { weight: currentWeight, sets: currentSets },
        confidence: 'high' as Confidence,
        reasoning: 'Insufficient session data. Continue with existing program.',
      };
    }

    // Rule 2: Deload check
    const deload = evaluateDeload(ex.sessions[0]);
    if (deload.triggered) {
      return {
        exercise_name: ex.exercise_name,
        suggestion_type: 'deload' as SuggestionType,
        current_values: { weight: currentWeight, sets: currentSets },
        suggested_values: {
          weight: roundToHalf(currentWeight * 0.9),
          sets: Math.max(1, currentSets - 1),
        },
        confidence: 'high' as Confidence,
        reasoning: 'High exertion detected (RPE > 9 on majority of sets). Deload recommended for one week to facilitate recovery.',
      };
    }

    // Rule 3: Reduce weight check
    const reduceWeight = evaluateReduceWeight(ex.sessions, repRange);
    if (reduceWeight.triggered) {
      return {
        exercise_name: ex.exercise_name,
        suggestion_type: 'reduce_weight' as SuggestionType,
        current_values: { weight: currentWeight, sets: currentSets },
        suggested_values: {
          weight: roundToHalf(currentWeight * 0.95),
          sets: currentSets,
        },
        confidence: reduceWeight.streak >= 3 ? 'high' : 'medium',
        reasoning: `Reps consistently below target range (${target?.target_rep_range ?? '8-12'}) for ${reduceWeight.streak} sessions. Reduce weight to train within effective range.`,
      };
    }

    // Rule 4: Reduce volume check
    const muscleTotal = weeklySetsByMuscle.get(ex.muscle_group) ?? 0;
    if (muscleTotal > 20) {
      const excessSets = muscleTotal - 20;
      const suggestedSets = Math.max(1, currentSets - excessSets);
      return {
        exercise_name: ex.exercise_name,
        suggestion_type: 'reduce_volume' as SuggestionType,
        current_values: { weight: currentWeight, sets: currentSets },
        suggested_values: { weight: currentWeight, sets: suggestedSets },
        confidence: 'medium' as Confidence,
        reasoning: `Weekly volume for ${ex.muscle_group} is ${muscleTotal} sets (exceeds 20-set ceiling). Reducing sets to manage overreach risk.`,
      };
    }

    // Rule 5: Increase weight check
    const increaseWeight = evaluateIncreaseWeight(ex.sessions);
    if (increaseWeight.triggered) {
      const increment = getWeightIncrement(ex.muscle_group);
      return {
        exercise_name: ex.exercise_name,
        suggestion_type: 'increase_weight' as SuggestionType,
        current_values: { weight: currentWeight, sets: currentSets },
        suggested_values: {
          weight: roundToHalf(currentWeight + increment),
          sets: currentSets,
        },
        confidence: increaseWeight.streak >= 3 ? 'high' : 'medium',
        reasoning: `RPE consistently below 7 for ${increaseWeight.streak} sessions. Ready to increase load.`,
      };
    }

    // Rule 6: Maintain (default)
    return {
      exercise_name: ex.exercise_name,
      suggestion_type: 'maintain' as SuggestionType,
      current_values: { weight: currentWeight, sets: currentSets },
      suggested_values: { weight: currentWeight, sets: currentSets },
      confidence: 'high' as Confidence,
      reasoning: 'Current load is appropriate. Continue with existing program.',
    };
  });
}
