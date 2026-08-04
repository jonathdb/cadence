/**
 * Session Auto-Fill Service
 *
 * Provides intelligent auto-fill for set values when starting a session or adding sets.
 *
 * Priority chain for session initiation (pre-fill):
 * 1. Most recent completed session for the same ProgramDay
 * 2. Most recent exercise history across all sessions
 * 3. Program plan targets as final fallback
 *
 * Intra-session auto-fill:
 * - Carries forward the most recent set values within the same exercise
 * - Honors manual overrides by carrying forward the overridden value
 */

import type { ProgramDayItem } from '@/types/program';
import type { LoggedSet, Session } from '@/types/session';

export interface AutoFillSource {
  source: 'previous_session' | 'exercise_history' | 'program_plan';
  reps: number;
  weight: number;
  rpe?: number;
}

export interface IntraSessionFillResult {
  reps: number;
  weight: number;
  rpe?: number;
  source: 'previous_set' | 'auto_fill';
}

/**
 * Parse a target_reps string (e.g. "8-12" or "5") into a single number.
 * For ranges, takes the lower bound. Returns 0 if unparseable.
 */
export function parseTargetReps(targetReps: string): number {
  if (!targetReps || targetReps.trim() === '') {
    return 0;
  }

  const trimmed = targetReps.trim();

  // Handle range format "8-12" — take the lower bound
  if (trimmed.includes('-')) {
    const parts = trimmed.split('-');
    const lower = parseInt(parts[0], 10);
    return isNaN(lower) ? 0 : lower;
  }

  // Handle single number format "5"
  const value = parseInt(trimmed, 10);
  return isNaN(value) ? 0 : value;
}

/**
 * Get auto-fill values for an exercise when starting a session.
 *
 * Priority chain:
 * 1. Most recent completed session for the same ProgramDay — find the exercise's sets, take the last set values
 * 2. Most recent logged set for this exercise across all sessions (broader exercise history)
 * 3. Program plan targets (target_reps parsed to number, target_weight)
 *
 * @param exerciseId - The exercise to get auto-fill values for
 * @param programDayId - The current program day being started
 * @param previousSessions - All previous sessions (should include completed sessions)
 * @param exerciseHistory - All previously logged sets for this exercise across any session
 * @param programItem - The program day item containing plan targets
 * @returns AutoFillSource with the values and their source
 */
export function getAutoFillValues(
  exerciseId: string,
  programDayId: string,
  previousSessions: Session[],
  exerciseHistory: LoggedSet[],
  programItem: ProgramDayItem
): AutoFillSource {
  // Priority 1: Most recent completed session for the same ProgramDay
  const sameDaySessions = previousSessions
    .filter(
      (s) => s.program_day_id === programDayId && s.status === 'completed'
    )
    .sort((a, b) => {
      const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return bTime - aTime;
    });

  if (sameDaySessions.length > 0) {
    const mostRecentSession = sameDaySessions[0];
    const exerciseSets = mostRecentSession.logged_sets
      .filter((set) => set.exercise_id === exerciseId)
      .sort((a, b) => a.set_number - b.set_number);

    if (exerciseSets.length > 0) {
      const lastSet = exerciseSets[exerciseSets.length - 1];
      return {
        source: 'previous_session',
        reps: lastSet.reps,
        weight: lastSet.weight,
        rpe: lastSet.rpe,
      };
    }
  }

  // Priority 2: Most recent logged set for this exercise across all sessions
  if (exerciseHistory.length > 0) {
    const sortedHistory = [...exerciseHistory].sort(
      (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
    );
    const mostRecentSet = sortedHistory[0];
    return {
      source: 'exercise_history',
      reps: mostRecentSet.reps,
      weight: mostRecentSet.weight,
      rpe: mostRecentSet.rpe,
    };
  }

  // Priority 3: Program plan targets
  return {
    source: 'program_plan',
    reps: parseTargetReps(programItem.target_reps),
    weight: programItem.target_weight ?? 0,
    rpe: programItem.target_rpe,
  };
}

/**
 * Get intra-session auto-fill values for the next set of an exercise.
 *
 * Logic:
 * - If no sets have been logged yet for this exercise in the current session,
 *   returns undefined (caller should use getAutoFillValues instead)
 * - If sets exist: carry forward values from the most recent set
 *   - If the most recent set was NOT a manual override, use its values
 *   - If the most recent set WAS a manual override, use the overridden values
 *   - In practice, always uses the last set's values (overrides are already reflected)
 *
 * @param currentSets - The sets already logged for this exercise in the current session, ordered by set_number
 * @returns IntraSessionFillResult with the values and source, or undefined if no sets exist
 */
export function getIntraSessionFill(
  currentSets: Array<{
    reps: number;
    weight: number;
    rpe?: number;
    isManualOverride: boolean;
  }>
): IntraSessionFillResult | undefined {
  if (currentSets.length === 0) {
    return undefined;
  }

  // Find the most recent set that was NOT a manual override
  // If all sets are manual overrides, use the most recent override
  const nonOverrideSets = currentSets.filter((s) => !s.isManualOverride);
  const sourceSet =
    nonOverrideSets.length > 0
      ? nonOverrideSets[nonOverrideSets.length - 1]
      : currentSets[currentSets.length - 1];

  return {
    reps: sourceSet.reps,
    weight: sourceSet.weight,
    rpe: sourceSet.rpe,
    source: 'previous_set',
  };
}
