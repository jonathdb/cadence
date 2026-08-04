/**
 * Edge Function: delete-account
 *
 * Deletes all user-owned data in the correct FK order, then removes
 * the auth user via Admin API.
 *
 * Requirements: 28.3
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

// ---------------------------------------------------------------------------
// Deletion Logic
// ---------------------------------------------------------------------------

/**
 * Delete all user-owned data in the correct order to respect FK constraints.
 * Uses service_role client to bypass RLS for complete cleanup.
 */
async function deleteUserData(userId: string): Promise<{ error?: string }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Deletion order respects FK constraints (children first, parents last):
  //
  // 1. logged_sets (FK → sessions, exercises)
  // 2. block_completions (FK → sessions, blocks)
  // 3. sessions (FK → program_days)
  // 4. program_day_items (FK → program_days, exercises)
  // 5. blocks (FK → program_days)
  // 6. program_days (FK → programs)
  // 7. modification_history (FK → programs)
  // 8. programs
  // 9. personal_records
  // 10. audit_log
  // 11. chat_messages
  // 12. journal_entries
  // 13. health_data_raw, imported_workouts, imported_sleep_summaries,
  //     imported_activity_snapshots, imported_heart_rate_summaries
  // 14. user_api_keys
  // 15. user_spotify_tokens
  // 16. user_settings
  // 17. routes

  // Step 1: Get session IDs for this user (needed for logged_sets and block_completions)
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('user_id', userId);

  const sessionIds = sessions?.map((s: { id: string }) => s.id) ?? [];

  // Step 2: Get program IDs for this user (needed for program_days → program_day_items, blocks)
  const { data: programs } = await supabase
    .from('programs')
    .select('id')
    .eq('user_id', userId);

  const programIds = programs?.map((p: { id: string }) => p.id) ?? [];

  // Step 3: Get program_day IDs (needed for program_day_items and blocks)
  let programDayIds: string[] = [];
  if (programIds.length > 0) {
    const { data: programDays } = await supabase
      .from('program_days')
      .select('id')
      .in('program_id', programIds);

    programDayIds = programDays?.map((pd: { id: string }) => pd.id) ?? [];
  }

  // Step 4: Delete in FK-safe order

  // 4a. logged_sets (FK → sessions)
  if (sessionIds.length > 0) {
    const { error } = await supabase
      .from('logged_sets')
      .delete()
      .in('session_id', sessionIds);
    if (error) {
      console.error('Error deleting logged_sets:', error.message);
      return { error: `Failed to delete logged_sets: ${error.message}` };
    }
  }

  // 4b. block_completions (FK → sessions)
  if (sessionIds.length > 0) {
    const { error } = await supabase
      .from('block_completions')
      .delete()
      .in('session_id', sessionIds);
    if (error) {
      console.error('Error deleting block_completions:', error.message);
      return { error: `Failed to delete block_completions: ${error.message}` };
    }
  }

  // 4c. sessions
  const { error: sessionsError } = await supabase
    .from('sessions')
    .delete()
    .eq('user_id', userId);
  if (sessionsError) {
    console.error('Error deleting sessions:', sessionsError.message);
    return { error: `Failed to delete sessions: ${sessionsError.message}` };
  }

  // 4d. program_day_items (FK → program_days)
  if (programDayIds.length > 0) {
    const { error } = await supabase
      .from('program_day_items')
      .delete()
      .in('program_day_id', programDayIds);
    if (error) {
      console.error('Error deleting program_day_items:', error.message);
      return { error: `Failed to delete program_day_items: ${error.message}` };
    }
  }

  // 4e. blocks (FK → program_days)
  if (programDayIds.length > 0) {
    const { error } = await supabase
      .from('blocks')
      .delete()
      .in('program_day_id', programDayIds);
    if (error) {
      console.error('Error deleting blocks:', error.message);
      return { error: `Failed to delete blocks: ${error.message}` };
    }
  }

  // 4f. program_days (FK → programs)
  if (programIds.length > 0) {
    const { error } = await supabase
      .from('program_days')
      .delete()
      .in('program_id', programIds);
    if (error) {
      console.error('Error deleting program_days:', error.message);
      return { error: `Failed to delete program_days: ${error.message}` };
    }
  }

  // 4g. modification_history (FK → programs)
  const { error: modHistError } = await supabase
    .from('modification_history')
    .delete()
    .eq('user_id', userId);
  if (modHistError) {
    console.error('Error deleting modification_history:', modHistError.message);
    return { error: `Failed to delete modification_history: ${modHistError.message}` };
  }

  // 4h. programs
  const { error: programsError } = await supabase
    .from('programs')
    .delete()
    .eq('user_id', userId);
  if (programsError) {
    console.error('Error deleting programs:', programsError.message);
    return { error: `Failed to delete programs: ${programsError.message}` };
  }

  // 4i. personal_records
  const { error: prError } = await supabase
    .from('personal_records')
    .delete()
    .eq('user_id', userId);
  if (prError) {
    console.error('Error deleting personal_records:', prError.message);
    return { error: `Failed to delete personal_records: ${prError.message}` };
  }

  // 4j–4q. Tables with direct user_id FK (no child dependencies at this point)
  const directTables = [
    'audit_log',
    'chat_messages',
    'journal_entries',
    'health_data_raw',
    'imported_workouts',
    'imported_sleep_summaries',
    'imported_activity_snapshots',
    'imported_heart_rate_summaries',
    'user_api_keys',
    'user_spotify_tokens',
    'user_settings',
    'routes',
  ];

  for (const table of directTables) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) {
      console.error(`Error deleting ${table}:`, error.message);
      return { error: `Failed to delete ${table}: ${error.message}` };
    }
  }

  return {};
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

  // Delete all user-owned data
  const deleteResult = await deleteUserData(userId);
  if (deleteResult.error) {
    return errorResponse(500, 'deletion_failed', deleteResult.error);
  }

  // Delete the auth user via Supabase Admin API
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId);

  if (deleteUserError) {
    console.error('Error deleting auth user:', deleteUserError.message);
    return errorResponse(
      500,
      'auth_deletion_failed',
      'User data was deleted but auth account removal failed. Please contact support.'
    );
  }

  return new Response(
    JSON.stringify({ success: true, message: 'Account and all associated data have been deleted.' }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});
