/**
 * Spotify Auth Service
 *
 * Implements OAuth2 PKCE flow for connecting a user's Spotify account.
 * Uses expo-auth-session + expo-web-browser for the browser-based auth flow.
 *
 * Responsibilities:
 * - Initiate Spotify OAuth2 PKCE authorization
 * - Exchange authorization code for tokens
 * - Store tokens in Supabase (user_spotify_tokens table)
 * - Check connection status and fetch account name
 * - Disconnect: revoke tokens via Spotify API, delete from DB
 * - Client-side token refresh logic with revocation handling
 *
 * Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6
 */

import {
  AuthRequest,
  exchangeCodeAsync,
  makeRedirectUri,
  revokeAsync,
  TokenTypeHint,
} from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import type { SpotifyAuth } from '@/types/spotify';
import { supabase } from '@/utils/supabase';

// Ensure the auth session completes properly on web
WebBrowser.maybeCompleteAuthSession();

// --- Constants ---

const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID!;

/**
 * Spotify OAuth2 endpoints for the PKCE flow.
 */
const SPOTIFY_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
  revocationEndpoint: 'https://accounts.spotify.com/api/token/revoke',
};

/**
 * All scopes required for Cadence's Spotify integration:
 * - Playback control: user-read-playback-state, user-modify-playback-state, user-read-currently-playing
 * - Playlist management: playlist-read-private, playlist-modify-public, playlist-modify-private
 */
const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-modify-public',
  'playlist-modify-private',
];

/**
 * Build the redirect URI using the app's scheme.
 * On native: cadence://spotify-callback
 * On web: uses 127.0.0.1 with the current port (Spotify requires IP, not localhost)
 */
function getRedirectUri(): string {
  if (typeof window !== 'undefined' && window.location) {
    // Spotify requires 127.0.0.1 for loopback — never "localhost"
    const port = window.location.port ? `:${window.location.port}` : '';
    return `http://127.0.0.1${port}/--/spotify-callback`;
  }
  return makeRedirectUri({
    scheme: 'cadence',
    path: 'spotify-callback',
  });
}

// --- Public API ---

/**
 * Initiates the Spotify OAuth2 PKCE flow.
 *
 * Opens the system browser for user authentication, exchanges the
 * authorization code for tokens, and stores them encrypted in Supabase.
 *
 * @returns The SpotifyAuth tokens on success, or null if the user cancelled.
 * @throws Error if the auth flow fails or token storage fails.
 */
export async function connectSpotify(): Promise<SpotifyAuth | null> {
  const redirectUri = getRedirectUri();
  console.log('[Spotify] redirectUri:', redirectUri);

  // Build the auth request with PKCE enabled (default)
  const request = new AuthRequest({
    clientId: SPOTIFY_CLIENT_ID,
    scopes: SPOTIFY_SCOPES,
    redirectUri,
    usePKCE: true,
  });

  // Prompt the user to authenticate via system browser
  const result = await request.promptAsync(SPOTIFY_DISCOVERY);

  if (result.type !== 'success') {
    // User cancelled or flow was dismissed
    return null;
  }

  const { code } = result.params;

  if (!code) {
    throw new Error('Spotify auth succeeded but no authorization code was returned.');
  }

  // Exchange authorization code for access + refresh tokens
  const tokenResponse = await exchangeCodeAsync(
    {
      clientId: SPOTIFY_CLIENT_ID,
      code,
      redirectUri,
      extraParams: {
        code_verifier: request.codeVerifier!,
      },
    },
    SPOTIFY_DISCOVERY
  );

  const spotifyAuth: SpotifyAuth = {
    access_token: tokenResponse.accessToken,
    refresh_token: tokenResponse.refreshToken ?? '',
    expires_at: tokenResponse.issuedAt! + (tokenResponse.expiresIn ?? 3600),
    scopes: SPOTIFY_SCOPES,
  };

  // Store tokens in Supabase
  await storeSpotifyTokens(spotifyAuth);

  return spotifyAuth;
}

/**
 * Disconnects the user's Spotify account.
 *
 * Revokes tokens via Spotify's revocation endpoint, then deletes
 * the token record from Supabase.
 *
 * Requirements: 25.6
 *
 * @param userId - The user's ID
 * @throws Error if revocation or deletion fails
 */
export async function disconnectSpotify(userId: string): Promise<void> {
  // Retrieve stored tokens for revocation
  const { data, error: fetchError } = await supabase
    .from('user_spotify_tokens')
    .select('access_token, refresh_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch Spotify tokens: ${fetchError.message}`);
  }

  if (!data) {
    // No tokens stored — nothing to disconnect
    return;
  }

  // Attempt to revoke the refresh token (preferred) or access token
  // Spotify may not support revocation for all token types, but we try.
  const tokenToRevoke = data.refresh_token || data.access_token;

  if (tokenToRevoke) {
    try {
      await revokeAsync(
        {
          clientId: SPOTIFY_CLIENT_ID,
          token: tokenToRevoke,
          tokenTypeHint: data.refresh_token
            ? TokenTypeHint.RefreshToken
            : TokenTypeHint.AccessToken,
        },
        { revocationEndpoint: SPOTIFY_DISCOVERY.revocationEndpoint }
      );
    } catch {
      // Revocation is best-effort — even if it fails, we still delete from DB.
      // Spotify tokens will expire naturally.
      console.warn('Spotify token revocation failed (best-effort). Proceeding with deletion.');
    }
  }

  // Delete from Supabase
  const { error: deleteError } = await supabase
    .from('user_spotify_tokens')
    .delete()
    .eq('user_id', userId);

  if (deleteError) {
    throw new Error(`Failed to delete Spotify tokens: ${deleteError.message}`);
  }
}

/**
 * Checks whether a user has a valid Spotify connection.
 *
 * A connection is considered valid if a token record exists and the
 * access token has not expired (or a refresh token is available for
 * server-side renewal).
 *
 * Requirements: 25.5
 *
 * @param userId - The user's ID
 * @returns Object with `connected` boolean, optional `expiresAt`, scopes, and accountName
 */
export async function getSpotifyConnectionStatus(userId: string): Promise<{
  connected: boolean;
  expiresAt: number | null;
  scopes: string[] | null;
  accountName: string | null;
}> {
  const { data, error } = await supabase
    .from('user_spotify_tokens')
    .select('access_token, refresh_token, expires_at, scopes')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check Spotify connection: ${error.message}`);
  }

  if (!data) {
    return { connected: false, expiresAt: null, scopes: null, accountName: null };
  }

  // A connection is valid if either:
  // 1. The access token hasn't expired yet, OR
  // 2. A refresh token exists (Edge Functions handle refresh server-side)
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() / 1000 : null;
  const hasRefreshToken = !!data.refresh_token;
  const isExpired = expiresAt !== null && expiresAt < now;

  const connected = !isExpired || hasRefreshToken;

  // Fetch account name from Spotify /me endpoint if we have a valid token
  let accountName: string | null = null;
  if (connected && data.access_token) {
    accountName = await fetchSpotifyAccountName(data.access_token);
  }

  return {
    connected,
    expiresAt,
    scopes: data.scopes ?? null,
    accountName,
  };
}

/**
 * Fetches the connected Spotify account display name from the /me endpoint.
 * Returns null if the request fails (token expired, network issue).
 *
 * @param accessToken - Valid Spotify access token
 */
async function fetchSpotifyAccountName(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.display_name ?? data.id ?? null;
  } catch {
    return null;
  }
}

// --- Internal Helpers ---

/**
 * Stores Spotify tokens in the user_spotify_tokens table.
 * Upserts based on user_id to handle re-connections.
 *
 * Requirements: 25.2
 */
async function storeSpotifyTokens(auth: SpotifyAuth): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('User must be authenticated to store Spotify tokens.');
  }

  const { error } = await supabase
    .from('user_spotify_tokens')
    .upsert(
      {
        user_id: user.id,
        access_token: auth.access_token,
        refresh_token: auth.refresh_token,
        expires_at: new Date(auth.expires_at * 1000).toISOString(),
        scopes: auth.scopes,
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    throw new Error(`Failed to store Spotify tokens: ${error.message}`);
  }
}

/**
 * Refreshes the Spotify access token using the stored refresh_token.
 *
 * Checks if the current token has expired. If so, requests a new access_token
 * from Spotify's token endpoint and updates the stored tokens in Supabase.
 *
 * If refresh fails (e.g., token revoked by user), clears stored tokens and
 * returns null, signaling that the user needs to reconnect.
 *
 * Requirements: 25.3, 25.4
 *
 * @param userId - The user's ID
 * @returns Valid access token, or null if reconnection is required
 */
export async function refreshSpotifyToken(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_spotify_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  // Check if token is still valid
  const expiresAt = new Date(data.expires_at).getTime();
  const now = Date.now();
  // Refresh if expiring within 60 seconds (buffer to avoid race conditions)
  if (expiresAt - now > 60_000) {
    return data.access_token;
  }

  // Token expired or about to expire — attempt refresh
  if (!data.refresh_token) {
    return null;
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: data.refresh_token,
      client_id: SPOTIFY_CLIENT_ID,
    });

    const response = await fetch(SPOTIFY_DISCOVERY.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      // Refresh failed — token likely revoked. Clear stored tokens.
      await supabase
        .from('user_spotify_tokens')
        .delete()
        .eq('user_id', userId);
      return null;
    }

    const tokenData = await response.json();
    const newAccessToken = tokenData.access_token as string;
    const expiresIn = (tokenData.expires_in as number) ?? 3600;
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const newRefreshToken = (tokenData.refresh_token as string) || data.refresh_token;

    // Update tokens in DB
    const { error: updateError } = await supabase
      .from('user_spotify_tokens')
      .update({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_at: newExpiresAt,
      })
      .eq('user_id', userId);

    if (updateError) {
      console.warn('Failed to update Spotify tokens after refresh:', updateError.message);
      // Return the new token anyway — it's valid even if DB update failed
    }

    return newAccessToken;
  } catch {
    // Network error during refresh — don't clear tokens, just return null
    return null;
  }
}
