/**
 * Edge Function: execute-tool-call
 *
 * Routes incoming tool calls to the appropriate handler in the tool registry,
 * validates JWT authentication, enforces a 5-second execution timeout, and
 * returns structured results or safe error responses.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 28.3, 28.4
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { checkEntitlement } from '../_shared/entitlement.ts';
import { SpotifyReconnectError } from '../_shared/spotify-client.ts';
import { getToolHandler } from '../_shared/tool-handlers.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const HANDLER_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status);
}

/**
 * Extract user ID from Supabase JWT via the auth client.
 */
async function authenticateRequest(
  authHeader: string | null
): Promise<{ userId: string } | { error: Response }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      error: errorResponse(401, 'unauthorized', 'Missing or invalid authorization header'),
    };
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return {
      error: errorResponse(401, 'unauthorized', 'Invalid or expired token'),
    };
  }

  return { userId: data.user.id };
}

/**
 * Execute a tool handler with a timeout using Promise.race.
 * Returns the handler result or throws on timeout.
 */
async function executeWithTimeout<T>(
  handlerPromise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('HANDLER_TIMEOUT'));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([handlerPromise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
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
  let body: { tool_call_id?: string; tool_name?: string; arguments?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'invalid_body', 'Request body must be valid JSON');
  }

  const { tool_call_id, tool_name, arguments: toolArgs } = body;

  // Validate required fields
  if (!tool_call_id || typeof tool_call_id !== 'string') {
    return errorResponse(400, 'invalid_body', 'tool_call_id is required and must be a string');
  }

  if (!tool_name || typeof tool_name !== 'string') {
    return errorResponse(400, 'invalid_body', 'tool_name is required and must be a string');
  }

  // Look up tool in the registry
  const handler = getToolHandler(tool_name);

  if (!handler) {
    return jsonResponse({
      tool_call_id,
      error: {
        code: 'tool_not_found',
        message: `Unrecognized tool: ${tool_name}`,
      },
    });
  }

  // Check entitlement before executing the tool handler
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const entitlement = await checkEntitlement(supabase, userId, tool_name);
    if (!entitlement.allowed) {
      return jsonResponse({
        tool_call_id,
        error: {
          code: 'access_denied',
          message: entitlement.reason || 'Insufficient entitlement to use this feature.',
        },
      });
    }

    // Execute the handler with a 5-second timeout
    const args = toolArgs && typeof toolArgs === 'object' ? toolArgs : {};

    const result = await executeWithTimeout(
      handler(supabase, userId, args),
      HANDLER_TIMEOUT_MS
    );

    return jsonResponse({ tool_call_id, result });
  } catch (err) {
    // Never expose stack traces, env vars, or internal names
    if (err instanceof Error && err.message === 'HANDLER_TIMEOUT') {
      return jsonResponse({
        tool_call_id,
        error: {
          code: 'execution_timeout',
          message: 'Tool execution exceeded the allowed time limit',
        },
      });
    }

    // Spotify tokens missing or invalid (Req 26.5)
    if (err instanceof SpotifyReconnectError) {
      return jsonResponse({
        tool_call_id,
        error: {
          code: 'spotify_not_connected',
          message: 'Spotify is not connected. Please connect your Spotify account in Settings.',
        },
      });
    }

    // Generic execution error — keep message user-safe
    return jsonResponse({
      tool_call_id,
      error: {
        code: 'execution_error',
        message: 'Tool execution failed. Please try again.',
      },
    });
  }
});
