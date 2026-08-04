/**
 * Progress tab — progression dashboard.
 * Shows three sections:
 * 1. Activity summary (session count, total volume trend, frequency) — Cadence sessions only
 * 2. Volume by muscle group with selectable time window
 * 3. Per-exercise history (logged sets over time)
 *
 * Requirements: 21.1, 21.2, 21.3
 */


type TimeWindow = '7d' | '30d' | '90d';

interface ActivitySummary {
  sessionCount: number;
  totalVolume: number;
  previousPeriodVolume: number;
  sessionsPerWeek: number;
}

interface ExerciseHistory {
  exerciseId: string;
  exerciseName: string;
  recentSets: { weight: number; reps: number; logged_at: string }[];
}

function getTimeWindowDates(window: TimeWindow): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  switch (window) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
  }
  return { start, end };
}
