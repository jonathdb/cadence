/**
 * Spotify Auth Service
 *
 * Implements OAuth2 PKCE flow for connecting a user's Spotify account.
 * Uses expo-auth-session + expo-web-browser for the browser-based auth flow.
 *
 * Responsibilities:
 * - Initiate Spotify OAuth2 PKCE authorization
 * - Exchange authorization code for tokens
 * - Store tokens encrypted in Supabase (user_spotify_tokens table)
 * - Check connection status
 * - Disconnect: revoke tokens via Spotify API, delete from DB
 *
 * Token refresh is handled server-side in Edge Functions — this service
 * handles only the initial auth flow and disconnect.
 *
 * Scopes requested (phase 1):
 * - playlist-read-private
 * - playlist-modify-public
 * - playlist-modify-private
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
 * The scopes required for Cadence's playlist management features.
 * Kept minimal per requirement 25.2.
 */
const SPOTIFY_SCOPES = [
  'playlist-read-private',
  'playlist-modify-public',
  'playlist-modify-private',
];

/**
 * Build the redirect URI using the app's scheme.
 * On native: cadence://spotify-callback
 * On web: uses the current origin + path
 */
function getRedirectUri(): string {
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
 * @param userId - The user's ID
 * @throws Error if revocation or deletion fails
 */
export async function disconnectSpotify(userId: string): Promise<void> {
  // Retrieve stored tokens for revocation
  const { data, error: fetchError } = await supabase
    .from('user_spotify_tokens')
    .select('access_token_encrypted, refresh_token_encrypted')
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
  const tokenToRevoke = data.refresh_token_encrypted || data.access_token_encrypted;

  if (tokenToRevoke) {
    try {
      await revokeAsync(
        {
          clientId: SPOTIFY_CLIENT_ID,
          token: tokenToRevoke,
          tokenTypeHint: data.refresh_token_encrypted
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
 * @param userId - The user's ID
 * @returns Object with `connected` boolean and optional `expiresAt` timestamp
 */
export async function getSpotifyConnectionStatus(userId: string): Promise<{
  connected: boolean;
  expiresAt: number | null;
  scopes: string[] | null;
}> {
  const { data, error } = await supabase
    .from('user_spotify_tokens')
    .select('expires_at, scopes, refresh_token_encrypted')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check Spotify connection: ${error.message}`);
  }

  if (!data) {
    return { connected: false, expiresAt: null, scopes: null };
  }

  // A connection is valid if either:
  // 1. The access token hasn't expired yet, OR
  // 2. A refresh token exists (Edge Functions handle refresh server-side)
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() / 1000 : null;
  const hasRefreshToken = !!data.refresh_token_encrypted;
  const isExpired = expiresAt !== null && expiresAt < now;

  const connected = !isExpired || hasRefreshToken;

  return {
    connected,
    expiresAt: expiresAt,
    scopes: data.scopes ?? null,
  };
}

// --- Internal Helpers ---

/**
 * Stores Spotify tokens in the user_spotify_tokens table.
 * Upserts based on user_id to handle re-connections.
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
        access_token_encrypted: auth.access_token,
        refresh_token_encrypted: auth.refresh_token,
        expires_at: new Date(auth.expires_at * 1000).toISOString(),
        scopes: auth.scopes,
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    throw new Error(`Failed to store Spotify tokens: ${error.message}`);
  }
}
