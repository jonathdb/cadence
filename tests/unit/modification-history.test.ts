/**
 * Unit tests for the modification history service.
 * Tests recording modifications, retrieving history, and capturing state.
 *
 * Validates: Requirements 5.3, 6.2
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Supabase before importing the service
const mockFrom = vi.fn();
vi.mock('@/utils/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import {
    captureState,
    getModificationHistory,
    recordModification,
} from '@/services/modification-history';

describe('Modification History Service', () => {
  const programId = 'program-abc-123';
  const userId = 'user-xyz-789';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordModification', () => {
    it('should insert a modification entry and return it', async () => {
      const mockEntry = {
        id: 'mod-1',
        program_id: programId,
        user_id: userId,
        change_type: 'exercise_added',
        before_state: { exercises: [] },
        after_state: { exercises: [{ id: 'ex-1', name: 'Squat' }] },
        source: 'user',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockEntry,
              error: null,
            }),
          }),
        }),
      });

      const result = await recordModification({
        programId,
        userId,
        changeType: 'exercise_added',
        beforeState: { exercises: [] },
        afterState: { exercises: [{ id: 'ex-1', name: 'Squat' }] },
        source: 'user',
      });

      expect(result).toEqual(mockEntry);
      expect(mockFrom).toHaveBeenCalledWith('modification_history');
    });

    it('should record agent-initiated modifications', async () => {
      const mockEntry = {
        id: 'mod-2',
        program_id: programId,
        user_id: userId,
        change_type: 'program_restructured',
        before_state: { name: 'Old Plan' },
        after_state: { name: 'New Plan' },
        source: 'agent',
        created_at: '2024-01-02T00:00:00Z',
      };

      mockFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockEntry,
              error: null,
            }),
          }),
        }),
      });

      const result = await recordModification({
        programId,
        userId,
        changeType: 'program_restructured',
        beforeState: { name: 'Old Plan' },
        afterState: { name: 'New Plan' },
        source: 'agent',
      });

      expect(result.source).toBe('agent');
      expect(result.change_type).toBe('program_restructured');
    });

    it('should throw an error if insert fails', async () => {
      mockFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database error' },
            }),
          }),
        }),
      });

      await expect(
        recordModification({
          programId,
          userId,
          changeType: 'exercise_removed',
          beforeState: {},
          afterState: {},
          source: 'user',
        })
      ).rejects.toThrow('Failed to record modification: Database error');
    });
  });

  describe('getModificationHistory', () => {
    it('should return modification entries sorted by created_at descending', async () => {
      const mockEntries = [
        {
          id: 'mod-2',
          program_id: programId,
          user_id: userId,
          change_type: 'sets_updated',
          before_state: {},
          after_state: {},
          source: 'user',
          created_at: '2024-01-02T00:00:00Z',
        },
        {
          id: 'mod-1',
          program_id: programId,
          user_id: userId,
          change_type: 'exercise_added',
          before_state: {},
          after_state: {},
          source: 'agent',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockEntries,
              error: null,
            }),
          }),
        }),
      });

      const result = await getModificationHistory(programId);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('mod-2');
      expect(result[1].id).toBe('mod-1');
      expect(mockFrom).toHaveBeenCalledWith('modification_history');
    });

    it('should return empty array when no history exists', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      });

      const result = await getModificationHistory(programId);

      expect(result).toEqual([]);
    });

    it('should throw an error if query fails', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Connection lost' },
            }),
          }),
        }),
      });

      await expect(getModificationHistory(programId)).rejects.toThrow(
        'Failed to fetch modification history: Connection lost'
      );
    });
  });

  describe('captureState', () => {
    it('should capture full program state with days and items', async () => {
      const mockProgram = {
        id: programId,
        user_id: userId,
        name: 'Push Pull Legs',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockDays = [
        { id: 'day-1', program_id: programId, day_number: 1, name: 'Push Day' },
        { id: 'day-2', program_id: programId, day_number: 2, name: 'Pull Day' },
      ];

      const mockItems = [
        {
          id: 'item-1',
          program_day_id: 'day-1',
          exercise_id: 'ex-1',
          type: 'exercise',
          order_index: 0,
          target_sets: 3,
          target_reps: '8-12',
        },
        {
          id: 'item-2',
          program_day_id: 'day-2',
          exercise_id: 'ex-2',
          type: 'exercise',
          order_index: 0,
          target_sets: 4,
          target_reps: '6-8',
        },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'programs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockProgram,
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'program_days') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockDays,
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'program_day_items') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockItems,
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const state = await captureState(programId);

      expect(state.id).toBe(programId);
      expect(state.name).toBe('Push Pull Legs');
      expect(state.program_days).toHaveLength(2);

      const days = state.program_days as Array<{ name: string; items: unknown[] }>;
      expect(days[0].name).toBe('Push Day');
      expect(days[0].items).toHaveLength(1);
      expect(days[1].name).toBe('Pull Day');
      expect(days[1].items).toHaveLength(1);
    });

    it('should handle program with no days', async () => {
      const mockProgram = {
        id: programId,
        user_id: userId,
        name: 'Empty Program',
        status: 'draft',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'programs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockProgram,
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'program_days') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const state = await captureState(programId);

      expect(state.name).toBe('Empty Program');
      expect(state.program_days).toEqual([]);
    });

    it('should throw if program is not found', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'programs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Row not found' },
                }),
              }),
            }),
          };
        }
        return {};
      });

      await expect(captureState(programId)).rejects.toThrow(
        'Failed to capture program state: Row not found'
      );
    });

    it('should throw if fetching days fails', async () => {
      const mockProgram = {
        id: programId,
        user_id: userId,
        name: 'Test',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'programs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockProgram,
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'program_days') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Query timeout' },
                }),
              }),
            }),
          };
        }
        return {};
      });

      await expect(captureState(programId)).rejects.toThrow(
        'Failed to capture program days: Query timeout'
      );
    });
  });
});
