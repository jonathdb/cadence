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
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';

import { ProgramProposal } from '@/components/ProgramProposal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatScreen() {
  const { session } = useAuth();
  const router = useRouter();

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
          id: msg.id,
          user_id: session.user.id,
          role: msg.role,
          content: msg.content,
          tool_calls: msg.toolCalls
            ? (msg.toolCalls as unknown as Record<string, unknown>[])
            : null,
        });
      } catch {
        // Non-critical - continue even if persistence fails
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

    // Add user message to display
    const userMsg: DisplayMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    persistMessage(userMsg);

    // Build conversation context (last 20 messages for context window)
    const conversationContext = messages.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setIsStreaming(true);

    try {
      // Get the current session token
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        setError('Session expired. Please sign in again.');
        setIsStreaming(false);
        return;
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const response = await fetch(`${supabaseUrl}/functions/v1/agent-chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          conversation: conversationContext,
          provider: 'openai',
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

      // Stream SSE response
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

      // Add empty assistant message placeholder
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
                status: 'pending_approval' as const,
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

      // Persist the final assistant message
      const finalAssistantMsg: DisplayMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: assistantContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
      persistMessage(finalAssistantMsg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsStreaming(false);
    }
  }, [inputText, isStreaming, messages, persistMessage]);

  // ---------------------------------------------------------------------------
  // Handle tool call approval — supports all tool types
  // ---------------------------------------------------------------------------

  const handleApproveToolCall = useCallback(async (messageId: string, toolCall: ToolCallData) => {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.arguments);
    } catch {
      setError('Failed to parse tool call data');
      return;
    }

    // Update tool call status to approved in UI
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

      // Route to appropriate handler based on tool name
      if (toolCall.name === 'program_create') {
        await handleProgramCreate(args, currentSession);
      } else if (toolCall.name === 'program_activate') {
        await handleProgramActivate(args, currentSession);
      } else if (toolCall.name === 'program_modify') {
        await handleProgramModify(args, currentSession);
      } else if (toolCall.name === 'journal_draft') {
        await handleJournalDraft(args, currentSession);
      } else if (toolCall.name.startsWith('spotify_')) {
        await handleSpotifyAction(toolCall.name, args, currentSession);
      } else {
        // Generic tool call — invoke execute-tool-call Edge Function
        await handleGenericToolCall(toolCall.name, args, currentSession);
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

    // Activate the program
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
    args: Record<string, unknown>,
    currentSession: { user: { id: string }; access_token: string },
  ) => {
    // Invoke the execute-tool-call Edge Function for program modifications
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const response = await fetch(`${supabaseUrl}/functions/v1/execute-tool-call`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentSession.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
  // Render
  // ---------------------------------------------------------------------------

  const renderMessage = useCallback(({ item }: { item: DisplayMessage }) => {
    const isUser = item.role === 'user';
    const isSystem = item.role === 'system';

    return (
      <View style={styles.messageWrapper}>
        <View
          style={[
            styles.messageBubble,
            isUser && styles.userBubble,
            isSystem && styles.systemBubble,
            !isUser && !isSystem && styles.assistantBubble,
          ]}
        >
          {item.content ? (
            <ThemedText
              style={[
                styles.messageText,
                isUser && styles.userText,
                isSystem && styles.systemText,
              ]}
            >
              {item.content}
            </ThemedText>
          ) : null}

          {/* Tool call proposals */}
          {item.toolCalls?.map((tc) => (
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
  }, [handleApproveToolCall, handleRejectToolCall]);

  if (isLoadingHistory) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3c87f7" />
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
        {error && (
          <View style={styles.errorBanner}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
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
              <ThemedText type="subtitle" style={styles.emptyTitle}>
                Cadence Agent
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                Describe your fitness goals and I'll create a personalized
                training program for you.
              </ThemedText>
            </View>
          }
        />

        {/* Input area */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Message the agent..."
            placeholderTextColor="#888"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={2000}
            editable={!isStreaming}
            onSubmitEditing={sendMessage}
            blurOnSubmit={false}
          />
          <Pressable
            style={[styles.sendButton, (isStreaming || !inputText.trim()) && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={isStreaming || !inputText.trim()}
          >
            {isStreaming ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ThemedText style={styles.sendButtonText}>Send</ThemedText>
            )}
          </Pressable>
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
  messageList: {
    padding: Spacing.three,
    flexGrow: 1,
  },
  messageWrapper: {
    marginBottom: Spacing.two,
  },
  messageBubble: {
    padding: Spacing.three,
    borderRadius: 12,
    maxWidth: '85%',
  },
  userBubble: {
    backgroundColor: '#3c87f7',
    alignSelf: 'flex-end',
  },
  assistantBubble: {
    backgroundColor: '#f0f0f3',
    alignSelf: 'flex-start',
  },
  systemBubble: {
    backgroundColor: '#dcfce7',
    alignSelf: 'center',
    maxWidth: '90%',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1a1a1a',
  },
  userText: {
    color: '#fff',
  },
  systemText: {
    color: '#166534',
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
    gap: Spacing.two,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
    maxHeight: 100,
    color: '#000',
    backgroundColor: '#f9f9f9',
  },
  sendButton: {
    backgroundColor: '#3c87f7',
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    padding: Spacing.two,
    alignItems: 'center',
    gap: 4,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  emptyTitle: {
    fontSize: 24,
    marginBottom: Spacing.two,
  },
  emptyText: {
    textAlign: 'center',
  },
});
