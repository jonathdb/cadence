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

/**
 * Normalized playlist data consumed by PlaylistCard components.
 * Produced by extractPlaylistCardData from various Spotify tool result shapes.
 */
export interface PlaylistCardData {
  /** Spotify playlist ID */
  id: string;
  /** Playlist display name */
  name: string;
  /** Playlist description (may be empty string) */
  description: string;
  /** Number of tracks in the playlist */
  trackCount: number;
  /** URL to open in Spotify app/web */
  externalUrl: string | null;
  /** Cover art image URL (first image from Spotify API) */
  imageUrl: string | null;
}
