/**
 * Global Exercise Library Seed Data
 *
 * 300+ exercises covering all major muscle groups:
 * chest, back, shoulders, biceps, triceps, quadriceps, hamstrings,
 * glutes, calves, core, forearms, traps
 *
 * Requirements: 10.1, 10.6
 */

export interface SeedExercise {
  name: string;
  primaryMuscleGroup: string;
  secondaryMuscleGroups: string[];
  instructions: string;
}

export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'forearms',
  'traps',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

// ─── Chest Exercises ─────────────────────────────────────────────────────────

const CHEST_EXERCISES: SeedExercise[] = [
  { name: 'Barbell Bench Press', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['triceps', 'shoulders'], instructions: 'Lie on bench, grip bar slightly wider than shoulders, lower to chest, press up.' },
  { name: 'Incline Barbell Bench Press', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['shoulders', 'triceps'], instructions: 'Set bench to 30-45 degrees. Press bar from upper chest.' },
  { name: 'Decline Barbell Bench Press', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['triceps'], instructions: 'Set bench to decline angle, press bar from lower chest.' },
  { name: 'Dumbbell Bench Press', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['triceps', 'shoulders'], instructions: 'Lie flat, press dumbbells up from chest level.' },
  { name: 'Incline Dumbbell Bench Press', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['shoulders', 'triceps'], instructions: 'Set bench to 30-45 degrees, press dumbbells from upper chest.' },
  { name: 'Decline Dumbbell Bench Press', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['triceps'], instructions: 'Set bench to decline, press dumbbells from lower chest.' },
  { name: 'Dumbbell Fly', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['shoulders'], instructions: 'Lie flat, extend arms wide with slight bend, bring dumbbells together above chest.' },
  { name: 'Incline Dumbbell Fly', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['shoulders'], instructions: 'Set bench to incline, perform fly movement targeting upper chest.' },
  { name: 'Cable Fly', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['shoulders'], instructions: 'Set cables to chest height, step forward, bring handles together in arc.' },
  { name: 'Low Cable Fly', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['shoulders'], instructions: 'Set cables low, bring handles up and together in arc motion.' },
  { name: 'High Cable Fly', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['shoulders'], instructions: 'Set cables high, bring handles down and together.' },
  { name: 'Machine Chest Press', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['triceps', 'shoulders'], instructions: 'Sit in machine, press handles forward at chest level.' },
  { name: 'Pec Deck', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['shoulders'], instructions: 'Sit in machine, bring padded arms together in front of chest.' },
  { name: 'Push-Up', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['triceps', 'shoulders', 'core'], instructions: 'Hands shoulder-width, lower body until chest near floor, push up.' },
  { name: 'Wide Push-Up', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['shoulders'], instructions: 'Hands wider than shoulders, perform push-up emphasizing chest stretch.' },
  { name: 'Diamond Push-Up', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['triceps'], instructions: 'Hands close together forming diamond shape, perform push-up.' },
  { name: 'Decline Push-Up', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['shoulders', 'triceps'], instructions: 'Feet elevated on bench, perform push-up targeting upper chest.' },
  { name: 'Dips (Chest Focus)', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['triceps', 'shoulders'], instructions: 'Lean forward on dip bars, lower body with elbows flared slightly.' },
  { name: 'Landmine Press', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['shoulders', 'triceps'], instructions: 'Press barbell end up from chest level using landmine attachment.' },
  { name: 'Floor Press', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['triceps'], instructions: 'Lie on floor, press barbell or dumbbells. Limited ROM protects shoulders.' },
  { name: 'Svend Press', primaryMuscleGroup: 'chest', secondaryMuscleGroups: [], instructions: 'Squeeze two plates together at chest level, press forward and back.' },
  { name: 'Plate Squeeze Press', primaryMuscleGroup: 'chest', secondaryMuscleGroups: [], instructions: 'Hold plate between palms, squeeze and press out from chest.' },
  { name: 'Close-Grip Bench Press', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['triceps'], instructions: 'Hands shoulder-width or narrower, press barbell from chest.' },
  { name: 'Smith Machine Bench Press', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['triceps', 'shoulders'], instructions: 'Use Smith machine for guided bench press movement.' },
  { name: 'Incline Smith Machine Press', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['shoulders', 'triceps'], instructions: 'Set bench to incline under Smith machine, press bar.' },
];

// ─── Back Exercises ──────────────────────────────────────────────────────────

const BACK_EXERCISES: SeedExercise[] = [
  { name: 'Barbell Row', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps', 'forearms'], instructions: 'Hinge at hips, pull barbell to lower chest/upper abdomen.' },
  { name: 'Pendlay Row', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps', 'forearms'], instructions: 'Deadstop row from floor each rep, torso parallel to ground.' },
  { name: 'Dumbbell Row', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps', 'forearms'], instructions: 'One arm on bench, row dumbbell to hip with opposite arm.' },
  { name: 'Seated Cable Row', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps', 'forearms'], instructions: 'Sit upright, pull handle to torso squeezing shoulder blades.' },
  { name: 'Wide-Grip Cable Row', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps'], instructions: 'Use wide bar attachment, pull to upper abdomen.' },
  { name: 'T-Bar Row', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps', 'forearms'], instructions: 'Straddle T-bar, pull to chest keeping back flat.' },
  { name: 'Pull-Up', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps', 'forearms'], instructions: 'Overhand grip, pull body up until chin over bar.' },
  { name: 'Chin-Up', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps'], instructions: 'Underhand grip, pull body up until chin over bar.' },
  { name: 'Lat Pulldown', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps'], instructions: 'Pull wide bar down to upper chest, squeeze lats.' },
  { name: 'Close-Grip Lat Pulldown', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps'], instructions: 'Use V-bar or close grip, pull to chest.' },
  { name: 'Straight-Arm Pulldown', primaryMuscleGroup: 'back', secondaryMuscleGroups: [], instructions: 'Keep arms straight, pull bar down in arc to thighs.' },
  { name: 'Face Pull', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['shoulders'], instructions: 'Pull rope to face level, externally rotating shoulders.' },
  { name: 'Meadows Row', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps'], instructions: 'Stand perpendicular to landmine, row with one arm.' },
  { name: 'Chest-Supported Row', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps'], instructions: 'Lie face down on incline bench, row dumbbells.' },
  { name: 'Inverted Row', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps', 'core'], instructions: 'Hang under bar, pull chest to bar keeping body straight.' },
  { name: 'Single-Arm Cable Row', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps'], instructions: 'Pull single cable handle to hip, one arm at a time.' },
  { name: 'Machine Row', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps'], instructions: 'Sit in rowing machine, pull handles to torso.' },
  { name: 'Barbell Pullover', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['chest'], instructions: 'Lie on bench, lower barbell behind head, pull back over chest.' },
  { name: 'Dumbbell Pullover', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['chest'], instructions: 'Lie across bench, lower dumbbell behind head, pull back.' },
  { name: 'Rack Pull', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['forearms', 'traps'], instructions: 'Deadlift from knee-height rack pins, focus on lockout.' },
  { name: 'Deadlift', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['hamstrings', 'glutes', 'forearms'], instructions: 'Stand with barbell over mid-foot, hinge and grip, stand up.' },
  { name: 'Sumo Deadlift', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['glutes', 'quadriceps'], instructions: 'Wide stance, grip inside knees, stand up with barbell.' },
  { name: 'Trap Bar Deadlift', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['quadriceps', 'glutes'], instructions: 'Stand inside trap bar, grip handles, stand up.' },
  { name: 'Hyperextension', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['glutes', 'hamstrings'], instructions: 'Secure feet in hyperextension bench, lower torso, extend back up.' },
  { name: 'Reverse Hyperextension', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['glutes', 'hamstrings'], instructions: 'Lie face down, raise legs behind using back and glutes.' },
  { name: 'Neutral-Grip Pull-Up', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps'], instructions: 'Use parallel grip handles, pull up until chin over bar.' },
  { name: 'Wide-Grip Pull-Up', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps'], instructions: 'Extra-wide overhand grip, pull up focusing on lat stretch.' },
  { name: 'Behind-Neck Lat Pulldown', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps'], instructions: 'Pull bar behind head to base of neck (use light weight).' },
];

// ─── Shoulder Exercises ──────────────────────────────────────────────────────

const SHOULDER_EXERCISES: SeedExercise[] = [
  { name: 'Overhead Press', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['triceps'], instructions: 'Stand, press barbell overhead from shoulder level.' },
  { name: 'Seated Dumbbell Press', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['triceps'], instructions: 'Sit upright, press dumbbells overhead from shoulders.' },
  { name: 'Arnold Press', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['triceps'], instructions: 'Start with palms facing you, rotate and press up.' },
  { name: 'Dumbbell Lateral Raise', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: [], instructions: 'Stand with dumbbells at sides, raise arms to shoulder height.' },
  { name: 'Cable Lateral Raise', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: [], instructions: 'Stand next to low cable, raise arm to side to shoulder height.' },
  { name: 'Front Raise', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: [], instructions: 'Raise dumbbells in front to shoulder height with straight arms.' },
  { name: 'Rear Delt Fly', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['back'], instructions: 'Bend forward, raise dumbbells to sides targeting rear delts.' },
  { name: 'Reverse Pec Deck', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['back'], instructions: 'Sit facing pad, push arms back squeezing rear delts.' },
  { name: 'Upright Row', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['traps', 'biceps'], instructions: 'Pull barbell up along body to chin level, elbows high.' },
  { name: 'Dumbbell Upright Row', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['traps'], instructions: 'Pull dumbbells up to chin, elbows leading.' },
  { name: 'Military Press', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['triceps', 'core'], instructions: 'Strict standing overhead press with barbell, no leg drive.' },
  { name: 'Push Press', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['triceps', 'quadriceps'], instructions: 'Slight knee dip then press barbell overhead explosively.' },
  { name: 'Behind-Neck Press', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['triceps'], instructions: 'Press barbell from behind head (use light weight, requires mobility).' },
  { name: 'Machine Shoulder Press', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['triceps'], instructions: 'Press handles up in shoulder press machine.' },
  { name: 'Plate Front Raise', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: [], instructions: 'Hold plate with both hands, raise to shoulder height.' },
  { name: 'Cable Front Raise', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: [], instructions: 'Use low cable, raise handle in front to shoulder height.' },
  { name: 'Band Pull-Apart', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['back'], instructions: 'Hold band at chest level, pull apart stretching rear delts.' },
  { name: 'Lu Raise', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: [], instructions: 'Raise dumbbells with thumbs up to 45-degree angle.' },
  { name: 'Landmine Lateral Raise', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: [], instructions: 'Hold end of landmine, raise to side at shoulder height.' },
  { name: 'Cable Rear Delt Fly', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['back'], instructions: 'Cross cables at face height, pull apart targeting rear delts.' },
  { name: 'Seated Barbell Press', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['triceps'], instructions: 'Sit upright, press barbell from shoulders overhead.' },
  { name: 'Z Press', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['triceps', 'core'], instructions: 'Sit on floor with legs extended, press overhead (no back support).' },
  { name: 'Dumbbell Y Raise', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['traps'], instructions: 'Raise dumbbells overhead in Y shape targeting upper traps and delts.' },
  { name: 'Single-Arm Dumbbell Press', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['triceps', 'core'], instructions: 'Press one dumbbell overhead, core engages for stability.' },
  { name: 'Handstand Push-Up', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['triceps'], instructions: 'In handstand position against wall, lower head to floor and press up.' },
];

// ─── Biceps Exercises ────────────────────────────────────────────────────────

const BICEPS_EXERCISES: SeedExercise[] = [
  { name: 'Barbell Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: ['forearms'], instructions: 'Stand, curl barbell from thighs to shoulders.' },
  { name: 'EZ-Bar Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: ['forearms'], instructions: 'Use EZ curl bar for wrist-friendly curling motion.' },
  { name: 'Dumbbell Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: ['forearms'], instructions: 'Curl dumbbells alternating or simultaneously.' },
  { name: 'Hammer Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: ['forearms'], instructions: 'Curl with neutral (palms facing each other) grip.' },
  { name: 'Incline Dumbbell Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: [], instructions: 'Lie on incline bench, curl dumbbells for extra stretch.' },
  { name: 'Preacher Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: [], instructions: 'Rest arms on preacher bench pad, curl barbell or dumbbells.' },
  { name: 'Concentration Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: [], instructions: 'Sit, brace elbow on inner thigh, curl dumbbell.' },
  { name: 'Cable Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: ['forearms'], instructions: 'Use low cable with bar or rope, curl up.' },
  { name: 'Spider Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: [], instructions: 'Lie face down on incline bench, curl dumbbells.' },
  { name: 'Reverse Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: ['forearms'], instructions: 'Curl with overhand grip, targets brachialis.' },
  { name: 'Zottman Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: ['forearms'], instructions: 'Curl up with supination, rotate to pronation, lower slowly.' },
  { name: 'Cross-Body Hammer Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: ['forearms'], instructions: 'Curl dumbbell across body toward opposite shoulder.' },
  { name: 'Bayesian Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: [], instructions: 'Stand facing away from cable, curl behind body for peak stretch.' },
  { name: 'Machine Bicep Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: [], instructions: 'Use bicep curl machine with consistent resistance.' },
  { name: 'Rope Hammer Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: ['forearms'], instructions: 'Use rope on low cable, curl with neutral grip.' },
  { name: 'Drag Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: [], instructions: 'Curl barbell keeping it close to body, elbows go back.' },
  { name: '21s (Bicep Curl)', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: [], instructions: '7 bottom-half, 7 top-half, 7 full range curls.' },
  { name: 'EZ-Bar Preacher Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: [], instructions: 'Use EZ bar on preacher bench for comfortable wrist angle.' },
  { name: 'Single-Arm Cable Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: [], instructions: 'Curl one arm at a time using low cable.' },
  { name: 'Overhead Cable Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: [], instructions: 'Set cables high, curl handles toward head (double bicep pose).' },
];

// ─── Triceps Exercises ───────────────────────────────────────────────────────

const TRICEPS_EXERCISES: SeedExercise[] = [
  { name: 'Tricep Pushdown', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Push bar or rope down from chest, extend arms fully.' },
  { name: 'Rope Pushdown', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Use rope attachment, push down and spread at bottom.' },
  { name: 'Overhead Tricep Extension', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Hold dumbbell overhead, lower behind head, extend up.' },
  { name: 'Skull Crusher', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Lie on bench, lower EZ bar to forehead, extend arms.' },
  { name: 'Dumbbell Skull Crusher', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Lie on bench, lower dumbbells to sides of forehead, extend.' },
  { name: 'Dips (Tricep Focus)', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: ['chest', 'shoulders'], instructions: 'Stay upright on dip bars, lower and press up.' },
  { name: 'Bench Dips', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: ['shoulders'], instructions: 'Hands on bench behind you, lower body, press up.' },
  { name: 'Overhead Cable Extension', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Face away from cable, extend rope overhead.' },
  { name: 'Single-Arm Pushdown', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Push single handle down, extend arm fully.' },
  { name: 'Kickback', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Hinge forward, extend dumbbell backward at elbow.' },
  { name: 'Cable Kickback', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Use low cable, hinge and extend arm backward.' },
  { name: 'JM Press', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: ['chest'], instructions: 'Hybrid of close-grip press and skull crusher.' },
  { name: 'French Press', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Seated or standing, lower barbell behind head, extend up.' },
  { name: 'Tate Press', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Lie on bench, lower dumbbells to chest with elbows out, extend.' },
  { name: 'V-Bar Pushdown', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Use V-bar attachment on cable, push down.' },
  { name: 'Reverse-Grip Pushdown', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Use underhand grip on pushdown for medial head emphasis.' },
  { name: 'Body-Weight Tricep Extension', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Lean on bar or TRX, lower forehead toward hands, extend.' },
  { name: 'Single-Arm Overhead Extension', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Hold one dumbbell overhead, lower behind head, extend.' },
  { name: 'Close-Grip Push-Up', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: ['chest'], instructions: 'Hands close together, perform push-up emphasizing triceps.' },
  { name: 'Machine Tricep Extension', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Use tricep extension machine for consistent resistance.' },
];

// ─── Quadriceps Exercises ────────────────────────────────────────────────────

const QUADRICEPS_EXERCISES: SeedExercise[] = [
  { name: 'Barbell Back Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes', 'hamstrings', 'core'], instructions: 'Bar on upper back, squat down until thighs parallel, stand up.' },
  { name: 'Front Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes', 'core'], instructions: 'Bar on front delts, squat keeping torso upright.' },
  { name: 'Goblet Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes', 'core'], instructions: 'Hold dumbbell at chest, squat with upright torso.' },
  { name: 'Leg Press', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes'], instructions: 'Press platform away with feet shoulder-width on sled.' },
  { name: 'Hack Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes'], instructions: 'Use hack squat machine, squat down and press up.' },
  { name: 'Leg Extension', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: [], instructions: 'Sit in machine, extend legs to straight position.' },
  { name: 'Bulgarian Split Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes'], instructions: 'Rear foot elevated on bench, squat on front leg.' },
  { name: 'Walking Lunge', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes', 'hamstrings'], instructions: 'Step forward into lunge, alternate legs while walking.' },
  { name: 'Reverse Lunge', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes'], instructions: 'Step backward into lunge, push back to standing.' },
  { name: 'Step-Up', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes'], instructions: 'Step onto elevated platform, drive up with front leg.' },
  { name: 'Sissy Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: [], instructions: 'Lean back while bending knees, keeping hips extended.' },
  { name: 'Wall Sit', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: [], instructions: 'Lean against wall with thighs parallel to floor, hold.' },
  { name: 'Pistol Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes', 'core'], instructions: 'Single-leg squat with other leg extended in front.' },
  { name: 'Belt Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes'], instructions: 'Load attached to belt around hips, squat without spinal load.' },
  { name: 'Spanish Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: [], instructions: 'Band behind knees anchored, lean back and squat.' },
  { name: 'Pendulum Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes'], instructions: 'Use pendulum squat machine for arc-pattern squat.' },
  { name: 'Safety Bar Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes', 'core'], instructions: 'Squat using safety squat bar for shoulder-friendly loading.' },
  { name: 'Smith Machine Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes'], instructions: 'Squat in Smith machine for guided movement.' },
  { name: 'Narrow-Stance Leg Press', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: [], instructions: 'Feet close and low on platform for quad emphasis.' },
  { name: 'Dumbbell Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes'], instructions: 'Hold dumbbells at sides, squat and stand.' },
  { name: 'Barbell Lunge', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes'], instructions: 'Bar on back, step forward into lunge.' },
  { name: 'Leg Press Calf Raise', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['calves'], instructions: 'Place toes on bottom of leg press, press through calves.' },
  { name: 'Cyclist Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: [], instructions: 'Heels elevated, narrow stance squat for quad emphasis.' },
  { name: 'Box Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes', 'hamstrings'], instructions: 'Squat to box, pause, then stand explosively.' },
  { name: 'Lateral Lunge', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes'], instructions: 'Step to side into lunge, push back to standing.' },
];

// ─── Hamstrings Exercises ────────────────────────────────────────────────────

const HAMSTRINGS_EXERCISES: SeedExercise[] = [
  { name: 'Romanian Deadlift', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: ['glutes', 'back'], instructions: 'Hinge at hips with slight knee bend, lower barbell along legs.' },
  { name: 'Stiff-Leg Deadlift', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: ['glutes', 'back'], instructions: 'Keep legs nearly straight, hinge and lower barbell.' },
  { name: 'Lying Leg Curl', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: [], instructions: 'Lie face down, curl pad toward glutes.' },
  { name: 'Seated Leg Curl', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: [], instructions: 'Sit in machine, curl legs under the seat.' },
  { name: 'Nordic Hamstring Curl', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: [], instructions: 'Kneel, lower body forward under control using hamstrings.' },
  { name: 'Good Morning', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: ['back', 'glutes'], instructions: 'Bar on back, hinge forward keeping back flat.' },
  { name: 'Glute-Ham Raise', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: ['glutes'], instructions: 'On GHD, lower torso and pull back up using hamstrings.' },
  { name: 'Single-Leg Romanian Deadlift', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: ['glutes', 'core'], instructions: 'Balance on one leg, hinge forward with dumbbell.' },
  { name: 'Dumbbell Romanian Deadlift', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: ['glutes', 'back'], instructions: 'Hinge with dumbbells at sides, keeping back flat.' },
  { name: 'Cable Pull-Through', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: ['glutes'], instructions: 'Face away from cable, hinge and pull through legs.' },
  { name: 'Kettlebell Swing', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: ['glutes', 'core'], instructions: 'Hinge and swing kettlebell to shoulder height with hip thrust.' },
  { name: 'Sliding Leg Curl', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: [], instructions: 'Lie on back, heels on sliders, curl heels toward glutes.' },
  { name: 'Standing Leg Curl', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: [], instructions: 'Stand at machine, curl one leg at a time.' },
  { name: 'Deficit Romanian Deadlift', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: ['glutes'], instructions: 'Stand on platform for extra ROM on Romanian deadlift.' },
  { name: 'Pause Romanian Deadlift', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: ['glutes', 'back'], instructions: 'Pause at bottom of RDL for 2-3 seconds.' },
  { name: 'Banded Leg Curl', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: [], instructions: 'Attach band to foot, curl against band resistance.' },
  { name: 'Hip Hinge (Bodyweight)', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: ['glutes'], instructions: 'Practice hip hinge pattern with dowel for form.' },
  { name: 'Swiss Ball Leg Curl', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: ['glutes', 'core'], instructions: 'Lie on back, feet on ball, curl ball toward glutes.' },
  { name: 'Trap Bar Romanian Deadlift', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: ['glutes'], instructions: 'Use trap bar for Romanian deadlift, neutral grip.' },
  { name: 'Single-Leg Leg Curl', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: [], instructions: 'Perform leg curl one leg at a time on machine.' },
];

// ─── Glutes Exercises ────────────────────────────────────────────────────────

const GLUTES_EXERCISES: SeedExercise[] = [
  { name: 'Hip Thrust', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: ['hamstrings'], instructions: 'Back on bench, drive hips up with barbell on lap.' },
  { name: 'Barbell Hip Thrust', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: ['hamstrings'], instructions: 'Back on bench, barbell on hips, thrust up squeezing glutes.' },
  { name: 'Glute Bridge', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: ['hamstrings'], instructions: 'Lie on back, drive hips up squeezing glutes at top.' },
  { name: 'Single-Leg Glute Bridge', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: ['hamstrings', 'core'], instructions: 'One leg extended, drive hips up with single leg.' },
  { name: 'Cable Pull-Through (Glute)', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: ['hamstrings'], instructions: 'Face away from low cable, hinge and thrust hips forward.' },
  { name: 'Sumo Squat', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: ['quadriceps'], instructions: 'Wide stance squat with toes turned out, emphasis on glutes.' },
  { name: 'Cable Kickback', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: ['hamstrings'], instructions: 'Ankle strap on cable, kick leg back squeezing glute.' },
  { name: 'Donkey Kick', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: [], instructions: 'On all fours, kick one leg up toward ceiling.' },
  { name: 'Fire Hydrant', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: [], instructions: 'On all fours, lift knee to side at 90 degrees.' },
  { name: 'Banded Clamshell', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: [], instructions: 'Lie on side with band, open knees like clamshell.' },
  { name: 'Frog Pump', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: [], instructions: 'Lie on back, soles together, pump hips up.' },
  { name: 'Smith Machine Hip Thrust', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: ['hamstrings'], instructions: 'Use Smith machine for guided hip thrust.' },
  { name: 'Reverse Lunge (Glute Focus)', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: ['quadriceps'], instructions: 'Long step back, lean torso slightly forward for glute emphasis.' },
  { name: 'Curtsy Lunge', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: ['quadriceps'], instructions: 'Step diagonally behind, lunge targeting gluteus medius.' },
  { name: 'Elevated Glute Bridge', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: ['hamstrings'], instructions: 'Feet on bench, perform glute bridge with extended ROM.' },
  { name: 'Machine Hip Abduction', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: [], instructions: 'Sit in abduction machine, push legs apart.' },
  { name: 'Banded Walk', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: [], instructions: 'Band around ankles or knees, walk sideways.' },
  { name: 'Step-Up (Glute Focus)', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: ['quadriceps'], instructions: 'High step-up with forward lean for glute emphasis.' },
  { name: 'Single-Leg Hip Thrust', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: ['hamstrings', 'core'], instructions: 'Back on bench, one leg up, thrust with single leg.' },
  { name: 'Kneeling Squat', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: [], instructions: 'Kneel with bar on back, sit back and thrust hips forward.' },
];

// ─── Calves Exercises ────────────────────────────────────────────────────────

const CALVES_EXERCISES: SeedExercise[] = [
  { name: 'Standing Calf Raise', primaryMuscleGroup: 'calves', secondaryMuscleGroups: [], instructions: 'Stand on platform edge, raise heels as high as possible.' },
  { name: 'Seated Calf Raise', primaryMuscleGroup: 'calves', secondaryMuscleGroups: [], instructions: 'Sit in calf raise machine, press through toes.' },
  { name: 'Smith Machine Calf Raise', primaryMuscleGroup: 'calves', secondaryMuscleGroups: [], instructions: 'Stand under Smith bar on platform, perform calf raises.' },
  { name: 'Donkey Calf Raise', primaryMuscleGroup: 'calves', secondaryMuscleGroups: [], instructions: 'Hinge forward, load on lower back area, raise heels.' },
  { name: 'Single-Leg Calf Raise', primaryMuscleGroup: 'calves', secondaryMuscleGroups: [], instructions: 'Stand on one foot on edge, raise heel under control.' },
  { name: 'Leg Press Calf Raise', primaryMuscleGroup: 'calves', secondaryMuscleGroups: [], instructions: 'Toes on bottom of leg press platform, press through calves.' },
  { name: 'Bodyweight Calf Raise', primaryMuscleGroup: 'calves', secondaryMuscleGroups: [], instructions: 'Stand on edge of step, raise and lower heels.' },
  { name: 'Tibialis Raise', primaryMuscleGroup: 'calves', secondaryMuscleGroups: [], instructions: 'Lean against wall, raise toes toward shins.' },
  { name: 'Jump Rope', primaryMuscleGroup: 'calves', secondaryMuscleGroups: ['core'], instructions: 'Jump rope staying on balls of feet.' },
  { name: 'Farmer Walk on Toes', primaryMuscleGroup: 'calves', secondaryMuscleGroups: ['forearms', 'core'], instructions: 'Walk on toes while holding heavy dumbbells.' },
  { name: 'Explosive Calf Raise', primaryMuscleGroup: 'calves', secondaryMuscleGroups: [], instructions: 'Perform calf raises explosively with a pause at top.' },
  { name: 'Decline Calf Raise', primaryMuscleGroup: 'calves', secondaryMuscleGroups: [], instructions: 'Stand on decline, raise heels targeting different angle.' },
  { name: 'Barbell Calf Raise', primaryMuscleGroup: 'calves', secondaryMuscleGroups: [], instructions: 'Hold barbell on back, perform calf raises on platform.' },
  { name: 'Dumbbell Calf Raise', primaryMuscleGroup: 'calves', secondaryMuscleGroups: [], instructions: 'Hold dumbbells at sides, raise heels on platform edge.' },
  { name: 'Stair Calf Raise', primaryMuscleGroup: 'calves', secondaryMuscleGroups: [], instructions: 'Stand on stair edge, perform slow calf raises.' },
];

// ─── Core Exercises ──────────────────────────────────────────────────────────

const CORE_EXERCISES: SeedExercise[] = [
  { name: 'Plank', primaryMuscleGroup: 'core', secondaryMuscleGroups: ['shoulders'], instructions: 'Hold push-up position with forearms on ground, body straight.' },
  { name: 'Side Plank', primaryMuscleGroup: 'core', secondaryMuscleGroups: ['shoulders'], instructions: 'Lie on side, support on forearm, hips elevated.' },
  { name: 'Crunch', primaryMuscleGroup: 'core', secondaryMuscleGroups: [], instructions: 'Lie on back, curl shoulders toward hips.' },
  { name: 'Bicycle Crunch', primaryMuscleGroup: 'core', secondaryMuscleGroups: [], instructions: 'Lie on back, alternate elbow to opposite knee.' },
  { name: 'Hanging Leg Raise', primaryMuscleGroup: 'core', secondaryMuscleGroups: ['forearms'], instructions: 'Hang from bar, raise legs to parallel or higher.' },
  { name: 'Hanging Knee Raise', primaryMuscleGroup: 'core', secondaryMuscleGroups: ['forearms'], instructions: 'Hang from bar, bring knees to chest.' },
  { name: 'Ab Wheel Rollout', primaryMuscleGroup: 'core', secondaryMuscleGroups: ['shoulders'], instructions: 'Kneel, roll wheel out extending body, roll back.' },
  { name: 'Cable Crunch', primaryMuscleGroup: 'core', secondaryMuscleGroups: [], instructions: 'Kneel at cable, crunch down bringing elbows to knees.' },
  { name: 'Russian Twist', primaryMuscleGroup: 'core', secondaryMuscleGroups: [], instructions: 'Sit with feet up, rotate torso side to side with weight.' },
  { name: 'Mountain Climber', primaryMuscleGroup: 'core', secondaryMuscleGroups: ['shoulders'], instructions: 'In push-up position, alternate driving knees to chest.' },
  { name: 'Dead Bug', primaryMuscleGroup: 'core', secondaryMuscleGroups: [], instructions: 'Lie on back, extend opposite arm and leg while maintaining flat back.' },
  { name: 'Pallof Press', primaryMuscleGroup: 'core', secondaryMuscleGroups: [], instructions: 'Stand sideways to cable, press handle out resisting rotation.' },
  { name: 'Dragon Flag', primaryMuscleGroup: 'core', secondaryMuscleGroups: [], instructions: 'Lie on bench, lower body like a flag keeping rigid.' },
  { name: 'L-Sit', primaryMuscleGroup: 'core', secondaryMuscleGroups: ['shoulders'], instructions: 'Support body on parallel bars, hold legs straight out.' },
  { name: 'Toe Touch', primaryMuscleGroup: 'core', secondaryMuscleGroups: [], instructions: 'Lie on back, legs vertical, reach hands toward toes.' },
  { name: 'V-Up', primaryMuscleGroup: 'core', secondaryMuscleGroups: [], instructions: 'Lie flat, simultaneously raise legs and torso to V shape.' },
  { name: 'Flutter Kick', primaryMuscleGroup: 'core', secondaryMuscleGroups: [], instructions: 'Lie on back, alternate small kicks with straight legs.' },
  { name: 'Woodchop', primaryMuscleGroup: 'core', secondaryMuscleGroups: ['shoulders'], instructions: 'Rotate torso pulling cable from high to low diagonally.' },
  { name: 'Reverse Crunch', primaryMuscleGroup: 'core', secondaryMuscleGroups: [], instructions: 'Lie on back, curl hips off floor bringing knees to chest.' },
  { name: 'Sit-Up', primaryMuscleGroup: 'core', secondaryMuscleGroups: [], instructions: 'Lie on back, sit all the way up touching toes.' },
  { name: 'Decline Sit-Up', primaryMuscleGroup: 'core', secondaryMuscleGroups: [], instructions: 'On decline bench, perform sit-ups against gravity.' },
  { name: 'Suitcase Carry', primaryMuscleGroup: 'core', secondaryMuscleGroups: ['forearms'], instructions: 'Carry heavy weight in one hand, walk upright resisting lean.' },
  { name: 'Bear Crawl', primaryMuscleGroup: 'core', secondaryMuscleGroups: ['shoulders'], instructions: 'Crawl on all fours with knees hovering off ground.' },
  { name: 'Bird Dog', primaryMuscleGroup: 'core', secondaryMuscleGroups: [], instructions: 'On all fours, extend opposite arm and leg, alternate.' },
  { name: 'Copenhagen Plank', primaryMuscleGroup: 'core', secondaryMuscleGroups: [], instructions: 'Side plank with top leg on bench, adductor engagement.' },
];

// ─── Forearms Exercises ──────────────────────────────────────────────────────

const FOREARMS_EXERCISES: SeedExercise[] = [
  { name: 'Wrist Curl', primaryMuscleGroup: 'forearms', secondaryMuscleGroups: [], instructions: 'Rest forearms on bench, curl barbell with wrists.' },
  { name: 'Reverse Wrist Curl', primaryMuscleGroup: 'forearms', secondaryMuscleGroups: [], instructions: 'Rest forearms on bench, extend wrists with overhand grip.' },
  { name: 'Farmer Walk', primaryMuscleGroup: 'forearms', secondaryMuscleGroups: ['core', 'traps'], instructions: 'Hold heavy dumbbells, walk for distance or time.' },
  { name: 'Dead Hang', primaryMuscleGroup: 'forearms', secondaryMuscleGroups: [], instructions: 'Hang from pull-up bar with straight arms for time.' },
  { name: 'Plate Pinch', primaryMuscleGroup: 'forearms', secondaryMuscleGroups: [], instructions: 'Pinch two plates together with fingers, hold for time.' },
  { name: 'Towel Hang', primaryMuscleGroup: 'forearms', secondaryMuscleGroups: [], instructions: 'Drape towel over bar, hang gripping towel ends.' },
  { name: 'Wrist Roller', primaryMuscleGroup: 'forearms', secondaryMuscleGroups: [], instructions: 'Roll weight up and down using wrist rotation on roller.' },
  { name: 'Behind-Back Wrist Curl', primaryMuscleGroup: 'forearms', secondaryMuscleGroups: [], instructions: 'Hold barbell behind back, curl with wrists.' },
  { name: 'Gripper Squeeze', primaryMuscleGroup: 'forearms', secondaryMuscleGroups: [], instructions: 'Squeeze hand gripper, hold at close, release slowly.' },
  { name: 'Fat Bar Hold', primaryMuscleGroup: 'forearms', secondaryMuscleGroups: [], instructions: 'Hold thick bar or fat gripz attached bar for time.' },
  { name: 'Finger Extension (Band)', primaryMuscleGroup: 'forearms', secondaryMuscleGroups: [], instructions: 'Place band around fingers, extend fingers outward.' },
  { name: 'Dumbbell Wrist Curl', primaryMuscleGroup: 'forearms', secondaryMuscleGroups: [], instructions: 'One arm at a time, curl dumbbell with wrist.' },
  { name: 'Radial Deviation', primaryMuscleGroup: 'forearms', secondaryMuscleGroups: [], instructions: 'Hold weighted bar vertically, raise using wrist (thumb side up).' },
  { name: 'Ulnar Deviation', primaryMuscleGroup: 'forearms', secondaryMuscleGroups: [], instructions: 'Hold weighted bar vertically, raise using wrist (pinky side up).' },
  { name: 'Hex Dumbbell Hold', primaryMuscleGroup: 'forearms', secondaryMuscleGroups: [], instructions: 'Grip hex dumbbell head from above, hold for time.' },
];

// ─── Traps Exercises ─────────────────────────────────────────────────────────

const TRAPS_EXERCISES: SeedExercise[] = [
  { name: 'Barbell Shrug', primaryMuscleGroup: 'traps', secondaryMuscleGroups: ['forearms'], instructions: 'Hold barbell at thighs, shrug shoulders to ears.' },
  { name: 'Dumbbell Shrug', primaryMuscleGroup: 'traps', secondaryMuscleGroups: ['forearms'], instructions: 'Hold dumbbells at sides, shrug shoulders straight up.' },
  { name: 'Trap Bar Shrug', primaryMuscleGroup: 'traps', secondaryMuscleGroups: ['forearms'], instructions: 'Stand in trap bar, shrug shoulders up.' },
  { name: 'Cable Shrug', primaryMuscleGroup: 'traps', secondaryMuscleGroups: [], instructions: 'Use low cables, shrug shoulders with constant tension.' },
  { name: 'Behind-Back Shrug', primaryMuscleGroup: 'traps', secondaryMuscleGroups: [], instructions: 'Hold barbell behind back, shrug shoulders up.' },
  { name: 'Smith Machine Shrug', primaryMuscleGroup: 'traps', secondaryMuscleGroups: [], instructions: 'Use Smith machine for guided shrugging motion.' },
  { name: 'Power Shrug', primaryMuscleGroup: 'traps', secondaryMuscleGroups: ['forearms'], instructions: 'Explosive shrug with slight calf raise for heavier loads.' },
  { name: 'Overhead Shrug', primaryMuscleGroup: 'traps', secondaryMuscleGroups: ['shoulders'], instructions: 'Hold barbell overhead, shrug up (snatch grip).' },
  { name: 'Prone Y Raise', primaryMuscleGroup: 'traps', secondaryMuscleGroups: ['shoulders'], instructions: 'Lie face down, raise arms in Y shape targeting lower traps.' },
  { name: 'Incline Dumbbell Shrug', primaryMuscleGroup: 'traps', secondaryMuscleGroups: [], instructions: 'Lie face down on incline, shrug dumbbells up.' },
  { name: 'Machine Shrug', primaryMuscleGroup: 'traps', secondaryMuscleGroups: [], instructions: 'Use shrug or calf raise machine for guided movement.' },
  { name: 'Snatch-Grip High Pull', primaryMuscleGroup: 'traps', secondaryMuscleGroups: ['shoulders', 'back'], instructions: 'Wide grip, explosively pull bar to chest height.' },
  { name: 'Kelso Shrug', primaryMuscleGroup: 'traps', secondaryMuscleGroups: ['back'], instructions: 'Lie face down on bench, retract shoulder blades lifting weight.' },
  { name: 'Farmer Walk (Traps)', primaryMuscleGroup: 'traps', secondaryMuscleGroups: ['forearms', 'core'], instructions: 'Heavy farmer walk emphasizing elevated shoulders.' },
  { name: 'Single-Arm Dumbbell Shrug', primaryMuscleGroup: 'traps', secondaryMuscleGroups: [], instructions: 'Shrug one arm at a time for focused contraction.' },
];

// ─── Combined Exercise Library ───────────────────────────────────────────────


// ─── Additional Exercises (filling to 300+) ──────────────────────────────────

const ADDITIONAL_EXERCISES: SeedExercise[] = [
  // More chest variations
  { name: 'Chest Dip Machine', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['triceps'], instructions: 'Use assisted dip machine with forward lean.' },
  { name: 'Cable Crossover', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['shoulders'], instructions: 'Set cables high, cross arms at bottom of movement.' },
  { name: 'Incline Cable Fly', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['shoulders'], instructions: 'Set bench at incline between cables, perform fly.' },
  { name: 'Machine Incline Press', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['shoulders', 'triceps'], instructions: 'Use incline chest press machine.' },
  { name: 'Deficit Push-Up', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['shoulders', 'triceps'], instructions: 'Hands on elevated surfaces for greater chest stretch.' },
  // More back variations
  { name: 'Kayak Row', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps', 'core'], instructions: 'Seated cable row alternating sides like paddling.' },
  { name: 'Kroc Row', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps', 'forearms'], instructions: 'Heavy single-arm dumbbell row with controlled cheating.' },
  { name: 'Seal Row', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps'], instructions: 'Lie face down on elevated bench, row with no momentum.' },
  { name: 'Machine Pullover', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['chest'], instructions: 'Use pullover machine for lat isolation.' },
  { name: 'Wide-Grip Seated Row', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps'], instructions: 'Use wide grip on seated row for upper back emphasis.' },
  // More shoulder variations
  { name: 'Machine Lateral Raise', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: [], instructions: 'Use lateral raise machine for consistent resistance.' },
  { name: 'Bradford Press', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['triceps'], instructions: 'Alternate pressing in front and behind head without lockout.' },
  { name: 'Dumbbell Rear Delt Row', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['back'], instructions: 'Row with elbows flared to target rear delts.' },
  { name: 'Leaning Lateral Raise', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: [], instructions: 'Hold pole, lean away, perform lateral raise for better stretch.' },
  { name: 'Scott Press', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['triceps'], instructions: 'Hybrid lateral raise into press movement.' },
  // More leg variations
  { name: 'High Bar Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes'], instructions: 'Bar high on traps, squat with upright torso.' },
  { name: 'Low Bar Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes', 'hamstrings'], instructions: 'Bar on rear delts, squat with more hip hinge.' },
  { name: 'Zercher Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['core', 'biceps'], instructions: 'Hold barbell in elbow crooks, squat.' },
  { name: 'Jefferson Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes', 'core'], instructions: 'Straddle barbell, squat with anti-rotation demand.' },
  { name: 'Landmine Squat', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['core'], instructions: 'Hold end of landmine at chest, squat.' },
  // More hamstring/glute
  { name: 'B-Stance Hip Thrust', primaryMuscleGroup: 'glutes', secondaryMuscleGroups: ['hamstrings'], instructions: 'One foot slightly ahead, thrust emphasizing working side.' },
  { name: 'Banded Romanian Deadlift', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: ['glutes'], instructions: 'Perform RDL with band for accommodating resistance.' },
  { name: 'Seated Good Morning', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: ['back'], instructions: 'Sit on bench with bar on back, hinge forward.' },
  { name: '45-Degree Back Extension', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: ['glutes', 'back'], instructions: 'On 45-degree back extension pad, hinge and extend.' },
  { name: 'B-Stance Romanian Deadlift', primaryMuscleGroup: 'hamstrings', secondaryMuscleGroups: ['glutes'], instructions: 'One foot slightly behind for single-leg emphasis RDL.' },
  // More core variations
  { name: 'Landmine Rotation', primaryMuscleGroup: 'core', secondaryMuscleGroups: ['shoulders'], instructions: 'Hold end of landmine, rotate side to side.' },
  { name: 'Hollow Body Hold', primaryMuscleGroup: 'core', secondaryMuscleGroups: [], instructions: 'Lie on back, legs and shoulders off ground, body curved.' },
  { name: 'Stir the Pot', primaryMuscleGroup: 'core', secondaryMuscleGroups: ['shoulders'], instructions: 'Plank on stability ball, make small circles with forearms.' },
  { name: 'Weighted Plank', primaryMuscleGroup: 'core', secondaryMuscleGroups: ['shoulders'], instructions: 'Hold plank position with weight plate on back.' },
  { name: 'GHD Sit-Up', primaryMuscleGroup: 'core', secondaryMuscleGroups: [], instructions: 'On GHD machine, perform full range sit-up.' },
  // More arm variations
  { name: 'Dumbbell Tricep Kickback', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Hinge forward, extend dumbbell back at elbow.' },
  { name: 'EZ-Bar Skull Crusher', primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [], instructions: 'Use EZ bar for comfortable grip on skull crushers.' },
  { name: 'Wide-Grip Barbell Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: ['forearms'], instructions: 'Curl with wider than shoulder grip for short head.' },
  { name: 'Close-Grip Barbell Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: ['forearms'], instructions: 'Curl with narrow grip for long head emphasis.' },
  { name: 'Cable Hammer Curl', primaryMuscleGroup: 'biceps', secondaryMuscleGroups: ['forearms'], instructions: 'Use rope on low cable, curl with neutral grip.' },
  // More compound movements
  { name: 'Clean and Press', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['back', 'quadriceps', 'core'], instructions: 'Clean bar from floor to shoulders, then press overhead.' },
  { name: 'Thruster', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['shoulders', 'core'], instructions: 'Front squat into overhead press in one fluid motion.' },
  { name: 'Power Clean', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['quadriceps', 'traps', 'shoulders'], instructions: 'Explosively pull bar from floor to front rack position.' },
  { name: 'Snatch', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['back', 'quadriceps', 'traps'], instructions: 'Pull bar from floor to overhead in one movement.' },
  { name: 'Clean and Jerk', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['quadriceps', 'back', 'core'], instructions: 'Clean to shoulders, then split jerk overhead.' },
  { name: 'Muscle-Up', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['chest', 'triceps', 'core'], instructions: 'Pull-up transitioning to dip above bar or rings.' },
  { name: 'Turkish Get-Up', primaryMuscleGroup: 'core', secondaryMuscleGroups: ['shoulders', 'glutes'], instructions: 'Lie to standing with weight locked overhead, reverse.' },
  { name: 'Man Maker', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['chest', 'back', 'core'], instructions: 'Push-up, row each side, clean and press from floor.' },
  { name: 'Burpee', primaryMuscleGroup: 'core', secondaryMuscleGroups: ['chest', 'quadriceps', 'shoulders'], instructions: 'Drop to push-up, jump feet in, jump up.' },
  { name: 'Box Jump', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes', 'calves'], instructions: 'Jump onto elevated box, land softly, step down.' },
  { name: 'Battle Ropes', primaryMuscleGroup: 'shoulders', secondaryMuscleGroups: ['core', 'forearms'], instructions: 'Alternate slamming heavy ropes up and down.' },
  { name: 'Sled Push', primaryMuscleGroup: 'quadriceps', secondaryMuscleGroups: ['glutes', 'calves', 'core'], instructions: 'Push weighted sled forward for distance.' },
  { name: 'Sled Pull', primaryMuscleGroup: 'back', secondaryMuscleGroups: ['biceps', 'hamstrings'], instructions: 'Pull weighted sled toward you hand over hand.' },
];

// Final combined export including additional exercises
export const GLOBAL_EXERCISES: SeedExercise[] = [
  ...CHEST_EXERCISES,
  ...BACK_EXERCISES,
  ...SHOULDER_EXERCISES,
  ...BICEPS_EXERCISES,
  ...TRICEPS_EXERCISES,
  ...QUADRICEPS_EXERCISES,
  ...HAMSTRINGS_EXERCISES,
  ...GLUTES_EXERCISES,
  ...CALVES_EXERCISES,
  ...CORE_EXERCISES,
  ...FOREARMS_EXERCISES,
  ...TRAPS_EXERCISES,
  ...ADDITIONAL_EXERCISES,
];

