-- Migration: exercises.equipment
-- Adds a nullable equipment tag to exercises so the AI coach can (a) filter
-- exercise selection to the user's available equipment and (b) flag equipment
-- mismatches in critique_program. Free-text tag (e.g. 'barbell', 'dumbbells',
-- 'machines', 'bodyweight'); null means unspecified.

ALTER TABLE exercises
  ADD COLUMN equipment text CHECK (equipment IS NULL OR char_length(equipment) <= 64);

-- Index to support future equipment-based filtering of the library.
CREATE INDEX idx_exercises_equipment ON exercises(equipment) WHERE equipment IS NOT NULL;
