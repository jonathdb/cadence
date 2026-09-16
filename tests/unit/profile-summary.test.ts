/**
 * Unit tests for buildProfileSummary (Task 6): formatting, truncation, and
 * inclusion/omission based on whether a profile carries usable data.
 */
import { describe, expect, it } from 'vitest';

import {
    buildProfileSummary,
    composeSystemPrompt,
    isProfileEmpty,
    type ProfileRow
} from '../../supabase/functions/_shared/profile-summary.ts';

function row(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    goal: null,
    experience_level: null,
    bodyweight: null,
    bodyweight_unit: 'kg',
    injuries: null,
    equipment: null,
    preferred_training_days: null,
    weekly_frequency: null,
    training_notes: null,
    ...overrides,
  };
}

describe('isProfileEmpty', () => {
  it('treats null/undefined as empty', () => {
    expect(isProfileEmpty(null)).toBe(true);
    expect(isProfileEmpty(undefined)).toBe(true);
  });

  it('treats an all-null profile as empty', () => {
    expect(isProfileEmpty(row())).toBe(true);
  });

  it('treats a profile with any field set as non-empty', () => {
    expect(isProfileEmpty(row({ goal: 'strength' }))).toBe(false);
    expect(isProfileEmpty(row({ equipment: ['barbell'] }))).toBe(false);
  });
});

describe('buildProfileSummary', () => {
  it('returns an empty string for an empty profile (omission)', () => {
    expect(buildProfileSummary(null)).toBe('');
    expect(buildProfileSummary(row())).toBe('');
  });

  it('includes a profile block when data exists (inclusion)', () => {
    const summary = buildProfileSummary(
      row({
        goal: 'hypertrophy',
        experience_level: 'intermediate',
        bodyweight: 80,
        bodyweight_unit: 'kg',
        weekly_frequency: 4,
        equipment: ['dumbbells', 'barbell'],
        injuries: 'Left shoulder impingement',
      })
    );
    expect(summary).toContain('USER TRAINING PROFILE:');
    expect(summary).toContain('Primary goal: hypertrophy');
    expect(summary).toContain('Experience level: intermediate');
    expect(summary).toContain('Bodyweight: 80 kg');
    expect(summary).toContain('4 sessions/week');
    expect(summary).toContain('dumbbells, barbell');
    expect(summary).toContain('Left shoulder impingement');
    // Guidance is always included when a profile exists.
    expect(summary).toContain('Profile guidance:');
    expect(summary).toContain('respect');
  });

  it('humanizes underscored goal and equipment tokens', () => {
    const summary = buildProfileSummary(
      row({ goal: 'general_fitness', equipment: ['resistance_bands', 'pull_up_bar'] })
    );
    expect(summary).toContain('general fitness');
    expect(summary).toContain('resistance bands');
    expect(summary).toContain('pull up bar');
  });

  it('truncates very long injuries and notes with an ellipsis', () => {
    const longInjuries = 'A'.repeat(1000);
    const longNotes = 'B'.repeat(1000);
    const summary = buildProfileSummary(row({ injuries: longInjuries, training_notes: longNotes }));
    expect(summary).toContain('…');
    // The 1000-char blobs must not appear in full.
    expect(summary).not.toContain('A'.repeat(1000));
    expect(summary).not.toContain('B'.repeat(1000));
  });
});

describe('composeSystemPrompt (prompt assembly)', () => {
  const base = 'BASE PROMPT';

  it('appends the profile summary when present (inclusion)', () => {
    const summary = buildProfileSummary(row({ goal: 'strength' }));
    const composed = composeSystemPrompt(base, summary);
    expect(composed.startsWith(base)).toBe(true);
    expect(composed).toContain('USER TRAINING PROFILE:');
    expect(composed).toContain('Primary goal: strength');
  });

  it('returns the base prompt unchanged when there is no profile (omission)', () => {
    const summary = buildProfileSummary(null);
    const composed = composeSystemPrompt(base, summary);
    expect(composed).toBe(base);
    expect(composed).not.toContain('USER TRAINING PROFILE:');
  });
});
