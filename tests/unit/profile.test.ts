/**
 * Unit tests for the profile service (Task 4).
 * Covers ensureUserProfile, getUserProfile, and updateUserProfile.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/utils/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import {
  ensureUserProfile,
  getUserProfile,
  updateUserProfile,
} from '@/services/profile';

const userId = 'user-abc-123';

const sampleProfile = {
  id: 'p-1',
  user_id: userId,
  goal: 'hypertrophy',
  experience_level: 'intermediate',
  bodyweight: 80,
  bodyweight_unit: 'kg',
  injuries: 'Left shoulder impingement',
  equipment: ['dumbbells', 'barbell'],
  preferred_training_days: ['mon', 'wed', 'fri'],
  weekly_frequency: 3,
  training_notes: 'Prefer compound lifts.',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('Profile Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ensureUserProfile', () => {
    it('does not insert when a profile already exists', async () => {
      const mockInsert = vi.fn();
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p-1' }, error: null }),
          }),
        }),
        insert: mockInsert,
      });

      await ensureUserProfile(userId);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('inserts an empty profile when none exists', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        insert: mockInsert,
      });

      await ensureUserProfile(userId);
      expect(mockInsert).toHaveBeenCalledWith({ user_id: userId });
    });

    it('swallows a unique-violation race on insert', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: { code: '23505', message: 'dup' } });
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        insert: mockInsert,
      });

      await expect(ensureUserProfile(userId)).resolves.toBeUndefined();
    });

    it('throws on a non-race insert error', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: { code: '42501', message: 'RLS' } });
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        insert: mockInsert,
      });

      await expect(ensureUserProfile(userId)).rejects.toThrow('Failed to create user profile');
    });
  });

  describe('getUserProfile', () => {
    it('returns the profile row', async () => {
      mockFrom.mockImplementation(() => ({
        // ensureUserProfile select → existing
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p-1' }, error: null }),
            single: vi.fn().mockResolvedValue({ data: sampleProfile, error: null }),
          }),
        }),
        insert: vi.fn(),
      }));

      const result = await getUserProfile(userId);
      expect(result.goal).toBe('hypertrophy');
      expect(result.equipment).toEqual(['dumbbells', 'barbell']);
    });
  });

  describe('updateUserProfile', () => {
    it('applies a partial update and returns the updated profile', async () => {
      const updated = { ...sampleProfile, goal: 'strength' };
      const mockUpdate = vi.fn().mockReturnValue({
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
        update: mockUpdate,
      }));

      const result = await updateUserProfile(userId, { goal: 'strength' });
      expect(result.goal).toBe('strength');
      // update called with the field plus an updated_at timestamp
      const updateArg = mockUpdate.mock.calls[0][0];
      expect(updateArg.goal).toBe('strength');
      expect(updateArg.updated_at).toBeDefined();
    });

    it('throws on update error', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
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
        update: mockUpdate,
      }));

      await expect(updateUserProfile(userId, { goal: 'strength' })).rejects.toThrow(
        'Failed to update user profile'
      );
    });
  });
});
