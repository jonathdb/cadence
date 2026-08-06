/**
 * Seed script: Inserts 300+ global exercises into the Supabase exercises table.
 *
 * Usage: npx tsx scripts/seed-exercises.ts
 *
 * This script uses the service role key to bypass RLS and insert global exercises.
 * It's designed to be run once during initial setup or via CI.
 *
 * Requirements: 10.1
 */
import { createClient } from '@supabase/supabase-js';

import { GLOBAL_EXERCISES } from '../src/data/exercise-seed';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function seedExercises() {
  console.log(`Seeding ${GLOBAL_EXERCISES.length} global exercises...`);

  // Check if exercises already exist
  const { count } = await supabase
    .from('exercises')
    .select('*', { count: 'exact', head: true })
    .eq('is_global', true);

  if (count && count >= 300) {
    console.log(`Already have ${count} global exercises. Skipping seed.`);
    return;
  }

  // Insert in batches of 50 to avoid request size limits
  const BATCH_SIZE = 50;
  let inserted = 0;

  for (let i = 0; i < GLOBAL_EXERCISES.length; i += BATCH_SIZE) {
    const batch = GLOBAL_EXERCISES.slice(i, i + BATCH_SIZE).map((exercise) => ({
      name: exercise.name,
      primary_muscle_group: exercise.primaryMuscleGroup,
      secondary_muscle_groups: exercise.secondaryMuscleGroups,
      instructions: exercise.instructions,
      is_global: true,
      user_id: null,
    }));

    const { error } = await supabase.from('exercises').upsert(batch, {
      onConflict: 'name',
      ignoreDuplicates: true,
    });

    if (error) {
      console.error(`Error inserting batch ${i / BATCH_SIZE + 1}:`, error.message);
    } else {
      inserted += batch.length;
      console.log(`  Inserted batch ${Math.floor(i / BATCH_SIZE) + 1} (${inserted}/${GLOBAL_EXERCISES.length})`);
    }
  }

  console.log(`Done! Seeded ${inserted} exercises.`);
}

seedExercises().catch(console.error);
