/**
 * Permission and audit types for Cadence fitness app.
 * Controls what the Agent can do automatically vs. requiring user approval.
 */

export type PermissionCategory =
  | 'program_edits'
  | 'journal_edits'
  | 'spotify_actions'
  | 'health_access'
  | 'session_edits';

export type PermissionMode = 'approval_required' | 'auto_apply';

export type ApprovalStatus = 'approved' | 'auto_applied' | 'rejected';

export type ActionOutcome = 'success' | 'failure';

export interface AuditLogEntry {
  id: string;
  user_id: string;
  timestamp: string;
  action_type: string;
  permission_category: PermissionCategory;
  parameters: Record<string, unknown>;
  approval_status: ApprovalStatus;
  outcome: ActionOutcome;
  error_message?: string;
}
