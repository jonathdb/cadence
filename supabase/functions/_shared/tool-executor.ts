/**
 * Tool-call execution framework for Cadence Agent.
 *
 * Responsibilities:
 * 1. Look up the user's permission settings from user_settings
 * 2. Determine the permission category for the tool call
 * 3. If auto_apply: execute the tool handler and return the result
 * 4. If approval_required: return status 'pending_approval' without executing
 * 5. Always log to audit_log (regardless of outcome)
 *
 * Validates: Requirements 2.3, 2.4, 23.1, 23.3, 23.4, 24.1
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getToolHandler } from './tool-handlers.ts';

// --- Types ---

export type PermissionCategory =
  | 'program_edits'
  | 'journal_edits'
  | 'spotify_actions'
  | 'health_access';

export type PermissionMode = 'approval_required' | 'auto_apply';

export type ToolCallStatus = 'pending_approval' | 'auto_applied';

export type ApprovalStatus = 'approved' | 'auto_applied' | 'rejected';

export type ActionOutcome = 'success' | 'failure';

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  id: string;
  name: string;
  status: ToolCallStatus;
  category: PermissionCategory;
  result?: unknown;
  error?: string;
}

// --- Permission Category Mapping ---

/**
 * Maps tool names to their permission category.
 * Every tool call must belong to exactly one category.
 */
const TOOL_PERMISSION_MAP: Record<string, PermissionCategory> = {
  program_create: 'program_edits',
  program_modify: 'program_edits',
  program_activate: 'program_edits',
  journal_draft: 'journal_edits',
  spotify_search_playlist: 'spotify_actions',
  spotify_search_tracks: 'spotify_actions',
  spotify_create_playlist: 'spotify_actions',
  spotify_modify_playlist: 'spotify_actions',
  spotify_suggest_pace_playlist: 'spotify_actions',
  get_recovery_summary: 'health_access',
  get_recent_workouts_summary: 'health_access',
  get_route_history: 'health_access',
  get_active_program: 'program_edits',
  get_programs: 'program_edits',
  get_session_history: 'health_access',
  get_session_details: 'health_access',
  suggest_progression: 'program_edits',
};

/**
 * Maps permission categories to their corresponding user_settings column names.
 */
const PERMISSION_COLUMN_MAP: Record<string, string> = {
  program_edits: 'permission_program_edits',
  journal_edits: 'permission_journal_edits',
  spotify_actions: 'permission_spotify_actions',
  health_access: 'permission_health_access',
};

// --- Core Execution ---

/**
 * Executes a tool call with permission gating and audit logging.
 *
 * @param supabase - Supabase client (service_role for DB access)
 * @param userId - The authenticated user's ID
 * @param request - The tool call request from the Agent
 * @returns ToolCallResult with status and optional result/error
 */
export async function executeToolCall(
  supabase: SupabaseClient,
  userId: string,
  request: ToolCallRequest
): Promise<ToolCallResult> {
  // 1. Determine permission category
  const category = getPermissionCategory(request.name);
  if (!category) {
    const error = `Unknown tool: ${request.name}`;
    await logToAuditLog(supabase, userId, {
      actionType: request.name,
      category: 'program_edits', // fallback for logging
      parameters: request.arguments,
      approvalStatus: 'rejected',
      outcome: 'failure',
      errorMessage: error,
    });
    return {
      id: request.id,
      name: request.name,
      status: 'pending_approval',
      category: 'program_edits',
      error,
    };
  }

  // 2. Look up user's permission mode for this category
  const permissionMode = await getUserPermissionMode(
    supabase,
    userId,
    category
  );

  // 3. If approval_required: return pending without executing
  if (permissionMode === 'approval_required') {
    await logToAuditLog(supabase, userId, {
      actionType: request.name,
      category,
      parameters: request.arguments,
      approvalStatus: 'approved', // will be updated when user approves/rejects
      outcome: 'success',
      errorMessage: undefined,
    });

    return {
      id: request.id,
      name: request.name,
      status: 'pending_approval',
      category,
    };
  }

  // 4. If auto_apply: execute the tool handler
  const handler = getToolHandler(request.name);
  if (!handler) {
    const error = `No handler registered for tool: ${request.name}`;
    await logToAuditLog(supabase, userId, {
      actionType: request.name,
      category,
      parameters: request.arguments,
      approvalStatus: 'auto_applied',
      outcome: 'failure',
      errorMessage: error,
    });
    return {
      id: request.id,
      name: request.name,
      status: 'auto_applied',
      category,
      error,
    };
  }

  try {
    const result = await handler(supabase, userId, request.arguments);

    // Log successful auto-applied execution
    await logToAuditLog(supabase, userId, {
      actionType: request.name,
      category,
      parameters: request.arguments,
      approvalStatus: 'auto_applied',
      outcome: 'success',
      errorMessage: undefined,
    });

    return {
      id: request.id,
      name: request.name,
      status: 'auto_applied',
      category,
      result,
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : 'Unknown execution error';

    // Log failed auto-applied execution
    await logToAuditLog(supabase, userId, {
      actionType: request.name,
      category,
      parameters: request.arguments,
      approvalStatus: 'auto_applied',
      outcome: 'failure',
      errorMessage,
    });

    return {
      id: request.id,
      name: request.name,
      status: 'auto_applied',
      category,
      error: errorMessage,
    };
  }
}

// --- Helper Functions ---

/**
 * Resolves the permission category for a given tool name.
 */
export function getPermissionCategory(
  toolName: string
): PermissionCategory | undefined {
  return TOOL_PERMISSION_MAP[toolName];
}

/**
 * Reads the user's permission mode for a given category from user_settings.
 * Defaults to 'approval_required' if no settings record exists.
 */
async function getUserPermissionMode(
  supabase: SupabaseClient,
  userId: string,
  category: PermissionCategory
): Promise<PermissionMode> {
  const column = PERMISSION_COLUMN_MAP[category];
  if (!column) {
    return 'approval_required';
  }

  const { data, error } = await supabase
    .from('user_settings')
    .select(column)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    // Default to approval_required if no settings found
    return 'approval_required';
  }

  const mode = data[column] as string;
  return mode === 'auto_apply' ? 'auto_apply' : 'approval_required';
}

/**
 * Logs a tool call to the audit_log table.
 * This is called for every tool call regardless of outcome.
 */
interface AuditLogParams {
  actionType: string;
  category: PermissionCategory;
  parameters: Record<string, unknown>;
  approvalStatus: ApprovalStatus;
  outcome: ActionOutcome;
  errorMessage?: string;
}

async function logToAuditLog(
  supabase: SupabaseClient,
  userId: string,
  params: AuditLogParams
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    user_id: userId,
    timestamp: new Date().toISOString(),
    action_type: params.actionType,
    permission_category: params.category,
    parameters: params.parameters,
    approval_status: params.approvalStatus,
    outcome: params.outcome,
    error_message: params.errorMessage ?? null,
  });

  if (error) {
    // Log the error but don't fail the tool call because of audit logging
    console.error('Failed to write audit log:', error.message);
  }
}
