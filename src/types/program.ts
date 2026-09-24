/**
 * Program-related types for Cadence fitness app.
 * A Program is a structured training plan consisting of ordered ProgramDays.
 */

export interface Program {
  id: string;
  user_id: string;
  name: string;
  status: ProgramStatus;
  /**
   * Declutters the archived list without destroying the program (Req 3).
   * Defaults to false; hidden programs are excluded from `listPrograms`
   * unless `includeHidden` is passed.
   */
  hidden: boolean;
  program_days: ProgramDay[];
  modification_history: ModificationEntry[];
  created_at: string;
  updated_at: string;
}

export type ProgramStatus = 'draft' | 'active' | 'archived';

export interface ProgramDay {
  id: string;
  program_id: string;
  day_number: number;
  name: string;
  items: ProgramDayItem[];
}

export interface ProgramDayItem {
  id: string;
  type: 'exercise' | 'block';
  order: number;
  exercise_id?: string;
  block?: Block;
  target_sets: number;
  target_reps: string; // e.g. "8-12" or "5"
  target_weight?: number;
  target_rpe?: number;
  timer_config?: TimerConfig;
  notes?: string;
}

export interface Block {
  id: string;
  name: string;
  type: BlockType;
  exercises: ProgramDayItem[];
  timer_config?: TimerConfig;
}

export type BlockType = 'circuit' | 'superset' | 'amrap' | 'custom';

export interface TimerConfig {
  type: TimerType;
  work_seconds?: number;
  rest_seconds?: number;
  rounds?: number;
  duration_seconds?: number;
}

export type TimerType = 'none' | 'rest' | 'countdown' | 'interval' | 'duration';

export interface ModificationEntry {
  id: string;
  program_id: string;
  user_id: string;
  change_type: string;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  source: 'user' | 'agent';
  created_at: string;
}
