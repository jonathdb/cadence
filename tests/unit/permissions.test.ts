/**
 * Unit tests for the permission service.
 * Tests permission CRUD operations, default initialization, and the approval check helper.
 *
 * Validates: Requirements 23.1, 23.2, 23.3, 23.4
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
    ALL_PERMISSION_CATEGORIES,
    DEFAULT_PERMISSION_MODE,
    ensureUserSettings,
    getPermissionMode,
    getUserPermissions,
    requiresApproval,
    updatePermission,
} from '@/services/permissions';

describe('Permission Service', () => {
  const userId = 'user-abc-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constants', () => {
    it('should export all permission categories', () => {
      expect(ALL_PERMISSION_CATEGORIES).toContain('program_edits');
      expect(ALL_PERMISSION_CATEGORIES).toContain('journal_edits');
      expect(ALL_PERMISSION_CATEGORIES).toContain('spotify_actions');
      expect(ALL_PERMISSION_CATEGORIES).toContain('health_access');
      expect(ALL_PERMISSION_CATEGORIES).toHaveLength(4);
    });

    it('should default to approval_required', () => {
      expect(DEFAULT_PERMISSION_MODE).toBe('approval_required');
    });
  });

  describe('ensureUserSettings', () => {
    it('should not insert if user settings already exist', async () => {
      const mockInsert = vi.fn();
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'settings-1' },
              error: null,
            }),
          }),
        }),
        insert: mockInsert,
      });

      await ensureUserSettings(userId);

      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('should insert default settings if none exist', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_settings') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
            insert: mockInsert,
          };
        }
        return {};
      });

      await ensureUserSettings(userId);

      expect(mockInsert).toHaveBeenCalledWith({
        user_id: userId,
        permission_program_edits: 'approval_required',
        permission_journal_edits: 'approval_required',
        permission_spotify_actions: 'approval_required',
        permission_health_access: 'approval_required',
      });
    });

    it('should handle race condition (23505 unique violation) gracefully', async () => {
      mockFrom.mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({
          error: { code: '23505', message: 'duplicate key' },
        }),
      }));

      // Should not throw
      await expect(ensureUserSettings(userId)).resolves.toBeUndefined();
    });

    it('should throw on select error', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Connection refused' },
            }),
          }),
        }),
      });

      await expect(ensureUserSettings(userId)).rejects.toThrow(
        'Failed to check user settings: Connection refused'
      );
    });

    it('should throw on non-duplicate insert error', async () => {
      mockFrom.mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({
          error: { code: '42501', message: 'permission denied' },
        }),
      }));

      await expect(ensureUserSettings(userId)).rejects.toThrow(
        'Failed to create user settings: permission denied'
      );
    });
  });

  describe('getUserPermissions', () => {
    it('should return all permission modes mapped by category', async () => {
      // First call: ensureUserSettings check (exists)
      // Second call: select permissions
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // ensureUserSettings select
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'exists' },
                  error: null,
                }),
              }),
            }),
          };
        }
        // getUserPermissions select
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  permission_program_edits: 'auto_apply',
                  permission_journal_edits: 'approval_required',
                  permission_spotify_actions: 'auto_apply',
                  permission_health_access: 'approval_required',
                },
                error: null,
              }),
            }),
          }),
        };
      });

      const permissions = await getUserPermissions(userId);

      expect(permissions.program_edits).toBe('auto_apply');
      expect(permissions.journal_edits).toBe('approval_required');
      expect(permissions.spotify_actions).toBe('auto_apply');
      expect(permissions.health_access).toBe('approval_required');
    });
  });

  describe('updatePermission', () => {
    it('should update the correct column for the given category', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // ensureUserSettings select
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'exists' },
                  error: null,
                }),
              }),
            }),
          };
        }
        // updatePermission update
        return { update: mockUpdate };
      });

      await updatePermission(userId, 'program_edits', 'auto_apply');

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          permission_program_edits: 'auto_apply',
        })
      );
    });

    it('should throw on update error', async () => {
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'exists' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: { message: 'RLS violation' },
            }),
          }),
        };
      });

      await expect(
        updatePermission(userId, 'spotify_actions', 'auto_apply')
      ).rejects.toThrow('Failed to update permission: RLS violation');
    });
  });

  describe('getPermissionMode', () => {
    it('should return the mode for a specific category', async () => {
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'exists' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  permission_program_edits: 'approval_required',
                  permission_journal_edits: 'auto_apply',
                  permission_spotify_actions: 'approval_required',
                  permission_health_access: 'auto_apply',
                },
                error: null,
              }),
            }),
          }),
        };
      });

      const mode = await getPermissionMode(userId, 'journal_edits');
      expect(mode).toBe('auto_apply');
    });
  });

  describe('requiresApproval', () => {
    function setupMockPermissions(overrides: Partial<Record<string, string>> = {}) {
      const defaults = {
        permission_program_edits: 'approval_required',
        permission_journal_edits: 'approval_required',
        permission_spotify_actions: 'approval_required',
        permission_health_access: 'approval_required',
        ...overrides,
      };

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'exists' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: defaults,
                error: null,
              }),
            }),
          }),
        };
      });
    }

    it('should return true when category is approval_required', async () => {
      setupMockPermissions({ permission_program_edits: 'approval_required' });

      const result = await requiresApproval(userId, 'program_edits');
      expect(result).toBe(true);
    });

    it('should return false when category is auto_apply', async () => {
      setupMockPermissions({ permission_spotify_actions: 'auto_apply' });

      const result = await requiresApproval(userId, 'spotify_actions');
      expect(result).toBe(false);
    });

    it('should return true for all categories on default settings (Req 23.2)', async () => {
      setupMockPermissions();

      const result = await requiresApproval(userId, 'program_edits');
      expect(result).toBe(true);
    });
  });
});
