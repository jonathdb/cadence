/**
 * Spotify integration types for Cadence fitness app.
 * OAuth2 PKCE-based connection for playlist management.
 */

export interface SpotifyAuth {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scopes: string[];
}
