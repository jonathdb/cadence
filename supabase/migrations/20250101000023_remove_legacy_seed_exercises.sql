-- ============================================================================
-- Remove legacy seed exercises now superseded by the free-exercise-db import.
--
-- Prior to the free-exercise-db import (see 20250101000019/20/21/22), a small
-- set of exercises (source IS NULL) were manually seeded. The import now
-- provides a much larger, better-described catalog (source = 'free-exercise-db'),
-- so we want exactly one canonical row per exercise going forward.
--
-- Any program_day_items still pointing at a legacy row are remapped to the
-- closest equivalent imported exercise (by name) before the legacy rows are
-- deleted, so existing programs don't lose their exercise reference. No
-- logged_sets or personal_records reference legacy exercises as of this
-- writing, so no remap is needed for those tables.
-- ============================================================================

-- --- Remap program_day_items from legacy -> imported equivalents ---------

UPDATE program_day_items pdi
SET exercise_id = imp.id
FROM exercises legacy
JOIN exercises imp
  ON imp.source = 'free-exercise-db'
  AND imp.name = CASE legacy.name
    WHEN 'Push-ups' THEN 'Pushups'
    WHEN 'Dumbbell Curl' THEN 'Dumbbell Bicep Curl'
    WHEN 'Squat' THEN 'Bodyweight Squat'
    WHEN 'Bulgarian Split Squat' THEN 'Split Squat with Dumbbells'
    WHEN 'Glute Bridge' THEN 'Barbell Glute Bridge'
    WHEN 'Ab Wheel Rollout' THEN 'Ab Roller'
    WHEN 'Running' THEN 'Running, Treadmill'
  END
WHERE pdi.exercise_id = legacy.id
  AND legacy.source IS NULL;

-- --- Remove remaining legacy exercises -------------------------------------
-- exercise_media rows for these are removed via ON DELETE CASCADE.

DELETE FROM exercises WHERE source IS NULL;
