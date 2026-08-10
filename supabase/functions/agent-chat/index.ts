/**
 * Edge Function: agent-chat
 *
 * Accepts user messages, decrypts the user's API key from Vault,
 * calls OpenAI or Anthropic with tool definitions, and streams
 * the assistant response back via SSE.
 *
 * Requirements: 1.1, 2.1, 2.2, 3.3
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { toAnthropicTools, toolDefinitions } from '../_shared/tool-definitions.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolCallMessage[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCallMessage {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface RequestBody {
  message?: string;
  conversation: ChatMessage[];
  provider?: 'openai' | 'anthropic';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TIMEOUT_MS = 30_000;

function errorResponse(
  status: number,
  code: string,
  message: string
): Response {
  return new Response(
    JSON.stringify({ error: { code, message } }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Extract user ID from Supabase JWT via the auth client.
 */
async function authenticateRequest(
  authHeader: string | null
): Promise<{ userId: string } | { error: Response }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: errorResponse(401, 'unauthorized', 'Missing or invalid authorization header') };
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { error: errorResponse(401, 'unauthorized', 'Invalid or expired token') };
  }

  return { userId: data.user.id };
}

/**
 * Retrieve the user's API key from Vault via the get_user_api_key function.
 */
async function getUserApiKey(
  userId: string,
  provider: 'openai' | 'anthropic'
): Promise<string | null> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.rpc('get_user_api_key', {
    p_user_id: userId,
    p_provider: provider,
  });

  if (error) {
    console.error('get_user_api_key error:', error.message);
    return null;
  }

  return data as string | null;
}

// ---------------------------------------------------------------------------
// AI Provider Adapters
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for the Cadence training agent.
 */
function getSystemPrompt(): string {
  return `You are Cadence, an AI fitness training agent. You help users create and refine personalized training programs, log workouts, track progression, and manage Spotify playlists for their sessions.

Your capabilities (via tool calls):
- Create and modify training programs
- Activate programs
- Draft journal entries for completed sessions
- Retrieve recovery summaries (sleep, HRV, resting HR)
- Retrieve recent workout summaries
- Retrieve the active training program structure
- Retrieve session history and detailed session data
- List all user programs with summary info
- Search, create, and modify Spotify playlists
- Suggest pace-matched playlists for running, cycling, and walking sessions (works with or without route history)

Guidelines:
- Be concise and actionable in your responses
- When proposing a program, always use the program_create tool so the user can review the structured output
- When modifying a program, use program_modify with clear reasoning
- Ask clarifying questions if the user's request is ambiguous
- Reference the user's history and recovery data when making recommendations
- Before suggesting program modifications, exercises, or playlists, call get_active_program to understand the user's current training structure.
- When the user requests a playlist for a specific program day (e.g., "Day 2 run"), use the get_active_program result to determine the session type, exercises, and any notes/timer_config that indicate duration. If the program day has timer_config with duration_seconds or work_seconds, calculate the duration from that. If the day name suggests a session type (e.g., "Easy Run", "Tempo Run", "Long Run"), infer the session type from the name. Only ask the user for information that cannot be determined from the program structure.
- When the user asks about progress, trends, volume changes, personal records, or consistency, call get_session_history.
- When the user references a specific past workout by date or name, or asks how a session went, call get_session_details with the session ID.
- When the user asks about past programs, requests a comparison between programs, or when proposing a new program and you need historical context, call get_programs.
- Do not ask the user to describe their program structure, exercise list, recent sessions, or training history when that information is retrievable via the retrieval tools.
- If a retrieval tool returns an empty result or indicates no data exists, proceed with the user's request using available conversational context and inform the user that no stored data was found for that category.
- When a user requests music for a running, cycling, or walking session, use the spotify_suggest_pace_playlist tool. This tool works with or without route history:
  1. If route history is available (via get_route_history), pass pace data as recent_route_summary for best BPM accuracy.
  2. If the user states a target pace in conversation, pass it as target_pace_seconds_per_km.
  3. If no route history exists but the user has an active program, pass session_context with the session type, planned duration, and intensity.
  4. If neither is available, the tool will use activity-type defaults.
  When using fallback options 2, 3, or 4 (no route data), include a brief note that recommendations will improve as more routes are tracked.
- Music preferences: When a user requests a playlist and has not mentioned music preferences in the conversation, ask what genres, artists, or songs they enjoy for their workout. If the user mentions genres (e.g., "electronic", "hip-hop"), artist names (e.g., "The Weeknd", "Daft Punk"), or song titles (e.g., "Blinding Lights") anywhere in the conversation, extract those as music preferences and pass them as the genres, seed_artists, and seed_tracks parameters to spotify_suggest_pace_playlist. Music preferences are optional refinements — if the user declines to state preferences or does not answer, proceed with the playlist suggestion using BPM alone.
- When extracting music preferences from conversation, apply at most 5 total seeds (combined genres + artists + tracks). If the user mentions more than 5 preferences, select the 5 most recently mentioned and inform the user that Spotify allows a maximum of 5 seed values at a time.
- If the user contradicts a previous music preference (e.g., "actually, not hip-hop, make it rock"), use the most recent preference and discard the contradicted one.
- After creating a playlist via spotify_create_playlist, always include the external_url from the tool result in your response so the user can open it directly in Spotify.
- Never expose or reference API keys, internal systems, or technical implementation details to the user`;
}

/**
 * Call OpenAI Chat Completions API with streaming.
 */
async function callOpenAI(
  apiKey: string,
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<Response> {
  const systemMessage: ChatMessage = { role: 'system', content: getSystemPrompt() };
  const allMessages = [systemMessage, ...messages];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: allMessages,
      tools: toolDefinitions,
      stream: true,
    }),
    signal,
  });

  return response;
}

/**
 * Call Anthropic Messages API with streaming.
 */
async function callAnthropic(
  apiKey: string,
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<Response> {
  // Anthropic uses a separate system param and different message format.
  // Key differences from OpenAI:
  // - Assistant messages with tool_calls become content blocks with type: "tool_use"
  // - Tool result messages become user messages with type: "tool_result" content blocks
  // - tool_result must directly follow an assistant message containing the matching tool_use

  const anthropicMessages: { role: string; content: any }[] = [];

  for (const m of messages) {
    if (m.role === 'system') continue;

    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      // Assistant message with tool calls → convert to Anthropic tool_use content blocks
      const contentBlocks: any[] = [];
      if (m.content) {
        contentBlocks.push({ type: 'text', text: m.content });
      }
      for (const tc of m.tool_calls) {
        let inputObj = {};
        try {
          inputObj = typeof tc.function.arguments === 'object'
            ? tc.function.arguments
            : JSON.parse(tc.function.arguments || '{}');
        } catch {
          inputObj = {};
        }
        contentBlocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: inputObj,
        });
      }
      anthropicMessages.push({ role: 'assistant', content: contentBlocks });
    } else if (m.role === 'tool') {
      // Tool result → user message with tool_result content block
      // Anthropic requires these grouped into a single user message if consecutive
      const lastMsg = anthropicMessages[anthropicMessages.length - 1];
      const toolResultBlock = {
        type: 'tool_result',
        tool_use_id: m.tool_call_id,
        content: m.content,
      };

      if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content) &&
          lastMsg.content.length > 0 && lastMsg.content[0].type === 'tool_result') {
        // Merge consecutive tool results into one user message
        lastMsg.content.push(toolResultBlock);
      } else {
        anthropicMessages.push({ role: 'user', content: [toolResultBlock] });
      }
    } else {
      // Regular user or assistant text message
      anthropicMessages.push({
        role: m.role,
        content: m.content,
      });
    }
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: getSystemPrompt(),
      messages: anthropicMessages,
      tools: toAnthropicTools(toolDefinitions),
      stream: true,
    }),
    signal,
  });

  return response;
}

// ---------------------------------------------------------------------------
// Response Streaming
// ---------------------------------------------------------------------------

/**
 * Stream the upstream AI response back to the client as SSE.
 * Also accumulates the full response for storage.
 */
function createSSEStream(
  upstreamResponse: Response,
  provider: 'openai' | 'anthropic',
  userId: string
): Response {
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const reader = upstreamResponse.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let toolCalls: { id: string; name: string; arguments: string }[] = [];

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              // Store the complete assistant message
              await storeAssistantMessage(userId, fullContent, toolCalls);
              controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
              controller.close();
              return;
            }

            try {
              const parsed = JSON.parse(data);

              if (provider === 'openai') {
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.content) {
                  fullContent += delta.content;
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'content', content: delta.content })}\n\n`)
                  );
                }
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index;
                    if (!toolCalls[idx]) {
                      toolCalls[idx] = { id: tc.id || '', name: '', arguments: '' };
                    }
                    if (tc.id) toolCalls[idx].id = tc.id;
                    if (tc.function?.name) toolCalls[idx].name = tc.function.name;
                    if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments;
                  }
                }
                // Check for finish reason with tool calls
                if (parsed.choices?.[0]?.finish_reason === 'tool_calls' || parsed.choices?.[0]?.finish_reason === 'stop') {
                  if (toolCalls.length > 0 && parsed.choices[0].finish_reason === 'tool_calls') {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: 'tool_calls', tool_calls: toolCalls })}\n\n`)
                    );
                  }
                }
              } else if (provider === 'anthropic') {
                // Anthropic streaming events
                if (parsed.type === 'content_block_delta') {
                  if (parsed.delta?.type === 'text_delta') {
                    fullContent += parsed.delta.text;
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: 'content', content: parsed.delta.text })}\n\n`)
                    );
                  } else if (parsed.delta?.type === 'input_json_delta') {
                    // Tool input streaming
                    const lastTool = toolCalls[toolCalls.length - 1];
                    if (lastTool) {
                      lastTool.arguments += parsed.delta.partial_json;
                    }
                  }
                } else if (parsed.type === 'content_block_start') {
                  if (parsed.content_block?.type === 'tool_use') {
                    toolCalls.push({
                      id: parsed.content_block.id,
                      name: parsed.content_block.name,
                      arguments: '',
                    });
                  }
                } else if (parsed.type === 'message_stop') {
                  if (toolCalls.length > 0) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: 'tool_calls', tool_calls: toolCalls })}\n\n`)
                    );
                  }
                  await storeAssistantMessage(userId, fullContent, toolCalls);
                  controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                  controller.close();
                  return;
                }
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }

        // If we exit the loop without [DONE] (stream ended), finalize
        if (toolCalls.length > 0) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'tool_calls', tool_calls: toolCalls })}\n\n`)
          );
        }
        await storeAssistantMessage(userId, fullContent, toolCalls);
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      } catch (err) {
        console.error('Stream processing error:', err);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Stream interrupted' })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ---------------------------------------------------------------------------
// Message Storage
// ---------------------------------------------------------------------------

/**
 * Store the assistant's response in the chat_messages table.
 */
async function storeAssistantMessage(
  userId: string,
  content: string,
  toolCalls: { id: string; name: string; arguments: string }[]
): Promise<void> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const messageData: Record<string, unknown> = {
      user_id: userId,
      role: 'assistant',
      content: content || '',
    };

    if (toolCalls.length > 0) {
      messageData.tool_calls = toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
        status: 'pending_approval',
      }));
    }

    const { error } = await supabase.from('chat_messages').insert(messageData);

    if (error) {
      console.error('Failed to store assistant message:', error.message);
    }
  } catch (err) {
    console.error('storeAssistantMessage error:', err);
  }
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Only POST requests are accepted');
  }

  // Authenticate the request
  const authResult = await authenticateRequest(req.headers.get('authorization'));
  if ('error' in authResult) {
    return authResult.error;
  }
  const { userId } = authResult;

  // Parse request body
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'invalid_body', 'Request body must be valid JSON');
  }

  if (!body.message && (!body.conversation || body.conversation.length === 0)) {
    return errorResponse(400, 'invalid_body', 'Message field or conversation context is required');
  }

  const provider = body.provider || 'openai';
  if (provider !== 'openai' && provider !== 'anthropic') {
    return errorResponse(400, 'invalid_provider', 'Provider must be "openai" or "anthropic"');
  }

  // Retrieve user's API key from Vault
  const apiKey = await getUserApiKey(userId, provider);
  if (!apiKey) {
    return errorResponse(400, 'api_key_required', `No ${provider} API key found. Please add your API key in settings.`);
  }

  // Build conversation messages
  const messages: ChatMessage[] = [
    ...(body.conversation || []),
    ...(body.message ? [{ role: 'user' as const, content: body.message }] : []),
  ];

  // Store the user's message (only if there is one)
  if (body.message) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from('chat_messages').insert({
        user_id: userId,
        role: 'user',
        content: body.message,
      });
    } catch (err) {
      console.error('Failed to store user message:', err);
      // Non-fatal: continue with the AI call
    }
  }

  // Call the AI provider with a 30s timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let upstreamResponse: Response;

    if (provider === 'openai') {
      upstreamResponse = await callOpenAI(apiKey, messages, controller.signal);
    } else {
      upstreamResponse = await callAnthropic(apiKey, messages, controller.signal);
    }

    clearTimeout(timeout);

    // Check for upstream errors
    if (!upstreamResponse.ok) {
      const status = upstreamResponse.status;
      const errorBody = await upstreamResponse.text();

      if (status === 429) {
        return errorResponse(429, 'rate_limit', 'AI provider rate limit exceeded. Please try again shortly.');
      }
      if (status === 401) {
        return errorResponse(400, 'api_key_invalid', 'Your API key is invalid or expired. Please update it in settings.');
      }
      console.error(`Upstream ${provider} error (${status}):`, errorBody);
      return errorResponse(502, 'provider_error', 'AI provider returned an error. Please try again.');
    }

    // Stream the response back as SSE
    return createSSEStream(upstreamResponse, provider, userId);
  } catch (err) {
    clearTimeout(timeout);

    if (err instanceof DOMException && err.name === 'AbortError') {
      return errorResponse(504, 'timeout', 'AI provider did not respond within 30 seconds. Please try again.');
    }

    console.error('Unexpected error:', err);
    return errorResponse(500, 'internal_error', 'An unexpected error occurred. Please try again.');
  }
});
