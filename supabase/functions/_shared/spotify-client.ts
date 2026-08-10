/**
 * Shared Spotify client for Cadence Edge Functions.
 *
 * Handles:
 * - Token retrieval from user_spotify_tokens table
 * - Automatic token refresh when expired
 * - Authenticated Spotify Web API calls
 * - Reconnection errors when refresh fails
 *
 * Validates: Requirements 26.1, 26.2, 26.3
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

export class SpotifyReconnectError extends Error {
  constructor() {
    super('Spotify reconnection required');
    this.name = 'SpotifyReconnectError';
  }
}

interface SpotifyTokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scopes: string[];
}

/**
 * Retrieves a valid Spotify access token for the user.
 * If the token is expired, attempts a refresh. If refresh fails, throws SpotifyReconnectError.
 */
export async function getSpotifyAccessToken(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('user_spotify_tokens')
    .select('access_token, refresh_token, expires_at, scopes')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    throw new SpotifyReconnectError();
  }

  const tokenRecord = data as SpotifyTokenRecord;
  const expiresAt = new Date(tokenRecord.expires_at);
  const now = new Date();

  // If token is still valid, return it
  if (expiresAt > now) {
    return tokenRecord.access_token;
  }

  // Token is expired — attempt refresh
  return await refreshSpotifyToken(supabase, userId, tokenRecord.refresh_token);
}

/**
 * Refreshes the Spotify access token using the refresh_token grant.
 * Updates the DB with the new access_token and expires_at.
 * Throws SpotifyReconnectError if refresh fails (e.g., token revoked).
 */
async function refreshSpotifyToken(
  supabase: SupabaseClient,
  userId: string,
  refreshToken: string
): Promise<string> {
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('Spotify client credentials not configured');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    // Refresh failed — user needs to reconnect Spotify
    throw new SpotifyReconnectError();
  }

  const tokenData = await response.json();
  const newAccessToken = tokenData.access_token as string;
  const expiresIn = tokenData.expires_in as number; // seconds
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Update the new refresh token if Spotify rotated it
  const newRefreshToken = (tokenData.refresh_token as string) || refreshToken;

  const { error: updateError } = await supabase
    .from('user_spotify_tokens')
    .update({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_at: newExpiresAt,
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('Failed to update Spotify tokens in DB:', updateError.message);
    // Still return the new token — it's valid even if DB update failed
  }

  return newAccessToken;
}

/**
 * Makes an authenticated request to the Spotify Web API.
 * Throws on non-2xx responses with details.
 */
export async function spotifyApiRequest(
  accessToken: string,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const url = path.startsWith('http') ? path : `${SPOTIFY_API_BASE}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  // Some Spotify endpoints return 200/201 with JSON, some return 204 with no body
  if (response.status === 204 || response.status === 202) {
    return null;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    // 401 means token expired/invalid — user needs to reconnect
    if (response.status === 401) {
      throw new SpotifyReconnectError();
    }
    throw new Error(
      `Spotify API error (${response.status}): ${errorBody}`
    );
  }

  return await response.json();
}
