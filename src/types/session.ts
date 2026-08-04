/**
 * Session-related types for Cadence fitness app.
 * A Session is a single completed or in-progress workout logged against a ProgramDay.
 */

export interface Session {
  id: string;
  user_id: string;
  program_day_id: string;
  status: SessionStatus;
  started_at: string;
  completed_at?: string;
  total_duration_seconds?: number;
  logged_sets: LoggedSet[];
  block_completions: BlockCompletion[];
  route_id?: string; // Phase 2
}

export type SessionStatus = 'in_progress' | 'completed';

export interface LoggedSet {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  reps: number;
  weight: number;
  rpe?: number;
  notes?: string;
  is_pr: boolean;
  pr_type?: PRType;
  actual_duration_seconds?: number; // individual exercise timer results only
  logged_at: string;
}

export type PRType = 'weight' | 'reps_at_weight' | 'estimated_1rm';

export interface BlockCompletion {
  id: string;
  session_id: string;
  block_id: string;
  actual_duration_seconds: number;
  actual_rounds: number;
  completed_at: string;
}
