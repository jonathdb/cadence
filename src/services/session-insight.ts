/**
 * Client trigger for proactive session insights.
 *
 * After a session is finalized, this calls the `session-insight` edge function
 * (which analyzes the session and persists a proactive message to chat_messages),
 * then schedules a local notification deep-linking to chat.
 *
 * De-duplicates per session id so a completion + sync retry can't fire it twice.
 */
import { scheduleInsightNotification } from '@/services/notifications';
import { supabase } from '@/utils/supabase';

/** Session ids we've already requested an insight for this app run. */
const requested = new Set<string>();

/** Reset dedup state (tests). */
export function resetInsightDedup(): void {
  requested.clear();
}

export interface SessionInsightResult {
  triggered: boolean;
  actionable?: boolean;
  content?: string;
  reason?: 'duplicate' | 'no_session' | 'no_auth' | 'request_failed';
}

/**
 * Request a proactive insight for a completed session. Safe to call fire-and-forget.
 * Never throws — returns a structured result.
 */
export async function triggerSessionInsight(sessionId: string): Promise<SessionInsightResult> {
  if (!sessionId) return { triggered: false, reason: 'no_session' };

  // De-dup: only one insight request per session id per app run.
  if (requested.has(sessionId)) {
    return { triggered: false, reason: 'duplicate' };
  }
  requested.add(sessionId);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      requested.delete(sessionId); // allow a later retry once authenticated
      return { triggered: false, reason: 'no_auth' };
    }

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const response = await fetch(`${supabaseUrl}/functions/v1/session-insight`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session_id: sessionId }),
    });

    if (!response.ok) {
      requested.delete(sessionId); // transient failure — allow retry
      return { triggered: false, reason: 'request_failed' };
    }

    const body = (await response.json().catch(() => null)) as
      | { insight?: { content?: string; actionable?: boolean } }
      | null;

    const insight = body?.insight;
    if (insight?.content) {
      // Fire a local notification (no-op if permission not granted / web).
      const notifBody = insight.actionable
        ? 'Cadence has a suggestion after today’s session.'
        : insight.content;
      await scheduleInsightNotification('Cadence Coach', notifBody, '/(tabs)/chat');
    }

    return { triggered: true, actionable: insight?.actionable, content: insight?.content };
  } catch {
    requested.delete(sessionId); // network error — allow retry
    return { triggered: false, reason: 'request_failed' };
  }
}
