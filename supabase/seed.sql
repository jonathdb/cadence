-- Seed: Global Exercise Library
-- Idempotent: uses ON CONFLICT DO NOTHING so re-running is safe.
-- All seeded exercises have user_id = NULL and is_global = true.

-- We use a unique constraint on (name) for global exercises to support ON CONFLICT.
-- First, create a partial unique index if it doesn't already exist:
CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_global_name
  ON exercises (name) WHERE is_global = true;

-- ============================================================================
-- CHEST
-- ============================================================================
INSERT INTO exercises (user_id, name, primary_muscle_group, secondary_muscle_groups, instructions, is_global)
VALUES
  (NULL, 'Bench Press', 'chest', ARRAY['triceps', 'shoulders'], 'Lie flat on bench, grip bar slightly wider than shoulder-width, lower to chest and press up.', true),
  (NULL, 'Incline Bench Press', 'chest', ARRAY['shoulders', 'triceps'], 'Set bench to 30-45 degrees, press bar from upper chest to lockout.', true),
  (NULL, 'Dumbbell Flyes', 'chest', ARRAY['shoulders'], 'Lie flat, hold dumbbells above chest with slight elbow bend, lower arms in an arc until stretch is felt, then squeeze back up.', true),
  (NULL, 'Push-ups', 'chest', ARRAY['triceps', 'shoulders', 'core'], 'Hands shoulder-width apart, lower chest to floor keeping body rigid, press back up.', true),
  (NULL, 'Cable Crossover', 'chest', ARRAY['shoulders'], 'Set cables high, step forward, bring handles together in a hugging motion with slight elbow bend.', true)
ON CONFLICT (name) WHERE is_global = true DO NOTHING;

-- ============================================================================
-- BACK
-- ============================================================================
INSERT INTO exercises (user_id, name, primary_muscle_group, secondary_muscle_groups, instructions, is_global)
VALUES
  (NULL, 'Barbell Row', 'back', ARRAY['biceps', 'shoulders'], 'Hinge at hips, pull bar to lower chest while keeping back flat and core braced.', true),
  (NULL, 'Pull-ups', 'back', ARRAY['biceps', 'shoulders'], 'Hang from bar with overhand grip, pull chin above bar by driving elbows down.', true),
  (NULL, 'Lat Pulldown', 'back', ARRAY['biceps'], 'Sit at machine, pull bar to upper chest with wide grip, squeeze lats at bottom.', true),
  (NULL, 'Seated Cable Row', 'back', ARRAY['biceps', 'shoulders'], 'Sit upright, pull handle to lower chest keeping elbows close to body.', true),
  (NULL, 'Deadlift', 'back', ARRAY['glutes', 'hamstrings', 'core'], 'Stand with feet hip-width, hinge to grip bar, drive through floor keeping back neutral until lockout.', true),
  (NULL, 'T-Bar Row', 'back', ARRAY['biceps', 'shoulders'], 'Straddle the bar, hinge forward, row the weight to chest keeping elbows tight.', true)
ON CONFLICT (name) WHERE is_global = true DO NOTHING;

-- ============================================================================
-- SHOULDERS
-- ============================================================================
INSERT INTO exercises (user_id, name, primary_muscle_group, secondary_muscle_groups, instructions, is_global)
VALUES
  (NULL, 'Overhead Press', 'shoulders', ARRAY['triceps', 'core'], 'Stand with bar at shoulder height, press overhead to lockout, keep core tight.', true),
  (NULL, 'Lateral Raise', 'shoulders', ARRAY[]::text[], 'Stand with dumbbells at sides, raise arms out to shoulder height with slight elbow bend.', true),
  (NULL, 'Front Raise', 'shoulders', ARRAY['chest'], 'Hold dumbbells in front of thighs, raise one or both arms to shoulder height.', true),
  (NULL, 'Face Pull', 'shoulders', ARRAY['back'], 'Set cable at face height, pull rope to face with elbows high, externally rotate at end.', true),
  (NULL, 'Arnold Press', 'shoulders', ARRAY['triceps'], 'Start with dumbbells at chin palms facing you, rotate palms forward as you press overhead.', true)
ON CONFLICT (name) WHERE is_global = true DO NOTHING;

-- ============================================================================
-- BICEPS
-- ============================================================================
INSERT INTO exercises (user_id, name, primary_muscle_group, secondary_muscle_groups, instructions, is_global)
VALUES
  (NULL, 'Barbell Curl', 'biceps', ARRAY[]::text[], 'Stand with bar at arms length, curl weight up keeping elbows pinned to sides.', true),
  (NULL, 'Dumbbell Curl', 'biceps', ARRAY[]::text[], 'Curl dumbbells alternating or together, supinate wrist at top of movement.', true),
  (NULL, 'Hammer Curl', 'biceps', ARRAY['forearms'], 'Curl dumbbells with neutral (palms facing) grip, keep elbows stationary.', true),
  (NULL, 'Preacher Curl', 'biceps', ARRAY[]::text[], 'Rest upper arms on preacher pad, curl bar up without lifting elbows off pad.', true)
ON CONFLICT (name) WHERE is_global = true DO NOTHING;

-- ============================================================================
-- TRICEPS
-- ============================================================================
INSERT INTO exercises (user_id, name, primary_muscle_group, secondary_muscle_groups, instructions, is_global)
VALUES
  (NULL, 'Tricep Pushdown', 'triceps', ARRAY[]::text[], 'Stand at cable machine, push bar or rope down until arms are fully extended, keep elbows at sides.', true),
  (NULL, 'Skull Crusher', 'triceps', ARRAY[]::text[], 'Lie on bench, lower bar or dumbbells toward forehead by bending elbows, extend back up.', true),
  (NULL, 'Close-Grip Bench Press', 'triceps', ARRAY['chest', 'shoulders'], 'Grip bar shoulder-width or narrower, lower to chest and press up keeping elbows tucked.', true),
  (NULL, 'Overhead Tricep Extension', 'triceps', ARRAY[]::text[], 'Hold dumbbell or cable overhead, lower behind head by bending elbows, extend back up.', true)
ON CONFLICT (name) WHERE is_global = true DO NOTHING;

-- ============================================================================
-- LEGS / QUADS
-- ============================================================================
INSERT INTO exercises (user_id, name, primary_muscle_group, secondary_muscle_groups, instructions, is_global)
VALUES
  (NULL, 'Squat', 'quads', ARRAY['glutes', 'hamstrings', 'core'], 'Bar on upper back, feet shoulder-width, sit back and down until thighs are parallel, drive up.', true),
  (NULL, 'Front Squat', 'quads', ARRAY['glutes', 'core'], 'Bar racked on front delts, elbows high, squat to depth keeping torso upright.', true),
  (NULL, 'Leg Press', 'quads', ARRAY['glutes', 'hamstrings'], 'Sit in machine, press platform away by extending legs, do not lock knees fully.', true),
  (NULL, 'Leg Extension', 'quads', ARRAY[]::text[], 'Sit at machine, extend legs until straight, squeeze quads at top.', true),
  (NULL, 'Lunges', 'quads', ARRAY['glutes', 'hamstrings'], 'Step forward, lower rear knee toward ground, push back to start. Alternate legs.', true)
ON CONFLICT (name) WHERE is_global = true DO NOTHING;

-- ============================================================================
-- LEGS / HAMSTRINGS
-- ============================================================================
INSERT INTO exercises (user_id, name, primary_muscle_group, secondary_muscle_groups, instructions, is_global)
VALUES
  (NULL, 'Romanian Deadlift', 'hamstrings', ARRAY['glutes', 'back'], 'Hold bar at hips, hinge forward with soft knees until stretch in hamstrings, return to standing.', true),
  (NULL, 'Leg Curl', 'hamstrings', ARRAY[]::text[], 'Lie face down on machine, curl pad toward glutes, squeeze at top.', true),
  (NULL, 'Good Morning', 'hamstrings', ARRAY['back', 'glutes'], 'Bar on upper back, hinge at hips with slight knee bend until torso is near parallel, return upright.', true)
ON CONFLICT (name) WHERE is_global = true DO NOTHING;

-- ============================================================================
-- GLUTES
-- ============================================================================
INSERT INTO exercises (user_id, name, primary_muscle_group, secondary_muscle_groups, instructions, is_global)
VALUES
  (NULL, 'Hip Thrust', 'glutes', ARRAY['hamstrings'], 'Upper back on bench, bar over hips, drive hips up squeezing glutes at top.', true),
  (NULL, 'Bulgarian Split Squat', 'glutes', ARRAY['quads', 'hamstrings'], 'Rear foot elevated on bench, lower front knee until thigh is parallel, drive up through front heel.', true),
  (NULL, 'Glute Bridge', 'glutes', ARRAY['hamstrings'], 'Lie on floor, feet flat, drive hips up squeezing glutes, hold briefly at top.', true)
ON CONFLICT (name) WHERE is_global = true DO NOTHING;

-- ============================================================================
-- CORE
-- ============================================================================
INSERT INTO exercises (user_id, name, primary_muscle_group, secondary_muscle_groups, instructions, is_global)
VALUES
  (NULL, 'Plank', 'core', ARRAY[]::text[], 'Hold push-up position on forearms, keep body rigid from head to heels.', true),
  (NULL, 'Hanging Leg Raise', 'core', ARRAY[]::text[], 'Hang from bar, raise legs to parallel or higher without swinging.', true),
  (NULL, 'Cable Crunch', 'core', ARRAY[]::text[], 'Kneel at cable, hold rope behind head, crunch down bringing elbows toward knees.', true),
  (NULL, 'Ab Wheel Rollout', 'core', ARRAY['shoulders'], 'Kneel with hands on wheel, roll forward extending body, pull back using core.', true)
ON CONFLICT (name) WHERE is_global = true DO NOTHING;

-- ============================================================================
-- CARDIO
-- ============================================================================
INSERT INTO exercises (user_id, name, primary_muscle_group, secondary_muscle_groups, instructions, is_global)
VALUES
  (NULL, 'Running', 'cardio', ARRAY['quads', 'hamstrings', 'glutes'], 'Maintain upright posture, land midfoot, keep cadence steady.', true),
  (NULL, 'Cycling', 'cardio', ARRAY['quads', 'hamstrings'], 'Adjust seat height so leg is nearly extended at bottom of pedal stroke, maintain steady cadence.', true),
  (NULL, 'Rowing', 'cardio', ARRAY['back', 'shoulders', 'quads'], 'Drive with legs first, then lean back and pull handle to lower chest.', true),
  (NULL, 'Jump Rope', 'cardio', ARRAY['calves', 'shoulders'], 'Keep elbows close, rotate wrists to spin rope, land softly on balls of feet.', true)
ON CONFLICT (name) WHERE is_global = true DO NOTHING;
