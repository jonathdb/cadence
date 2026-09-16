/**
 * Tests for the profile form's shared numeric parsing/validation helper (Task 5)
 * and the load → edit → save data flow the screen relies on.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseProfileNumerics } from '@/types/profile';

describe('parseProfileNumerics', () => {
  it('treats empty strings as null', () => {
    const r = parseProfileNumerics({ bodyweight: '', weeklyFrequency: '' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bodyweight).toBeNull();
      expect(r.weeklyFrequency).toBeNull();
    }
  });

  it('parses valid values', () => {
    const r = parseProfileNumerics({ bodyweight: '82.5', weeklyFrequency: '4' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bodyweight).toBe(82.5);
      expect(r.weeklyFrequency).toBe(4);
    }
  });

  it('rejects a non-positive or too-large bodyweight', () => {
    expect(parseProfileNumerics({ bodyweight: '0', weeklyFrequency: '' }).ok).toBe(false);
    expect(parseProfileNumerics({ bodyweight: '1500', weeklyFrequency: '' }).ok).toBe(false);
    expect(parseProfileNumerics({ bodyweight: 'abc', weeklyFrequency: '' }).ok).toBe(false);
  });

  it('rejects out-of-range weekly frequency', () => {
    expect(parseProfileNumerics({ bodyweight: '', weeklyFrequency: '0' }).ok).toBe(false);
    expect(parseProfileNumerics({ bodyweight: '', weeklyFrequency: '15' }).ok).toBe(false);
  });
});

// --- load → edit → save flow against the mocked profile service ---

const mockFrom = vi.fn();
vi.mock('@/utils/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { getUserProfile, updateUserProfile } from '@/services/profile';

describe('profile load → edit → save flow', () => {
  const userId = 'user-1';

  beforeEach(() => vi.clearAllMocks());

  it('loads a profile, then saves an edited goal', async () => {
    const stored = {
      id: 'p-1', user_id: userId, goal: 'general_fitness', experience_level: 'beginner',
      bodyweight: null, bodyweight_unit: 'kg', injuries: null, equipment: [],
      preferred_training_days: [], weekly_frequency: null, training_notes: null,
      created_at: null, updated_at: null,
    };

    // getUserProfile: ensure (maybeSingle exists) then single returns stored
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p-1' }, error: null }),
          single: vi.fn().mockResolvedValue({ data: stored, error: null }),
        }),
      }),
      insert: vi.fn(),
    }));

    const loaded = await getUserProfile(userId);
    expect(loaded.goal).toBe('general_fitness');

    // Now the "edit + save": update returns the new goal
    const updated = { ...stored, goal: 'hypertrophy' };
    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: updated, error: null }),
        }),
      }),
    });
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p-1' }, error: null }),
        }),
      }),
      insert: vi.fn(),
      update: updateSpy,
    }));

    const result = await updateUserProfile(userId, { goal: 'hypertrophy' });
    expect(result.goal).toBe('hypertrophy');
    expect(updateSpy.mock.calls[0][0].goal).toBe('hypertrophy');
  });
});
