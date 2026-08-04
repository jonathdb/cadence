/**
 * Unit tests for the audit log service.
 * Tests recording audit entries, retrieval with pagination/filtering, and single entry lookup.
 *
 * Validates: Requirements 24.1, 24.2, 24.3
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Supabase before importing the service
const mockFrom = vi.fn();
vi.mock('@/utils/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import type { RecordAuditEntryParams } from '@/services/audit-log';
import {
    getAuditEntryById,
    getAuditLog,
    recordAuditEntry,
} from '@/services/audit-log';

describe('Audit Log Service', () => {
  const userId = 'user-audit-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordAuditEntry', () => {
    const baseParams: RecordAuditEntryParams = {
      userId,
      actionType: 'program_create',
      permissionCategory: 'program_edits',
      parameters: { name: 'PPL Program', days: 6 },
      approvalStatus: 'approved',
      outcome: 'success',
    };

    it('should insert an audit entry with all required fields (Req 24.1, 24.2)', async () => {
      const mockInsertResult = {
        id: 'audit-entry-1',
        user_id: userId,
        timestamp: '2024-01-15T10:00:00.000Z',
        action_type: 'program_create',
        permission_category: 'program_edits',
        parameters: { name: 'PPL Program', days: 6 },
        approval_status: 'approved',
        outcome: 'success',
        error_message: null,
      };

      const mockSingle = vi.fn().mockResolvedValue({ data: mockInsertResult, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockFrom.mockReturnValue({ insert: mockInsert });

      const result = await recordAuditEntry(baseParams);

      expect(mockFrom).toHaveBeenCalledWith('audit_log');
      expect(mockInsert).toHaveBeenCalledWith({
        user_id: userId,
        action_type: 'program_create',
        permission_category: 'program_edits',
        parameters: { name: 'PPL Program', days: 6 },
        approval_status: 'approved',
        outcome: 'success',
        error_message: null,
      });
      expect(result).toEqual(mockInsertResult);
    });

    it('should record a failed outcome with error message (Req 24.1)', async () => {
      const failedParams: RecordAuditEntryParams = {
        ...baseParams,
        outcome: 'failure',
        errorMessage: 'Insufficient permissions',
      };

      const mockInsertResult = {
        id: 'audit-entry-2',
        user_id: userId,
        timestamp: '2024-01-15T10:05:00.000Z',
        action_type: 'program_create',
        permission_category: 'program_edits',
        parameters: { name: 'PPL Program', days: 6 },
        approval_status: 'approved',
        outcome: 'failure',
        error_message: 'Insufficient permissions',
      };

      const mockSingle = vi.fn().mockResolvedValue({ data: mockInsertResult, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockFrom.mockReturnValue({ insert: mockInsert });

      const result = await recordAuditEntry(failedParams);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'failure',
          error_message: 'Insufficient permissions',
        })
      );
      expect(result.error_message).toBe('Insufficient permissions');
    });

    it('should record rejected tool calls (Req 24.1)', async () => {
      const rejectedParams: RecordAuditEntryParams = {
        ...baseParams,
        approvalStatus: 'rejected',
        outcome: 'failure',
        errorMessage: 'User rejected the action',
      };

      const mockInsertResult = {
        id: 'audit-entry-3',
        user_id: userId,
        timestamp: '2024-01-15T10:10:00.000Z',
        action_type: 'program_create',
        permission_category: 'program_edits',
        parameters: { name: 'PPL Program', days: 6 },
        approval_status: 'rejected',
        outcome: 'failure',
        error_message: 'User rejected the action',
      };

      const mockSingle = vi.fn().mockResolvedValue({ data: mockInsertResult, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockFrom.mockReturnValue({ insert: mockInsert });

      const result = await recordAuditEntry(rejectedParams);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          approval_status: 'rejected',
        })
      );
      expect(result.approval_status).toBe('rejected');
    });

    it('should record auto_applied tool calls (Req 24.1)', async () => {
      const autoAppliedParams: RecordAuditEntryParams = {
        ...baseParams,
        approvalStatus: 'auto_applied',
      };

      const mockInsertResult = {
        id: 'audit-entry-4',
        user_id: userId,
        timestamp: '2024-01-15T10:15:00.000Z',
        action_type: 'program_create',
        permission_category: 'program_edits',
        parameters: { name: 'PPL Program', days: 6 },
        approval_status: 'auto_applied',
        outcome: 'success',
        error_message: null,
      };

      const mockSingle = vi.fn().mockResolvedValue({ data: mockInsertResult, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockFrom.mockReturnValue({ insert: mockInsert });

      const result = await recordAuditEntry(autoAppliedParams);

      expect(result.approval_status).toBe('auto_applied');
    });

    it('should throw on insert error', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database connection lost' },
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockFrom.mockReturnValue({ insert: mockInsert });

      await expect(recordAuditEntry(baseParams)).rejects.toThrow(
        'Failed to record audit entry: Database connection lost'
      );
    });

    it('should set error_message to null when not provided', async () => {
      const mockInsertResult = {
        id: 'audit-entry-5',
        user_id: userId,
        timestamp: '2024-01-15T10:20:00.000Z',
        action_type: 'program_create',
        permission_category: 'program_edits',
        parameters: { name: 'PPL Program', days: 6 },
        approval_status: 'approved',
        outcome: 'success',
        error_message: null,
      };

      const mockSingle = vi.fn().mockResolvedValue({ data: mockInsertResult, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockFrom.mockReturnValue({ insert: mockInsert });

      await recordAuditEntry(baseParams);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ error_message: null })
      );
    });
  });

  describe('getAuditLog', () => {
    it('should retrieve audit log entries for a user ordered by timestamp desc (Req 24.2)', async () => {
      const mockEntries = [
        {
          id: 'entry-2',
          user_id: userId,
          timestamp: '2024-01-15T11:00:00.000Z',
          action_type: 'journal_draft',
          permission_category: 'journal_edits',
          parameters: { session_id: 'session-1' },
          approval_status: 'auto_applied',
          outcome: 'success',
          error_message: null,
        },
        {
          id: 'entry-1',
          user_id: userId,
          timestamp: '2024-01-15T10:00:00.000Z',
          action_type: 'program_create',
          permission_category: 'program_edits',
          parameters: { name: 'PPL' },
          approval_status: 'approved',
          outcome: 'success',
          error_message: null,
        },
      ];

      const mockRange = vi.fn().mockResolvedValue({ data: mockEntries, error: null });
      const mockOrder = vi.fn().mockReturnValue({ range: mockRange });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await getAuditLog(userId);

      expect(mockFrom).toHaveBeenCalledWith('audit_log');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('user_id', userId);
      expect(mockOrder).toHaveBeenCalledWith('timestamp', { ascending: false });
      expect(mockRange).toHaveBeenCalledWith(0, 19); // default limit=20, offset=0
      expect(result).toEqual(mockEntries);
      expect(result).toHaveLength(2);
    });

    it('should apply custom limit and offset for pagination', async () => {
      const mockRange = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockOrder = vi.fn().mockReturnValue({ range: mockRange });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ select: mockSelect });

      await getAuditLog(userId, { limit: 10, offset: 20 });

      expect(mockRange).toHaveBeenCalledWith(20, 29); // offset=20, limit=10
    });

    it('should apply date filters when fromDate is provided', async () => {
      const mockGte = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockRange = vi.fn().mockReturnValue({ gte: mockGte });
      const mockOrder = vi.fn().mockReturnValue({ range: mockRange });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ select: mockSelect });

      await getAuditLog(userId, { fromDate: '2024-01-01T00:00:00.000Z' });

      expect(mockGte).toHaveBeenCalledWith('timestamp', '2024-01-01T00:00:00.000Z');
    });

    it('should apply date filters when toDate is provided', async () => {
      const mockLte = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockRange = vi.fn().mockReturnValue({ lte: mockLte });
      const mockOrder = vi.fn().mockReturnValue({ range: mockRange });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ select: mockSelect });

      await getAuditLog(userId, { toDate: '2024-01-31T23:59:59.000Z' });

      expect(mockLte).toHaveBeenCalledWith('timestamp', '2024-01-31T23:59:59.000Z');
    });

    it('should apply both fromDate and toDate filters', async () => {
      const mockLte = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockGte = vi.fn().mockReturnValue({ lte: mockLte });
      const mockRange = vi.fn().mockReturnValue({ gte: mockGte });
      const mockOrder = vi.fn().mockReturnValue({ range: mockRange });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ select: mockSelect });

      await getAuditLog(userId, {
        fromDate: '2024-01-01T00:00:00.000Z',
        toDate: '2024-01-31T23:59:59.000Z',
      });

      expect(mockGte).toHaveBeenCalledWith('timestamp', '2024-01-01T00:00:00.000Z');
      expect(mockLte).toHaveBeenCalledWith('timestamp', '2024-01-31T23:59:59.000Z');
    });

    it('should return empty array when no entries exist', async () => {
      const mockRange = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockOrder = vi.fn().mockReturnValue({ range: mockRange });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await getAuditLog(userId);

      expect(result).toEqual([]);
    });

    it('should return empty array when data is null', async () => {
      const mockRange = vi.fn().mockResolvedValue({ data: null, error: null });
      const mockOrder = vi.fn().mockReturnValue({ range: mockRange });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await getAuditLog(userId);

      expect(result).toEqual([]);
    });

    it('should throw on query error', async () => {
      const mockRange = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Query timeout' },
      });
      const mockOrder = vi.fn().mockReturnValue({ range: mockRange });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ select: mockSelect });

      await expect(getAuditLog(userId)).rejects.toThrow(
        'Failed to retrieve audit log: Query timeout'
      );
    });
  });

  describe('getAuditEntryById', () => {
    it('should retrieve a single audit entry by ID scoped to user', async () => {
      const mockEntry = {
        id: 'audit-entry-1',
        user_id: userId,
        timestamp: '2024-01-15T10:00:00.000Z',
        action_type: 'program_create',
        permission_category: 'program_edits',
        parameters: { name: 'PPL Program' },
        approval_status: 'approved',
        outcome: 'success',
        error_message: null,
      };

      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: mockEntry, error: null });
      const mockEqId = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockEqUser = vi.fn().mockReturnValue({ eq: mockEqId });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqUser });
      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await getAuditEntryById(userId, 'audit-entry-1');

      expect(mockFrom).toHaveBeenCalledWith('audit_log');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEqUser).toHaveBeenCalledWith('user_id', userId);
      expect(mockEqId).toHaveBeenCalledWith('id', 'audit-entry-1');
      expect(result).toEqual(mockEntry);
    });

    it('should return null when entry is not found', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      const mockEqId = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockEqUser = vi.fn().mockReturnValue({ eq: mockEqId });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqUser });
      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await getAuditEntryById(userId, 'non-existent-id');

      expect(result).toBeNull();
    });

    it('should throw on query error', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Permission denied' },
      });
      const mockEqId = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockEqUser = vi.fn().mockReturnValue({ eq: mockEqId });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqUser });
      mockFrom.mockReturnValue({ select: mockSelect });

      await expect(getAuditEntryById(userId, 'audit-entry-1')).rejects.toThrow(
        'Failed to retrieve audit entry: Permission denied'
      );
    });
  });
});
