/**
 * Exercise type for Cadence fitness app.
 * Exercises can be global (shared library) or user-created (private).
 */

export interface Exercise {
  id: string;
  user_id: string | null; // null for global exercises
  name: string;
  primary_muscle_group: string;
  secondary_muscle_groups: string[];
  instructions: string;
  notes?: string;
  is_global: boolean;
}
