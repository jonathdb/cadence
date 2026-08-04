/**
 * Audit Log Service
 *
 * Records and retrieves audit log entries for every Agent Tool_Call execution.
 * Every tool call generates an audit entry regardless of outcome (success or failure).
 *
 * Audit entries include:
 * - timestamp
 * - action_type (the tool call type)
 * - permission_category
 * - parameters (the tool call parameters)
 * - approval_status (approved, auto_applied, or rejected)
 * - outcome (success or failure)
 * - error_message (optional, on failure)
 *
 * Validates: Requirements 24.1, 24.2, 24.3
 */

import type { ActionOutcome, ApprovalStatus, PermissionCategory } from '@/types/permissions';
import { supabase } from '@/utils/supabase';

export interface RecordAuditEntryParams {
  userId: string;
  actionType: string;
  permissionCategory: PermissionCategory;
  parameters: Record<string, unknown>;
  approvalStatus: ApprovalStatus;
  outcome: ActionOutcome;
  errorMessage?: string;
}

export interface AuditLogQueryOptions {
  /** Number of entries per page (default: 20) */
  limit?: number;
  /** Offset for pagination (default: 0) */
  offset?: number;
  /** Filter entries from this date (inclusive, ISO string) */
  fromDate?: string;
  /** Filter entries up to this date (inclusive, ISO string) */
  toDate?: string;
}

export interface AuditLogEntryRow {
  id: string;
  user_id: string;
  timestamp: string;
  action_type: string;
  permission_category: string;
  parameters: Record<string, unknown>;
  approval_status: ApprovalStatus;
  outcome: ActionOutcome;
  error_message: string | null;
}

/**
 * Records a single audit log entry for a tool call execution.
 *
 * This function MUST be called for every tool call regardless of outcome,
 * as required by Requirement 24.1.
 *
 * @param params - The audit entry data
 * @returns The created audit log entry
 */
export async function recordAuditEntry(
  params: RecordAuditEntryParams
): Promise<AuditLogEntryRow> {
  const { userId, actionType, permissionCategory, parameters, approvalStatus, outcome, errorMessage } = params;

  const { data, error } = await supabase
    .from('audit_log')
    .insert({
      user_id: userId,
      action_type: actionType,
      permission_category: permissionCategory,
      parameters,
      approval_status: approvalStatus,
      outcome,
      error_message: errorMessage ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to record audit entry: ${error.message}`);
  }

  return data as AuditLogEntryRow;
}

/**
 * Retrieves audit log entries for a user with optional pagination and date filtering.
 *
 * Entries are returned in reverse chronological order (newest first).
 * Validates Requirement 24.2: users can view their own audit log.
 *
 * @param userId - The user's ID
 * @param options - Optional pagination and date filter parameters
 * @returns Array of audit log entries
 */
export async function getAuditLog(
  userId: string,
  options: AuditLogQueryOptions = {}
): Promise<AuditLogEntryRow[]> {
  const { limit = 20, offset = 0, fromDate, toDate } = options;

  let query = supabase
    .from('audit_log')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .range(offset, offset + limit - 1);

  if (fromDate) {
    query = query.gte('timestamp', fromDate);
  }

  if (toDate) {
    query = query.lte('timestamp', toDate);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to retrieve audit log: ${error.message}`);
  }

  return (data ?? []) as AuditLogEntryRow[];
}

/**
 * Retrieves a single audit log entry by ID, scoped to the given user.
 *
 * @param userId - The user's ID (for ownership verification via RLS)
 * @param entryId - The audit log entry ID
 * @returns The audit log entry, or null if not found
 */
export async function getAuditEntryById(
  userId: string,
  entryId: string
): Promise<AuditLogEntryRow | null> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('user_id', userId)
    .eq('id', entryId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to retrieve audit entry: ${error.message}`);
  }

  return data as AuditLogEntryRow | null;
}
