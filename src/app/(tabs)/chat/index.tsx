/**
 * Agent Chat screen - send messages, receive streaming responses,
 * handle tool call proposals, and approve/reject actions.
 *
 * Supports all tool types: program_create, program_modify, program_activate,
 * journal_draft, and spotify_* actions. Persists messages to chat_messages table.
 *
 * Requirements: 1.1, 1.2, 2.3, 2.4, 3.3
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Linking,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
    View
} from 'react-native';


import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatUsageIndicator, RateLimitReachedMessage } from '@/components/ChatUsageIndicator';
import { PlaylistCardList } from '@/components/PlaylistCardList';
import { ProgramProposal } from '@/components/ProgramProposal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Icon } from '@/components/ui/Icon';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/AuthProvider';
import { useAiTierStore } from '@/store/ai-tier';
import { extractPlaylistCardData } from '@/utils/extract-playlist-card-data';
import { supabase } from '@/utils/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCallData[];
}

interface ToolCallData {
  id: string;
  name: string;
  arguments: string;
  status: 'pending_approval' | 'approved' | 'auto_applied' | 'rejected';
  /** Raw JSON result string from tool execution (populated for auto-executed retrieval tools) */
  result?: string;
}

/** Spotify tool names that produce playlist card data */
const SPOTIFY_PLAYLIST_TOOLS = new Set([
  'spotify_search_playlist',
  'spotify_suggest_pace_playlist',
  'spotify_create_playlist',
]);

/** Tools that are read-only retrieval and should be auto-executed without approval */
const RETRIEVAL_TOOLS = new Set([
  'get_active_program',
  'get_recovery_summary',
  'get_recent_workouts_summary',
  'get_route_history',
  'get_session_history',
  'get_session_details',
  'get_programs',
  'spotify_search_playlist',
  'spotify_search_tracks',
  'spotify_suggest_pace_playlist',
  'spotify_create_playlist',
  'spotify_modify_playlist',
]);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  // ---------------------------------------------------------------------------
  // Load chat history from chat_messages table
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!session?.user?.id) {
      setIsLoadingHistory(false);
      return;
    }

    const loadHistory = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: true })
          .limit(100);

        if (fetchError) {
          console.warn('Failed to load chat history:', fetchError.message);
        } else if (data && data.length > 0) {
          const loaded: DisplayMessage[] = data.map((row) => ({
            id: row.id,
            role: row.role as 'user' | 'assistant' | 'system',
            content: row.content,
            toolCalls: row.tool_calls
              ? (row.tool_calls as unknown as ToolCallData[])
              : undefined,
          }));
          setMessages(loaded);
        }
      } catch {
        console.warn('Error loading chat history');
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [session?.user?.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  // ---------------------------------------------------------------------------
  // Persist a message to chat_messages table
  // ---------------------------------------------------------------------------

  const persistMessage = useCallback(
    async (msg: DisplayMessage) => {
      if (!session?.user?.id) return;

      try {
        await supabase.from('chat_messages').insert({
          user_id: session.user.id,
          role: msg.role,
          content: msg.content,
          tool_calls: msg.toolCalls
            ? (msg.toolCalls as unknown as Record<string, unknown>[])
            : null,
        });
      } catch {
        console.warn('Failed to persist chat message');
      }
    },
    [session?.user?.id],
  );

  // ---------------------------------------------------------------------------
  // Send message to agent-chat Edge Function (SSE streaming)
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isStreaming) return;

    setError(null);
    setInputText('');

    const userMsg: DisplayMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    persistMessage(userMsg);

    const conversationContext = messages.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setIsStreaming(true);

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const accessToken = currentSession?.access_token || session?.access_token;
      if (!accessToken) {
        setError('Session expired. Please sign in again.');
        setIsStreaming(false);
        return;
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const response = await fetch(`${supabaseUrl}/functions/v1/agent-chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          conversation: conversationContext,
          provider: 'anthropic',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorCode = errorData?.error?.code;

        if (errorCode === 'api_key_required') {
          setError('No API key found. Please add your API key in Settings.');
          setIsStreaming(false);
          return;
        }

        setError(errorData?.error?.message || `Error: ${response.status}`);
        setIsStreaming(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setError('Failed to read response stream.');
        setIsStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let assistantContent = '';
      let toolCalls: ToolCallData[] = [];
      const assistantMsgId = `assistant-${Date.now()}`;

      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: 'assistant', content: '' },
      ]);

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === 'content') {
              assistantContent += parsed.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: assistantContent }
                    : m
                )
              );
            } else if (parsed.type === 'tool_calls') {
              toolCalls = parsed.tool_calls.map((tc: any) => ({
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
                status: RETRIEVAL_TOOLS.has(tc.name) ? 'auto_applied' as const : 'pending_approval' as const,
              }));
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, toolCalls }
                    : m
                )
              );
            } else if (parsed.type === 'error') {
              setError(parsed.error);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      const finalAssistantMsg: DisplayMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: assistantContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
      persistMessage(finalAssistantMsg);

      // Auto-execute retrieval tools and send results back to continue conversation
      const retrievalCalls = toolCalls.filter((tc) => RETRIEVAL_TOOLS.has(tc.name));
      if (retrievalCalls.length > 0) {
        await autoExecuteRetrievalTools(retrievalCalls, assistantContent, toolCalls, [...conversationContext, { role: 'user', content: text }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsStreaming(false);
    }
  }, [inputText, isStreaming, messages, persistMessage]);

  // ---------------------------------------------------------------------------
  // Auto-execute retrieval tools and continue the conversation
  // ---------------------------------------------------------------------------

  const autoExecuteRetrievalTools = useCallback(async (
    retrievalCalls: ToolCallData[],
    assistantContent: string,
    allToolCalls: ToolCallData[],
    conversationSoFar: { role: string; content: string }[],
  ) => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession) return;

    // Execute each retrieval tool call
    const toolResults: { tool_call_id: string; name: string; content: string }[] = [];

    for (const tc of retrievalCalls) {
      try {
        let args: Record<string, unknown> = {};
        if (typeof tc.arguments === 'object' && tc.arguments !== null) {
          args = tc.arguments as unknown as Record<string, unknown>;
        } else if (tc.arguments && tc.arguments.trim() !== '') {
          args = JSON.parse(tc.arguments);
        }

        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
        const response = await fetch(`${supabaseUrl}/functions/v1/execute-tool-call`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tool_call_id: tc.id,
            tool_name: tc.name,
            arguments: args,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          toolResults.push({
            tool_call_id: tc.id,
            name: tc.name,
            content: JSON.stringify(result),
          });
        } else {
          const errorData = await response.json().catch(() => ({}));
          toolResults.push({
            tool_call_id: tc.id,
            name: tc.name,
            content: JSON.stringify({ error: errorData?.error?.message || `Failed (${response.status})` }),
          });
        }
      } catch (err) {
        toolResults.push({
          tool_call_id: tc.id,
          name: tc.name,
          content: JSON.stringify({ error: err instanceof Error ? err.message : 'Execution failed' }),
        });
      }
    }

    // Store tool results on the corresponding ToolCallData in messages state
    setMessages((prev) =>
      prev.map((m) => {
        if (!m.toolCalls) return m;
        const hasMatchingToolCall = m.toolCalls.some((tc) =>
          toolResults.some((tr) => tr.tool_call_id === tc.id)
        );
        if (!hasMatchingToolCall) return m;
        return {
          ...m,
          toolCalls: m.toolCalls.map((tc) => {
            const matchingResult = toolResults.find((tr) => tr.tool_call_id === tc.id);
            if (matchingResult) {
              // Only store result for successful executions (no error in response)
              try {
                const parsed = JSON.parse(matchingResult.content);
                if (!parsed.error) {
                  return { ...tc, result: matchingResult.content };
                }
              } catch {
                // If JSON parsing fails, don't store the result
              }
            }
            return tc;
          }),
        };
      })
    );

    // Build a follow-up conversation with tool results and send back to the AI
    const followUpConversation = [
      ...conversationSoFar,
      {
        role: 'assistant',
        content: assistantContent || '',
        tool_calls: allToolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: typeof tc.arguments === 'string' ? tc.arguments || '{}' : JSON.stringify(tc.arguments) },
        })),
      },
      ...toolResults.map((tr) => ({
        role: 'tool',
        content: tr.content,
        tool_call_id: tr.tool_call_id,
        name: tr.name,
      })),
    ];

    // Send a follow-up request to the AI with the tool results
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/agent-chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: '',
          conversation: followUpConversation,
          provider: 'anthropic',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setError(errorData?.error?.message || `Error continuing after tool: ${response.status}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let followUpContent = '';
      let followUpToolCalls: ToolCallData[] = [];
      const followUpMsgId = `assistant-${Date.now()}`;

      setMessages((prev) => [
        ...prev,
        { id: followUpMsgId, role: 'assistant', content: '' },
      ]);

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content') {
              followUpContent += parsed.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === followUpMsgId ? { ...m, content: followUpContent } : m
                )
              );
            } else if (parsed.type === 'tool_calls') {
              followUpToolCalls = parsed.tool_calls.map((tc: any) => ({
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
                status: RETRIEVAL_TOOLS.has(tc.name) ? 'auto_applied' as const : 'pending_approval' as const,
              }));
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === followUpMsgId ? { ...m, toolCalls: followUpToolCalls } : m
                )
              );
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      const followUpMsg: DisplayMessage = {
        id: followUpMsgId,
        role: 'assistant',
        content: followUpContent,
        toolCalls: followUpToolCalls.length > 0 ? followUpToolCalls : undefined,
      };
      persistMessage(followUpMsg);

      // If there are more retrieval tools in the follow-up, recurse
      const moreRetrievals = followUpToolCalls.filter((tc) => RETRIEVAL_TOOLS.has(tc.name));
      if (moreRetrievals.length > 0) {
        const extendedConversation = [
          ...followUpConversation,
          { role: 'assistant', content: followUpContent },
        ];
        await autoExecuteRetrievalTools(moreRetrievals, followUpContent, followUpToolCalls, extendedConversation);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to continue conversation after tool execution');
    }
  }, [persistMessage]);

  // ---------------------------------------------------------------------------
  // Handle tool call approval
  // ---------------------------------------------------------------------------

  const handleApproveToolCall = useCallback(async (messageId: string, toolCall: ToolCallData) => {
    let args: Record<string, unknown>;
    try {
      // arguments may already be an object (loaded from JSONB in DB) or a JSON string (from stream)
      if (typeof toolCall.arguments === 'object' && toolCall.arguments !== null) {
        args = toolCall.arguments as unknown as Record<string, unknown>;
      } else if (!toolCall.arguments || toolCall.arguments.trim() === '') {
        // Empty arguments (e.g., get_active_program with no params)
        args = {};
      } else {
        args = JSON.parse(toolCall.arguments);
      }
    } catch (e) {
      console.error('Failed to parse tool call arguments:', JSON.stringify(toolCall.arguments), e);
      setError('Failed to parse tool call data. The AI response may have been incomplete — try sending your message again.');
      return;
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              toolCalls: m.toolCalls?.map((tc) =>
                tc.id === toolCall.id ? { ...tc, status: 'approved' as const } : tc
              ),
            }
          : m
      )
    );

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        setError('Session expired.');
        return;
      }

      if (toolCall.name === 'program_create') {
        await handleProgramCreate(args, currentSession);
      } else if (toolCall.name === 'program_activate') {
        await handleProgramActivate(args, currentSession);
      } else if (toolCall.name === 'program_modify') {
        await handleProgramModify(toolCall.id, args, currentSession);
      } else if (toolCall.name === 'journal_draft') {
        await handleJournalDraft(toolCall.id, args, currentSession);
      } else if (toolCall.name.startsWith('spotify_')) {
        await handleSpotifyAction(toolCall.id, toolCall.name, args, currentSession);
      } else {
        await handleGenericToolCall(toolCall.id, toolCall.name, args, currentSession);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute tool call');
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Tool call handlers
  // ---------------------------------------------------------------------------

  const handleProgramCreate = async (
    args: Record<string, unknown>,
    currentSession: { user: { id: string }; access_token: string },
  ) => {
    const programData = args as {
      name: string;
      days: Array<{
        name: string;
        day_number: number;
        items: Array<{
          type: string;
          exercise_name: string;
          target_sets: number;
          target_reps: string;
          target_weight?: number;
          target_rpe?: number;
          notes?: string;
        }>;
      }>;
    };

    const { data: program, error: programError } = await supabase
      .from('programs')
      .insert({
        user_id: currentSession.user.id,
        name: programData.name,
        status: 'draft',
      })
      .select('id')
      .single();

    if (programError || !program) {
      setError(`Failed to create program: ${programError?.message}`);
      return;
    }

    for (const day of programData.days || []) {
      const { data: programDay, error: dayError } = await supabase
        .from('program_days')
        .insert({
          program_id: program.id,
          day_number: day.day_number,
          name: day.name,
        })
        .select('id')
        .single();

      if (dayError || !programDay) continue;

      for (let i = 0; i < (day.items || []).length; i++) {
        const item = day.items[i];

        let exerciseId: string | null = null;
        if (item.exercise_name) {
          const { data: existingExercise } = await supabase
            .from('exercises')
            .select('id')
            .ilike('name', item.exercise_name)
            .limit(1)
            .single();

          if (existingExercise) {
            exerciseId = existingExercise.id;
          } else {
            const { data: newExercise } = await supabase
              .from('exercises')
              .insert({
                user_id: currentSession.user.id,
                name: item.exercise_name,
                primary_muscle_group: 'general',
                is_global: false,
              })
              .select('id')
              .single();
            exerciseId = newExercise?.id || null;
          }
        }

        await supabase.from('program_day_items').insert({
          program_day_id: programDay.id,
          exercise_id: exerciseId,
          type: (item.type === 'block' ? 'block' : 'exercise') as 'exercise' | 'block',
          order_index: i + 1,
          target_sets: item.target_sets,
          target_reps: item.target_reps,
          target_weight: item.target_weight || null,
          target_rpe: item.target_rpe || null,
          notes: item.notes || null,
        });
      }
    }

    const { error: activateError } = await supabase.rpc('activate_program', {
      p_user_id: currentSession.user.id,
      p_program_id: program.id,
    });

    if (activateError) {
      setError(`Program created but activation failed: ${activateError.message}`);
      return;
    }

    const systemMsg: DisplayMessage = {
      id: `system-${Date.now()}`,
      role: 'system',
      content: `✅ Program "${programData.name}" created and activated successfully!`,
    };
    setMessages((prev) => [...prev, systemMsg]);
    persistMessage(systemMsg);
  };

  const handleProgramActivate = async (
    args: Record<string, unknown>,
    currentSession: { user: { id: string }; access_token: string },
  ) => {
    const { error: activateError } = await supabase.rpc('activate_program', {
      p_user_id: currentSession.user.id,
      p_program_id: args.program_id as string,
    });

    if (activateError) {
      setError(`Activation failed: ${activateError.message}`);
      return;
    }

    const systemMsg: DisplayMessage = {
      id: `system-${Date.now()}`,
      role: 'system',
      content: '✅ Program activated successfully!',
    };
    setMessages((prev) => [...prev, systemMsg]);
    persistMessage(systemMsg);
  };

  const handleProgramModify = async (
    toolCallId: string,
    args: Record<string, unknown>,
    currentSession: { user: { id: string }; access_token: string },
  ) => {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const response = await fetch(`${supabaseUrl}/functions/v1/execute-tool-call`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentSession.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool_call_id: toolCallId,
        tool_name: 'program_modify',
        arguments: args,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      setError(errorData?.error?.message || 'Failed to modify program');
      return;
    }

    const systemMsg: DisplayMessage = {
      id: `system-${Date.now()}`,
      role: 'system',
      content: `✅ Program modified successfully. Reason: ${(args.reason as string) || 'Updated'}`,
    };
    setMessages((prev) => [...prev, systemMsg]);
    persistMessage(systemMsg);
  };

  const handleJournalDraft = async (
    toolCallId: string,
    args: Record<string, unknown>,
    currentSession: { user: { id: string }; access_token: string },
  ) => {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const response = await fetch(`${supabaseUrl}/functions/v1/execute-tool-call`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentSession.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool_call_id: toolCallId,
        tool_name: 'journal_draft',
        arguments: args,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      setError(errorData?.error?.message || 'Failed to draft journal entry');
      return;
    }

    const systemMsg: DisplayMessage = {
      id: `system-${Date.now()}`,
      role: 'system',
      content: '✅ Journal entry drafted. You can review and edit it in your Journal.',
    };
    setMessages((prev) => [...prev, systemMsg]);
    persistMessage(systemMsg);
  };

  const handleSpotifyAction = async (
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
    currentSession: { user: { id: string }; access_token: string },
  ) => {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const response = await fetch(`${supabaseUrl}/functions/v1/execute-tool-call`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentSession.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool_call_id: toolCallId,
        tool_name: toolName,
        arguments: args,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      setError(errorData?.error?.message || `Failed to execute ${toolName}`);
      return;
    }

    const actionLabel = toolName.replace('spotify_', '').replace(/_/g, ' ');
    const systemMsg: DisplayMessage = {
      id: `system-${Date.now()}`,
      role: 'system',
      content: `✅ Spotify ${actionLabel} completed successfully!`,
    };
    setMessages((prev) => [...prev, systemMsg]);
    persistMessage(systemMsg);
  };

  const handleGenericToolCall = async (
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
    currentSession: { user: { id: string }; access_token: string },
  ) => {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const response = await fetch(`${supabaseUrl}/functions/v1/execute-tool-call`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentSession.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool_call_id: toolCallId,
        tool_name: toolName,
        arguments: args,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      setError(errorData?.error?.message || `Failed to execute ${toolName}`);
      return;
    }

    const systemMsg: DisplayMessage = {
      id: `system-${Date.now()}`,
      role: 'system',
      content: `✅ ${toolName.replace(/_/g, ' ')} executed successfully!`,
    };
    setMessages((prev) => [...prev, systemMsg]);
    persistMessage(systemMsg);
  };

  const handleRejectToolCall = useCallback((messageId: string, toolCallId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              toolCalls: m.toolCalls?.map((tc) =>
                tc.id === toolCallId ? { ...tc, status: 'rejected' as const } : tc
              ),
            }
          : m
      )
    );
  }, []);

  // ---------------------------------------------------------------------------
  // Clear chat history
  // ---------------------------------------------------------------------------

  const handleClearChat = useCallback(async () => {
    if (!session?.user?.id) return;

    // Clear local state immediately
    setMessages([]);
    setError(null);

    // Delete from DB
    try {
      await supabase
        .from('chat_messages')
        .delete()
        .eq('user_id', session.user.id);
    } catch {
      console.warn('Failed to delete chat history from DB');
    }
  }, [session?.user?.id]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  /** Renders text with clickable URLs */
  const renderTextWithLinks = (text: string, textColor: string, linkColor: string) => {
    const urlRegex = /(https?:\/\/[^\s)]+)/g;
    const parts = text.split(urlRegex);

    if (parts.length === 1) return text;

    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        // Reset regex lastIndex since we reuse it
        urlRegex.lastIndex = 0;
        return (
          <ThemedText
            key={index}
            style={{ color: linkColor, textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL(part)}
          >
            {part}
          </ThemedText>
        );
      }
      return part;
    });
  };

  const renderMessage = useCallback(({ item }: { item: DisplayMessage }) => {
    const isUser = item.role === 'user';
    const isSystem = item.role === 'system';

    // Extract playlist card data from Spotify tool call results
    const playlistCards = (() => {
      if (isUser || isSystem || !item.toolCalls) return [];
      for (const tc of item.toolCalls) {
        if (SPOTIFY_PLAYLIST_TOOLS.has(tc.name) && tc.result) {
          try {
            const parsed = JSON.parse(tc.result);
            // The stored result is the full edge function response: { tool_call_id, result: {...} }
            // extractPlaylistCardData expects the inner result object
            const toolResult = parsed.result ?? parsed;
            const cards = extractPlaylistCardData(tc.name, toolResult);
            if (cards.length > 0) return cards;
          } catch {
            // Malformed JSON result — skip
          }
        }
      }
      return [];
    })();

    return (
      <View style={styles.messageWrapper}>
        <View
          style={[
            styles.messageBubble,
            { borderWidth: 1, borderColor: theme.border },
            isUser && { backgroundColor: theme.chatBubbleUser, alignSelf: 'flex-end' as const },
            isSystem && { backgroundColor: theme.chatBubbleSystem, alignSelf: 'center' as const, maxWidth: '90%', borderColor: 'rgba(16,185,129,0.4)' },
            !isUser && !isSystem && { backgroundColor: theme.chatBubbleAssistant, alignSelf: 'flex-start' as const },
          ]}
        >
          {item.content ? (
            <ThemedText
              style={[
                styles.messageText,
                isUser && { color: theme.chatBubbleUserText },
                isSystem && { color: theme.chatBubbleSystemText, textAlign: 'center' },
                !isUser && !isSystem && { color: theme.chatBubbleAssistantText },
              ]}
            >
              {renderTextWithLinks(item.content, isUser ? theme.chatBubbleUserText : isSystem ? theme.chatBubbleSystemText : theme.chatBubbleAssistantText, theme.accent)}
            </ThemedText>
          ) : null}

          {playlistCards.length > 0 && (
            <View style={styles.playlistCardsContainer}>
              <PlaylistCardList playlists={playlistCards} />
            </View>
          )}

          {item.toolCalls?.filter((tc) => !RETRIEVAL_TOOLS.has(tc.name)).map((tc) => (
            <ProgramProposal
              key={tc.id}
              toolCall={tc}
              onApprove={() => handleApproveToolCall(item.id, tc)}
              onReject={() => handleRejectToolCall(item.id, tc.id)}
            />
          ))}
        </View>
      </View>
    );
  }, [handleApproveToolCall, handleRejectToolCall, theme]);

  if (isLoadingHistory) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header with clear chat */}
        {messages.length > 0 && (
          <View style={[styles.chatHeader, { borderBottomColor: theme.border }]}>
            <ChatUsageIndicator />
            <Pressable
              style={[styles.clearButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
              onPress={handleClearChat}
              disabled={isStreaming}
              accessibilityRole="button"
              accessibilityLabel="Start new chat"
            >
              <Icon name="refresh" size={14} color={theme.textSecondary} />
              <ThemedText type="labelMedium" themeColor="textSecondary">New Chat</ThemedText>
            </Pressable>
          </View>
        )}

        {error && (
          <View style={[styles.errorBanner, { backgroundColor: theme.errorSoft }]}>
            <ThemedText style={{ color: theme.error, fontSize: 13, textAlign: 'center' }}>{error}</ThemedText>
            {error.includes('API key') && (
              <Pressable onPress={() => router.push('/(tabs)/settings')}>
                <ThemedText type="linkPrimary">Go to Settings</ThemedText>
              </Pressable>
            )}
          </View>
        )}

        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <ThemedText type="headlineMedium" style={styles.emptyTitle}>
                Cadence Agent
              </ThemedText>
              <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.emptyText}>
                Describe your fitness goals and I'll create a personalized
                training program for you.
              </ThemedText>
            </View>
          }
        />

        {/* Input dock */}
        <RateLimitReachedMessage />
        <View
          style={[
            styles.inputContainer,
            {
              borderTopColor: theme.border,
              backgroundColor: theme.background,
              paddingBottom: Spacing.two + insets.bottom,
            },
          ]}
        >
          <View
            style={[
              styles.inputDock,
              { backgroundColor: theme.backgroundElevated, borderColor: theme.borderStrong },
            ]}
          >
            <TextInput
              style={[styles.textInput, { color: theme.text }]}
              placeholder="Ask Coach Cadence to adjust..."
              placeholderTextColor={theme.textTertiary}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={2000}
              editable={!isStreaming && !useAiTierStore.getState().isRateLimited}
              onSubmitEditing={sendMessage}
              blurOnSubmit={false}
            />
            <Pressable
              style={[
                styles.sendButton,
                { backgroundColor: theme.accent },
                (isStreaming || !inputText.trim()) && styles.sendButtonDisabled,
                !(isStreaming || !inputText.trim()) && theme.shadows.glowSoft,
              ]}
              onPress={sendMessage}
              disabled={isStreaming || !inputText.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {isStreaming ? (
                <ActivityIndicator color={theme.accentText} size="small" />
              ) : (
                <Icon name="arrow-up" size={22} color={theme.accentText} />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderBottomWidth: 1,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radii.full,
    borderWidth: 1,
  },
  messageList: {
    padding: Spacing.three,
    flexGrow: 1,
  },
  messageWrapper: {
    marginBottom: Spacing.two,
  },
  messageBubble: {
    padding: Spacing.three,
    borderRadius: Radii.large,
    maxWidth: '85%',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  playlistCardsContainer: {
    marginTop: Spacing.two,
  },
  inputContainer: {
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputDock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: Spacing.one + 2,
    gap: Spacing.two,
  },
  textInput: {
    flex: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 15,
    maxHeight: 100,
    minHeight: 40,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: Radii.medium,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  errorBanner: {
    padding: Spacing.two,
    alignItems: 'center',
    gap: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  emptyTitle: {
    marginBottom: Spacing.two,
  },
  emptyText: {
    textAlign: 'center',
  },
});
