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

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESSION ENGINE V2 — unified, profile-aware (Task 7)
//
// V2 layers goal-weighting, experience scaling, injury/equipment guardrails, a
// unified recovery override (poor recovery dampens BOTH lifting and cardio), and
// cardio progression on top of the deterministic strength rules above. It remains
// a pure function: the tool handler assembles inputs and passes them in.
// ═══════════════════════════════════════════════════════════════════════════════

export type Goal =
  | 'strength' | 'hypertrophy' | 'endurance' | 'general_fitness'
  | 'weight_loss' | 'athletic_performance';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export interface ProfileForProgression {
  goal?: Goal | null;
  experience_level?: ExperienceLevel | null;
  injuries?: string | null;
  equipment?: string[] | null;
}

/**
 * Unified recovery input, aligned to the get_recovery_summary tool shape.
 * hrv_latest_ms / hrv_baseline_ms come from the `hrv` block; avg_sleep_hours from
 * the `sleep` block.
 */
export interface RecoveryV2 {
  avg_sleep_hours: number | null;
  hrv_latest_ms: number | null;
  hrv_baseline_ms: number | null;
  resting_hr_bpm?: number | null;
}

export type CardioSuggestionType =
  | 'increase_distance' | 'increase_pace' | 'add_intervals'
  | 'reduce_cardio_load' | 'maintain_cardio';

export interface CardioSuggestion {
  activity_type: string;
  suggestion_type: CardioSuggestionType;
  confidence: Confidence;
  reasoning: string;
}

/** Cardio inputs derived from get_cardio_analytics. */
export interface CardioProgressionInput {
  activity_type: string;
  pace_trend: TrendDirection;              // 'increasing' = getting faster
  weekly_distance_trend: TrendDirection;
  avg_weekly_distance_meters: number;
  effort_count: number;
}

export type TrendDirection = 'increasing' | 'decreasing' | 'stable';

export interface ProgressionV2Input {
  exercise_history: ExerciseHistory[];
  recovery: RecoveryV2;
  program_targets: ProgramTarget[];
  profile?: ProfileForProgression | null;
  cardio?: CardioProgressionInput[] | null;
  scope?: Scope;
}

export interface ProgressionV2Result {
  recovery_state: 'compromised' | 'ok';
  goal: Goal | null;
  experience: ExperienceLevel | null;
  strength_suggestions: Suggestion[];
  cardio_suggestions: CardioSuggestion[];
  guardrail_notes: string[];
}

// ─── Recovery: unified override ───────────────────────────────────────────────

/** Convert the V2 recovery shape into the legacy RecoverySummary for reuse. */
function toLegacyRecovery(r: RecoveryV2): RecoverySummary {
  return {
    avg_sleep_hours: r.avg_sleep_hours ?? 8, // neutral default when unknown
    hrv_ms: r.hrv_latest_ms ?? 0,
    hrv_baseline_ms: r.hrv_baseline_ms ?? 0,
    resting_hr_bpm: r.resting_hr_bpm ?? 60,
  };
}

/** Recovery is compromised when sleep < 6h OR HRV is 20%+ below baseline. */
export function isRecoveryCompromised(r: RecoveryV2): boolean {
  return evaluateRecoveryConcern(toLegacyRecovery(r)).triggered;
}

// ─── Experience-scaled increments ─────────────────────────────────────────────

/**
 * Scale the base weight increment by experience. Beginners progress faster
 * (linear), advanced lifters slower.
 */
export function experienceIncrementMultiplier(exp?: ExperienceLevel | null): number {
  switch (exp) {
    case 'beginner': return 1.5;
    case 'advanced': return 0.5;
    case 'intermediate':
    default:
      return 1.0;
  }
}

// ─── Goal weighting ───────────────────────────────────────────────────────────

/**
 * When an exercise is "ready to progress" (base rule = increase_weight), goals
 * bias HOW we progress: strength/athletic favor load; hypertrophy favors adding
 * a set (volume) once load is moderate; endurance/weight_loss favor volume too.
 */
function applyGoalWeighting(
  base: Suggestion,
  ex: ExerciseHistory,
  goal: Goal | null | undefined,
  exp: ExperienceLevel | null | undefined
): Suggestion {
  if (base.suggestion_type !== 'increase_weight') return base;

  const favorsVolume = goal === 'hypertrophy' || goal === 'endurance' || goal === 'weight_loss';
  const favorsLoad = goal === 'strength' || goal === 'athletic_performance';

  if (favorsVolume) {
    // Add a set instead of (or in addition to) load, capped to avoid runaway volume.
    const suggestedSets = base.current_values.sets + 1;
    return {
      ...base,
      suggestion_type: 'increase_weight',
      suggested_values: { weight: base.current_values.weight, sets: suggestedSets },
      reasoning: `${base.reasoning} Goal is ${goal}: adding a set to drive volume rather than load.`,
    };
  }

  if (favorsLoad) {
    // Scale the load increment by experience.
    const increment = getWeightIncrement(ex.muscle_group) * experienceIncrementMultiplier(exp);
    return {
      ...base,
      suggested_values: {
        weight: roundToHalf(base.current_values.weight + increment),
        sets: base.current_values.sets,
      },
      reasoning: `${base.reasoning} Goal is ${goal}: prioritizing load (${exp ?? 'intermediate'} increment).`,
    };
  }

  return base;
}

// ─── Injury / equipment guardrails ────────────────────────────────────────────

/**
 * Detect whether an exercise likely conflicts with a stated injury. Heuristic
 * keyword mapping — the LLM does the nuanced reasoning, this is a safety net that
 * downgrades progression to "maintain" and flags the conflict.
 */
const INJURY_EXERCISE_CONFLICTS: { injury: RegExp; exercises: RegExp }[] = [
  { injury: /shoulder|rotator|impinge/i, exercises: /overhead|ohp|press|snatch|jerk|lateral raise/i },
  { injury: /knee|acl|meniscus|patell/i, exercises: /squat|lunge|leg press|step[- ]?up|pistol/i },
  { injury: /(lower ?back|lumbar|disc|herniat|sciatic)/i, exercises: /deadlift|good ?morning|bent[- ]?over row|barbell row/i },
  { injury: /elbow|tendin|tennis/i, exercises: /curl|extension|chin[- ]?up|pull[- ]?up/i },
  { injury: /wrist/i, exercises: /front squat|clean|push[- ]?up/i },
  { injury: /ankle|achilles/i, exercises: /calf raise|running|jump|box jump/i },
];

export function exerciseConflictsWithInjury(
  exerciseName: string,
  injuries: string | null | undefined
): boolean {
  if (!injuries) return false;
  for (const rule of INJURY_EXERCISE_CONFLICTS) {
    if (rule.injury.test(injuries) && rule.exercises.test(exerciseName)) {
      return true;
    }
  }
  return false;
}

// ─── Cardio progression rules ─────────────────────────────────────────────────

/**
 * Cardio progression: when recovery is compromised, reduce load. Otherwise:
 *  - improving pace + adequate volume → add intervals or push pace
 *  - flat/declining pace with low volume → increase distance
 *  - declining pace with high volume → reduce load (overreaching)
 */
export function evaluateCardioProgression(
  cardio: CardioProgressionInput,
  recoveryCompromised: boolean
): CardioSuggestion {
  const base = { activity_type: cardio.activity_type };

  if (recoveryCompromised) {
    return {
      ...base,
      suggestion_type: 'reduce_cardio_load',
      confidence: 'high',
      reasoning: 'Recovery is compromised — reduce cardio volume/intensity this week.',
    };
  }

  if (cardio.effort_count < 2) {
    return {
      ...base,
      suggestion_type: 'maintain_cardio',
      confidence: 'medium',
      reasoning: 'Not enough recent cardio data to adjust; keep building a base.',
    };
  }

  if (cardio.pace_trend === 'increasing') {
    // Getting faster — introduce intervals or push pace.
    return {
      ...base,
      suggestion_type: 'add_intervals',
      confidence: 'medium',
      reasoning: 'Pace is improving; add an interval session to keep progressing.',
    };
  }

  if (cardio.weekly_distance_trend !== 'increasing') {
    return {
      ...base,
      suggestion_type: 'increase_distance',
      confidence: 'medium',
      reasoning: 'Pace and volume are flat; increase weekly distance ~10% to build aerobic base.',
    };
  }

  if (cardio.pace_trend === 'decreasing' && cardio.weekly_distance_trend === 'increasing') {
    return {
      ...base,
      suggestion_type: 'reduce_cardio_load',
      confidence: 'medium',
      reasoning: 'Pace declining while volume rises — likely overreaching; hold or reduce volume.',
    };
  }

  return {
    ...base,
    suggestion_type: 'maintain_cardio',
    confidence: 'medium',
    reasoning: 'Cardio is on track; maintain current load.',
  };
}

// ─── Main V2 evaluation ────────────────────────────────────────────────────────

/**
 * Unified, profile-aware progression. Deterministic and pure.
 */
export function evaluateProgressionV2(input: ProgressionV2Input): ProgressionV2Result {
  const goal = input.profile?.goal ?? null;
  const experience = input.profile?.experience_level ?? null;
  const injuries = input.profile?.injuries ?? null;

  const recoveryCompromised = isRecoveryCompromised(input.recovery);
  const guardrail_notes: string[] = [];

  // Base strength suggestions from the deterministic engine (reuses recovery rule).
  const baseInput: ProgressionInput = {
    exercise_history: input.exercise_history,
    recovery_summary: toLegacyRecovery(input.recovery),
    program_targets: input.program_targets,
    scope: input.scope ?? 'full_program',
  };
  const baseSuggestions = evaluateProgression(baseInput);

  const strength_suggestions = baseSuggestions.map((s) => {
    const ex = input.exercise_history.find((e) => e.exercise_name === s.exercise_name);

    // Injury guardrail: downgrade progression on conflicting movements.
    if (exerciseConflictsWithInjury(s.exercise_name, injuries)) {
      guardrail_notes.push(
        `Held ${s.exercise_name} at maintenance due to a stated injury conflict; suggest a safer variation.`
      );
      return {
        ...s,
        suggestion_type: 'maintain' as SuggestionType,
        suggested_values: s.current_values,
        confidence: 'high' as Confidence,
        reasoning: `Progression withheld: this movement may aggravate a stated injury. Consider a safer alternative.`,
      };
    }

    // Goal weighting only applies to ready-to-progress exercises.
    if (ex) {
      return applyGoalWeighting(s, ex, goal, experience);
    }
    return s;
  });

  const cardio_suggestions = (input.cardio ?? []).map((c) =>
    evaluateCardioProgression(c, recoveryCompromised)
  );

  return {
    recovery_state: recoveryCompromised ? 'compromised' : 'ok',
    goal,
    experience,
    strength_suggestions,
    cardio_suggestions,
    guardrail_notes,
  };
}
