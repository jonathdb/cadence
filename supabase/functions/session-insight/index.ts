/**
 * Edge Function: session-insight
 *
 * Proactive coaching. Given a just-completed session, gathers analytics +
 * unified progression, builds ONE concise insight, and persists it to
 * chat_messages so it surfaces at the top of chat on next open. Any actionable
 * change is emitted as a normal pending_approval tool proposal — the approval
 * gate is unchanged (this function never mutates the program).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getToolHandler } from '../_shared/tool-handlers.ts';
import { buildSessionInsight, type SessionPR } from '../_shared/session-insight.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status);
}

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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Only POST requests are accepted');

  const authResult = await authenticateRequest(req.headers.get('authorization'));
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult;

  let body: { session_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'invalid_body', 'Request body must be valid JSON');
  }
  const sessionId = body.session_id;
  if (!sessionId) return errorResponse(400, 'invalid_body', 'session_id is required');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Verify the session belongs to the user (no existence leakage otherwise).
  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!session) return errorResponse(404, 'not_found', 'Session not found');

  try {
    // PRs hit in THIS session.
    const { data: prSets } = await supabase
      .from('logged_sets')
      .select('exercise_id, weight, reps, is_pr, pr_type')
      .eq('session_id', sessionId)
      .eq('is_pr', true);

    const prs: SessionPR[] = [];
    for (const s of (prSets ?? []) as { exercise_id: string; weight: number; reps: number; pr_type: string | null }[]) {
      const { data: ex } = await supabase.from('exercises').select('name').eq('id', s.exercise_id).maybeSingle();
      prs.push({
        exercise_name: ex?.name ?? 'exercise',
        pr_type: s.pr_type ?? 'weight',
        value: s.pr_type === 'reps_at_weight' ? s.reps : s.weight,
      });
    }

    // Unified progression (server-assembled).
    const progressionHandler = getToolHandler('suggest_progression')!;
    const progression = (await progressionHandler(supabase, userId, { scope: 'full_program' })) as any;

    // Active program id (for actionable proposals).
    const { data: program } = await supabase
      .from('programs')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    const insight = buildSessionInsight({
      program_id: program?.id ?? null,
      recovery_state: progression?.recovery_state === 'compromised' ? 'compromised' : 'ok',
      prs,
      strength_suggestions: progression?.strength_suggestions ?? [],
      cardio_suggestions: progression?.cardio_suggestions ?? [],
      guardrail_notes: progression?.guardrail_notes ?? [],
    });

    // Persist as an assistant message so it appears at the top of chat next open.
    const messageData: Record<string, unknown> = {
      user_id: userId,
      role: 'assistant',
      content: insight.content,
    };
    if (insight.actionable && insight.tool_calls.length > 0) {
      messageData.tool_calls = insight.tool_calls;
    }
    const { error: insertErr } = await supabase.from('chat_messages').insert(messageData);
    if (insertErr) {
      console.error('session-insight: failed to persist message:', insertErr.message);
      return errorResponse(500, 'internal_error', 'Failed to store insight');
    }

    return jsonResponse({
      insight: {
        content: insight.content,
        actionable: insight.actionable,
        tool_calls: insight.tool_calls,
      },
    });
  } catch (err) {
    console.error('session-insight error:', err instanceof Error ? err.message : err);
    return errorResponse(500, 'internal_error', 'Failed to generate session insight');
  }
});
