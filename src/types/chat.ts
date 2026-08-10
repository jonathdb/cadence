/**
 * Chat types for Cadence fitness app.
 * Messages between the user and the AI training agent.
 */

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export type ToolCallStatus = 'pending_approval' | 'approved' | 'auto_applied' | 'rejected';

export interface ChatMessage {
  id: string;
  user_id: string;
  role: ChatRole;
  content: string;
  tool_calls?: ToolCall[];
  created_at: string;
}

export interface ToolCall {
  id: string;
  type: string; // e.g. 'program_create' | 'program_modify' | 'journal_draft' | 'spotify_*'
  parameters: Record<string, unknown>;
  status: ToolCallStatus;
  result?: Record<string, unknown>;
}

export interface ToolCallData {
  id: string;
  name: string;
  arguments: string;
  status: ToolCallStatus;
  /** Raw JSON result string from tool execution (populated for auto-executed retrieval tools) */
  result?: string;
}
