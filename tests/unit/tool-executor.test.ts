/**
 * Unit tests for the tool-call execution framework.
 * Tests permission gating, audit logging, and execution flow.
 *
 * Validates: Requirements 2.3, 2.4, 23.1, 23.3, 23.4, 24.1
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    executeToolCall,
    getPermissionCategory,
    type ToolCallRequest,
} from '../../supabase/functions/_shared/tool-executor.ts';
import { registerToolHandler } from '../../supabase/functions/_shared/tool-handlers.ts';

// --- Mock Supabase Client ---

function createMockSupabase(settings: Record<string, string> | null = null) {
  const insertedRows: Record<string, unknown>[] = [];

  const mockClient = {
    from: vi.fn((table: string) => {
      if (table === 'user_settings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: settings,
                error: settings ? null : { message: 'Not found' },
              }),
            }),
          }),
        };
      }
      if (table === 'audit_log') {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            insertedRows.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }),
    _insertedRows: insertedRows,
  };

  return mockClient as unknown as ReturnType<typeof createMockSupabase> & {
    from: ReturnType<typeof vi.fn>;
    _insertedRows: Record<string, unknown>[];
  };
}

describe('Tool Executor', () => {
  const userId = 'test-user-123';

  describe('getPermissionCategory', () => {
    it('returns program_edits for program tools', () => {
      expect(getPermissionCategory('program_create')).toBe('program_edits');
      expect(getPermissionCategory('program_modify')).toBe('program_edits');
      expect(getPermissionCategory('program_activate')).toBe('program_edits');
    });

    it('returns journal_edits for journal tools', () => {
      expect(getPermissionCategory('journal_draft')).toBe('journal_edits');
    });

    it('returns spotify_actions for spotify tools', () => {
      expect(getPermissionCategory('spotify_search_playlist')).toBe(
        'spotify_actions'
      );
      expect(getPermissionCategory('spotify_create_playlist')).toBe(
        'spotify_actions'
      );
      expect(getPermissionCategory('spotify_modify_playlist')).toBe(
        'spotify_actions'
      );
    });

    it('returns health_access for health tools', () => {
      expect(getPermissionCategory('get_recovery_summary')).toBe(
        'health_access'
      );
      expect(getPermissionCategory('get_recent_workouts_summary')).toBe(
        'health_access'
      );
    });

    it('returns undefined for unknown tools', () => {
      expect(getPermissionCategory('unknown_tool')).toBeUndefined();
    });
  });

  describe('executeToolCall - approval_required mode', () => {
    it('returns pending_approval without executing when permission is approval_required', async () => {
      const supabase = createMockSupabase({
        permission_program_edits: 'approval_required',
      });

      const request: ToolCallRequest = {
        id: 'tc-1',
        name: 'program_create',
        arguments: { name: 'Test Program' },
      };

      const result = await executeToolCall(supabase as any, userId, request);

      expect(result.id).toBe('tc-1');
      expect(result.name).toBe('program_create');
      expect(result.status).toBe('pending_approval');
      expect(result.category).toBe('program_edits');
      expect(result.result).toBeUndefined();
    });

    it('defaults to approval_required when no user_settings record exists', async () => {
      const supabase = createMockSupabase(null);

      const request: ToolCallRequest = {
        id: 'tc-2',
        name: 'journal_draft',
        arguments: { content: 'Great session' },
      };

      const result = await executeToolCall(supabase as any, userId, request);

      expect(result.status).toBe('pending_approval');
      expect(result.category).toBe('journal_edits');
    });
  });

  describe('executeToolCall - auto_apply mode', () => {
    beforeEach(() => {
      // Register a test handler that succeeds
      registerToolHandler('program_create', async (_sb, _uid, args) => {
        return { programId: 'new-prog-1', name: args.name };
      });
    });

    it('executes the tool and returns auto_applied when permission is auto_apply', async () => {
      const supabase = createMockSupabase({
        permission_program_edits: 'auto_apply',
      });

      const request: ToolCallRequest = {
        id: 'tc-3',
        name: 'program_create',
        arguments: { name: 'Auto Program' },
      };

      const result = await executeToolCall(supabase as any, userId, request);

      expect(result.id).toBe('tc-3');
      expect(result.name).toBe('program_create');
      expect(result.status).toBe('auto_applied');
      expect(result.category).toBe('program_edits');
      expect(result.result).toEqual({
        programId: 'new-prog-1',
        name: 'Auto Program',
      });
      expect(result.error).toBeUndefined();
    });

    it('returns error when handler throws', async () => {
      registerToolHandler('program_modify', async () => {
        throw new Error('Database constraint violation');
      });

      const supabase = createMockSupabase({
        permission_program_edits: 'auto_apply',
      });

      const request: ToolCallRequest = {
        id: 'tc-4',
        name: 'program_modify',
        arguments: { programId: 'prog-1', changes: {} },
      };

      const result = await executeToolCall(supabase as any, userId, request);

      expect(result.status).toBe('auto_applied');
      expect(result.error).toBe('Database constraint violation');
      expect(result.result).toBeUndefined();
    });
  });

  describe('executeToolCall - unknown tool', () => {
    it('returns error for unrecognized tool names', async () => {
      const supabase = createMockSupabase(null);

      const request: ToolCallRequest = {
        id: 'tc-5',
        name: 'nonexistent_tool',
        arguments: {},
      };

      const result = await executeToolCall(supabase as any, userId, request);

      expect(result.error).toContain('Unknown tool');
    });
  });

  describe('executeToolCall - audit logging', () => {
    it('logs to audit_log on successful auto_apply', async () => {
      registerToolHandler('program_create', async () => ({ id: 'p1' }));

      const supabase = createMockSupabase({
        permission_program_edits: 'auto_apply',
      });

      const request: ToolCallRequest = {
        id: 'tc-6',
        name: 'program_create',
        arguments: { name: 'Logged Program' },
      };

      await executeToolCall(supabase as any, userId, request);

      // Verify audit_log insert was called
      expect(supabase.from).toHaveBeenCalledWith('audit_log');
    });

    it('logs to audit_log on pending_approval', async () => {
      const supabase = createMockSupabase({
        permission_spotify_actions: 'approval_required',
      });

      const request: ToolCallRequest = {
        id: 'tc-7',
        name: 'spotify_create_playlist',
        arguments: { name: 'Workout Jams' },
      };

      await executeToolCall(supabase as any, userId, request);

      expect(supabase.from).toHaveBeenCalledWith('audit_log');
    });

    it('logs to audit_log on execution failure', async () => {
      registerToolHandler('spotify_modify_playlist', async () => {
        throw new Error('Spotify API error');
      });

      const supabase = createMockSupabase({
        permission_spotify_actions: 'auto_apply',
      });

      const request: ToolCallRequest = {
        id: 'tc-8',
        name: 'spotify_modify_playlist',
        arguments: { playlistId: 'sp-1' },
      };

      await executeToolCall(supabase as any, userId, request);

      expect(supabase.from).toHaveBeenCalledWith('audit_log');
    });
  });

  describe('executeToolCall - health_access category', () => {
    it('handles health_access permission correctly', async () => {
      registerToolHandler('get_recovery_summary', async () => ({
        sleepHours: 7.5,
        hrv: 45,
      }));

      const supabase = createMockSupabase({
        permission_health_access: 'auto_apply',
      });

      const request: ToolCallRequest = {
        id: 'tc-9',
        name: 'get_recovery_summary',
        arguments: { days: 7 },
      };

      const result = await executeToolCall(supabase as any, userId, request);

      expect(result.status).toBe('auto_applied');
      expect(result.category).toBe('health_access');
      expect(result.result).toEqual({ sleepHours: 7.5, hrv: 45 });
    });
  });
});
