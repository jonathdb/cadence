/**
 * Timer Defaults from History Service
 *
 * Determines timer configuration for each exercise/block when starting a session.
 *
 * Priority:
 * 1. Most recent completed session for the same ProgramDay — reconstruct timer values used
 * 2. Program plan timer_config presets from program_day_items/blocks
 *
 * Manual override is handled at the UI layer (not this service).
 *
 * Validates: Requirements 17.1, 17.2, 17.3
 */

import type { Block, ProgramDay, ProgramDayItem, TimerConfig } from '@/types/program';
import type { BlockCompletion, Session } from '@/types/session';

/**
 * Result of timer default resolution for a single item (exercise or block).
 */
export interface TimerDefaultResult {
  /** The item ID (exercise_id or block_id) this timer default is for */
  itemId: string;
  /** Whether this item is a block or an individual exercise */
  itemType: 'exercise' | 'block';
  /** The resolved timer configuration */
  timerConfig: TimerConfig;
  /** Where the timer config was sourced from */
  source: 'previous_session' | 'program_plan';
}

/**
 * Reconstructs a TimerConfig from a BlockCompletion record.
 *
 * Since block_completions store actual_duration_seconds and actual_rounds,
 * we can reconstruct a reasonable timer config from what was actually used.
 * The timer type is inferred from the block's original config type, but
 * with actual values from the completion.
 */
export function reconstructBlockTimerFromCompletion(
  completion: BlockCompletion,
  originalConfig: TimerConfig | undefined
): TimerConfig {
  const type = originalConfig?.type ?? 'duration';

  switch (type) {
    case 'interval':
      // For interval timers, derive work/rest splits from the total duration and rounds
      if (completion.actual_rounds > 0) {
        const totalSecondsPerRound = Math.round(
          completion.actual_duration_seconds / completion.actual_rounds
        );
        const restSeconds = originalConfig?.rest_seconds ?? 0;
        const workSeconds = Math.max(0, totalSecondsPerRound - restSeconds);
        return {
          type: 'interval',
          work_seconds: workSeconds,
          rest_seconds: restSeconds,
          rounds: completion.actual_rounds,
        };
      }
      return originalConfig ?? { type: 'duration', duration_seconds: completion.actual_duration_seconds };

    case 'countdown':
      return {
        type: 'countdown',
        duration_seconds: completion.actual_duration_seconds,
      };

    case 'duration':
      return {
        type: 'duration',
        duration_seconds: completion.actual_duration_seconds,
      };

    case 'rest':
      return {
        type: 'rest',
        rest_seconds: completion.actual_duration_seconds,
      };

    case 'none':
      return { type: 'none' };

    default:
      return originalConfig ?? { type: 'none' };
  }
}

/**
 * Reconstructs a TimerConfig from a LoggedSet's actual_duration_seconds.
 *
 * For individual exercise timers (countdown or duration type),
 * the actual_duration_seconds represents how long the user actually spent.
 */
export function reconstructExerciseTimerFromSet(
  actualDurationSeconds: number,
  originalConfig: TimerConfig | undefined
): TimerConfig {
  const type = originalConfig?.type ?? 'duration';

  switch (type) {
    case 'countdown':
      return {
        type: 'countdown',
        duration_seconds: actualDurationSeconds,
      };

    case 'duration':
      return {
        type: 'duration',
        duration_seconds: actualDurationSeconds,
      };

    case 'rest':
      return {
        type: 'rest',
        rest_seconds: actualDurationSeconds,
      };

    case 'interval':
      // Individual exercise shouldn't normally have interval, fallback to original
      return originalConfig ?? { type: 'duration', duration_seconds: actualDurationSeconds };

    case 'none':
      return { type: 'none' };

    default:
      return originalConfig ?? { type: 'none' };
  }
}

/**
 * Finds the most recent completed session for a given ProgramDay from a list of sessions.
 */
export function findMostRecentCompletedSession(
  programDayId: string,
  sessions: Session[]
): Session | undefined {
  const completedSessions = sessions
    .filter(
      (s) => s.program_day_id === programDayId && s.status === 'completed'
    )
    .sort((a, b) => {
      const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return bTime - aTime;
    });

  return completedSessions[0];
}

/**
 * Gets timer defaults for all items in a ProgramDay.
 *
 * Logic:
 * 1. Query for most recent completed session with the same program_day_id
 * 2. If found: extract block_completions and logged_set actual_duration_seconds
 *    to reconstruct timer settings used
 * 3. If not found: return the timer_config from program_day_items as defaults
 *
 * @param programDay - The ProgramDay being started
 * @param previousSessions - Previous sessions (should include completed ones)
 * @returns Array of TimerDefaultResult for each exercise/block in the ProgramDay
 */
export function getTimerDefaults(
  programDay: ProgramDay,
  previousSessions: Session[]
): TimerDefaultResult[] {
  const results: TimerDefaultResult[] = [];
  const recentSession = findMostRecentCompletedSession(
    programDay.id,
    previousSessions
  );

  for (const item of programDay.items) {
    if (item.type === 'block' && item.block) {
      const blockResult = resolveBlockTimerDefault(
        item.block,
        recentSession
      );
      results.push(blockResult);
    } else if (item.type === 'exercise' && item.exercise_id) {
      const exerciseResult = resolveExerciseTimerDefault(
        item,
        recentSession
      );
      results.push(exerciseResult);
    }
  }

  return results;
}

/**
 * Resolves the timer default for a block.
 */
function resolveBlockTimerDefault(
  block: Block,
  recentSession: Session | undefined
): TimerDefaultResult {
  const planConfig = block.timer_config ?? { type: 'none' as const };

  if (recentSession) {
    const blockCompletion = recentSession.block_completions.find(
      (bc) => bc.block_id === block.id
    );

    if (blockCompletion) {
      return {
        itemId: block.id,
        itemType: 'block',
        timerConfig: reconstructBlockTimerFromCompletion(
          blockCompletion,
          block.timer_config
        ),
        source: 'previous_session',
      };
    }
  }

  // Fallback to program plan
  return {
    itemId: block.id,
    itemType: 'block',
    timerConfig: planConfig,
    source: 'program_plan',
  };
}

/**
 * Resolves the timer default for an individual exercise.
 */
function resolveExerciseTimerDefault(
  item: ProgramDayItem,
  recentSession: Session | undefined
): TimerDefaultResult {
  const planConfig = item.timer_config ?? { type: 'none' as const };

  if (recentSession && item.exercise_id) {
    // Find logged sets for this exercise in the most recent session
    const exerciseSets = recentSession.logged_sets
      .filter((s) => s.exercise_id === item.exercise_id)
      .sort((a, b) => b.set_number - a.set_number);

    // Use the most recent set's actual_duration_seconds if available
    const setWithDuration = exerciseSets.find(
      (s) => s.actual_duration_seconds != null && s.actual_duration_seconds > 0
    );

    if (setWithDuration && setWithDuration.actual_duration_seconds) {
      return {
        itemId: item.exercise_id,
        itemType: 'exercise',
        timerConfig: reconstructExerciseTimerFromSet(
          setWithDuration.actual_duration_seconds,
          item.timer_config
        ),
        source: 'previous_session',
      };
    }
  }

  // Fallback to program plan
  return {
    itemId: item.exercise_id ?? item.id,
    itemType: 'exercise',
    timerConfig: planConfig,
    source: 'program_plan',
  };
}
