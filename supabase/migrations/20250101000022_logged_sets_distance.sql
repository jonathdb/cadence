-- Migration: add distance_meters to logged_sets (cardio logging)
--
-- Cardio exercises (exercises.category = 'cardio', e.g. running) are logged by
-- distance + duration rather than reps + weight. `logged_sets` already has
-- `actual_duration_seconds` (nullable) for the duration; this adds a nullable
-- `distance_meters` so a cardio "set" can record how far was covered. Pace and
-- speed are derived from distance + duration at display time (not stored).
--
-- Strength sets leave `distance_meters` NULL and keep using reps/weight.
-- `reps` stays NOT NULL (cardio sets write 0) and `weight` stays NOT NULL
-- DEFAULT 0, so no change is needed to those columns.

ALTER TABLE logged_sets ADD COLUMN distance_meters numeric;
