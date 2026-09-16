/**
 * Tests for the pure critiqueProgram engine (Task 8) and the critique_program
 * server handler (assembles program + profile + analytics).
 */
import { describe, expect, it, vi } from 'vitest';

import {
    critiqueProgram,
    type ProgramCritiqueInput,
} from '../../supabase/functions/_shared/analytics-engine.ts';
import { getToolHandler } from '../../supabase/functions/_shared/tool-handlers.ts';

// --- pure critique ---

function baseInput(overrides: Partial<ProgramCritiqueInput> = {}): ProgramCritiqueInput {
  return {
    training_days: 4,
    targets: [
      { exercise_name: 'Bench Press', muscle_group: 'chest', target_sets: 4 },
      { exercise_name: 'Row', muscle_group: 'back', target_sets: 4 },
      { exercise_name: 'Squat', muscle_group: 'quads', target_sets: 4 },
      { exercise_name: 'RDL', muscle_group: 'hamstrings', target_sets: 4 },
      { exercise_name: 'OHP', muscle_group: 'shoulders', target_sets: 4 },
    ],
    profile: { goal: 'hypertrophy', experience_level: 'intermediate', weekly_frequency: 4, equipment: ['barbell'] },
    muscle_balance: null,
    recovery_compromised: false,
    ...overrides,
  };
}

describe('critiqueProgram', () => {
  it('flags a missing major muscle group', () => {
    const input = baseInput({
      targets: [{ exercise_name: 'Bench Press', muscle_group: 'chest', target_sets: 4 }],
    });
    const findings = critiqueProgram(input);
    const balance = findings.find((f) => f.area === 'muscle_balance' && f.severity === 'warning');
    expect(balance).toBeTruthy();
    expect(balance!.message).toContain('back');
  });

  it('flags volume exceeding the goal guideline', () => {
    const input = baseInput({
      targets: [{ exercise_name: 'Bench Press', muscle_group: 'chest', target_sets: 30 }],
      profile: { goal: 'hypertrophy', weekly_frequency: 4 },
    });
    const findings = critiqueProgram(input);
    const vol = findings.find((f) => f.area === 'volume_vs_recovery' && f.message.includes('exceed'));
    expect(vol).toBeTruthy();
  });

  it('flags a frequency mismatch vs the profile target', () => {
    const input = baseInput({ training_days: 2, profile: { goal: 'hypertrophy', weekly_frequency: 5 } });
    const findings = critiqueProgram(input);
    const freq = findings.find((f) => f.area === 'frequency');
    expect(freq).toBeTruthy();
    expect(freq!.proposed_change).toContain('training day');
  });

  it('flags equipment mismatch', () => {
    const input = baseInput({
      targets: [{ exercise_name: 'Leg Press', muscle_group: 'quads', target_sets: 4, equipment: 'machines' }],
      profile: { goal: 'strength', equipment: ['dumbbells'] },
    });
    const findings = critiqueProgram(input);
    expect(findings.some((f) => f.area === 'equipment')).toBe(true);
  });

  it('surfaces a recovery warning when compromised', () => {
    const findings = critiqueProgram(baseInput({ recovery_compromised: true }));
    expect(findings.some((f) => f.area === 'volume_vs_recovery' && f.message.includes('recovery'))).toBe(true);
  });

  it('returns a positive info finding for a well-aligned program', () => {
    // Balanced 5 majors at 12 sets each within hypertrophy range, matching frequency, barbell only.
    const findings = critiqueProgram(
      baseInput({
        targets: [
          { exercise_name: 'Bench', muscle_group: 'chest', target_sets: 12 },
          { exercise_name: 'Row', muscle_group: 'back', target_sets: 12 },
          { exercise_name: 'Squat', muscle_group: 'quads', target_sets: 12 },
          { exercise_name: 'RDL', muscle_group: 'hamstrings', target_sets: 12 },
          { exercise_name: 'OHP', muscle_group: 'shoulders', target_sets: 12 },
        ],
        profile: { goal: 'hypertrophy', weekly_frequency: 4, equipment: [] },
      })
    );
    // No warnings expected → the "well-aligned" info finding is present.
    expect(findings.some((f) => f.message.includes('well-aligned'))).toBe(true);
  });
});

// --- handler ---

function queryResult(data: unknown[]) {
  const result = { data, error: null };
  const builder: any = {};
  const chain = () => builder;
  for (const m of ['select', 'eq', 'gte', 'lte', 'in', 'or', 'ilike', 'order', 'limit']) {
    builder[m] = vi.fn(chain);
  }
  builder.then = (resolve: (v: typeof result) => unknown) => resolve(result);
  builder.single = vi.fn().mockResolvedValue({ data: data[0] ?? null, error: data[0] ? null : { message: 'nf' } });
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: data[0] ?? null, error: null });
  return builder;
}
function mockSupabase(tables: Record<string, unknown[]>) {
  return { from: vi.fn((t: string) => queryResult(tables[t] ?? [])) } as any;
}

describe('critique_program handler', () => {
  it('returns null active_program when none exists', async () => {
    const handler = getToolHandler('critique_program')!;
    const supabase = mockSupabase({ programs: [] });
    const result = (await handler(supabase, 'user-1', {})) as any;
    expect(result.active_program).toBeNull();
    expect(result.findings).toEqual([]);
  });

  it('critiques an active program and returns findings', async () => {
    const handler = getToolHandler('critique_program')!;
    const supabase = mockSupabase({
      programs: [{ id: 'prog-1', name: 'PPL' }],
      program_days: [{ id: 'd1' }, { id: 'd2' }],
      program_day_items: [
        { exercise_id: 'e1', target_sets: 4, target_reps: '8-12', target_weight: 100, target_rpe: 8 },
      ],
      exercises: [{ id: 'e1', name: 'Bench Press', primary_muscle_group: 'chest', equipment: 'barbell' }],
      user_profiles: [{ goal: 'hypertrophy', experience_level: 'intermediate', weekly_frequency: 4, equipment: [] }],
      sessions: [],
      logged_sets: [],
      imported_sleep_summaries: [],
      imported_heart_rate_summaries: [],
      imported_activity_snapshots: [],
    });

    const result = (await handler(supabase, 'user-1', {})) as any;
    expect(result.program.name).toBe('PPL');
    expect(Array.isArray(result.findings)).toBe(true);
    // Only chest is trained → missing-major warning expected.
    expect(result.findings.some((f: any) => f.area === 'muscle_balance')).toBe(true);
  });

  it('flags an equipment mismatch from the exercises.equipment column', async () => {
    const handler = getToolHandler('critique_program')!;
    const supabase = mockSupabase({
      programs: [{ id: 'prog-1', name: 'Barbell Split' }],
      program_days: [{ id: 'd1' }],
      program_day_items: [
        { exercise_id: 'e1', target_sets: 4, target_reps: '5', target_weight: 100, target_rpe: 8 },
      ],
      // Exercise requires a barbell...
      exercises: [{ id: 'e1', name: 'Back Squat', primary_muscle_group: 'quads', equipment: 'barbell' }],
      // ...but the user only has dumbbells.
      user_profiles: [{ goal: 'strength', experience_level: 'intermediate', weekly_frequency: 1, equipment: ['dumbbells'] }],
      sessions: [],
      logged_sets: [],
      imported_sleep_summaries: [],
      imported_heart_rate_summaries: [],
      imported_activity_snapshots: [],
    });

    const result = (await handler(supabase, 'user-1', {})) as any;
    expect(result.findings.some((f: any) => f.area === 'equipment')).toBe(true);
  });
});
