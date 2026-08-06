/**
 * Hook for managing Spotify playback state during an active session.
 *
 * Provides:
 * - Connection status check
 * - Current playback state (track, artist, playing state)
 * - Playback controls (play/pause, skip)
 * - Playlist queue fetching
 * - Playlist selection from library
 * - Resume previously used playlist for a program day
 *
 * Requirements: 27.1, 27.2, 27.3, 27.4, 27.5
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/providers/AuthProvider';
import { refreshSpotifyToken } from '@/services/spotify';

// Simple in-memory cache for last-used playlist per program day.
// Persists across component re-renders within the same app session.
const lastPlaylistCache = new Map<string, string>();

/**
 * Save the last-used playlist for a given user + program day combination.
 */
function saveLastPlaylist(userId: string, programDayId: string, playlistId: string) {
  const key = `spotify_playlist_${userId}_${programDayId}`;
  lastPlaylistCache.set(key, playlistId);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  durationMs: number;
  albumArt: string | null;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  imageUrl: string | null;
  trackCount: number;
  owner: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTrack: SpotifyTrack | null;
  progressMs: number;
  queue: SpotifyTrack[];
}

export interface UseSpotifyPlayerResult {
  /** Whether Spotify is connected for this user */
  isConnected: boolean;
  /** Whether the hook is still loading initial state */
  isLoading: boolean;
  /** Current playback state */
  playback: PlaybackState | null;
  /** User's playlists from their library */
  playlists: SpotifyPlaylist[];
  /** Agent-suggested playlists (from recent session data) */
  suggestedPlaylists: SpotifyPlaylist[];
  /** Previously used playlist for this program day */
  previousPlaylist: SpotifyPlaylist | null;
  /** Whether playlists are loading */
  isLoadingPlaylists: boolean;
  /** Play or resume playback */
  play: () => Promise<void>;
  /** Pause playback */
  pause: () => Promise<void>;
  /** Skip to next track */
  skipNext: () => Promise<void>;
  /** Start a specific playlist */
  startPlaylist: (playlistId: string) => Promise<void>;
  /** Refresh playback state */
  refreshPlayback: () => Promise<void>;
  /** Fetch user's playlists */
  fetchPlaylists: () => Promise<void>;
}

// Polling interval for playback state (10 seconds)
const PLAYBACK_POLL_INTERVAL = 10_000;

/**
 * Manages Spotify playback during an active session.
 *
 * @param programDayId - The program day ID (for playlist resume). Null for freestyle sessions.
 * @param sessionActive - Whether a session is currently in progress.
 */
export function useSpotifyPlayer(
  programDayId: string | null,
  sessionActive: boolean
): UseSpotifyPlayerResult {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [suggestedPlaylists, setSuggestedPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [previousPlaylist, setPreviousPlaylist] = useState<SpotifyPlaylist | null>(null);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRef = useRef<string | null>(null);

  // ─── Helper: get a valid token ──────────────────────────────────────────────

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!userId) return null;
    const token = await refreshSpotifyToken(userId);
    tokenRef.current = token;
    return token;
  }, [userId]);

  // ─── Check connection status ────────────────────────────────────────────────

  useEffect(() => {
    if (!userId || !sessionActive) {
      setIsConnected(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function checkConnection() {
      const token = await getToken();
      if (cancelled) return;

      if (token) {
        setIsConnected(true);
      } else {
        setIsConnected(false);
      }
      setIsLoading(false);
    }

    checkConnection();

    return () => {
      cancelled = true;
    };
  }, [userId, sessionActive, getToken]);

  // ─── Fetch playback state ──────────────────────────────────────────────────

  const refreshPlayback = useCallback(async () => {
    const token = tokenRef.current ?? (await getToken());
    if (!token) return;

    try {
      const response = await fetch(
        'https://api.spotify.com/v1/me/player/currently-playing',
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.status === 204 || response.status === 202) {
        // No active playback
        setPlayback((prev) => prev ? { ...prev, isPlaying: false } : null);
        return;
      }

      if (!response.ok) return;

      const data = await response.json();

      const currentTrack: SpotifyTrack | null = data.item
        ? {
            id: data.item.id,
            name: data.item.name,
            artist: data.item.artists?.map((a: { name: string }) => a.name).join(', ') ?? 'Unknown',
            durationMs: data.item.duration_ms ?? 0,
            albumArt: data.item.album?.images?.[0]?.url ?? null,
          }
        : null;

      setPlayback((prev) => ({
        isPlaying: data.is_playing ?? false,
        currentTrack,
        progressMs: data.progress_ms ?? 0,
        queue: prev?.queue ?? [],
      }));
    } catch {
      // Silently fail — playback state is non-critical
    }
  }, [getToken]);

  // ─── Poll playback state when connected and session active ────────────────

  useEffect(() => {
    if (!isConnected || !sessionActive) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    // Initial fetch
    refreshPlayback();

    // Start polling
    pollIntervalRef.current = setInterval(refreshPlayback, PLAYBACK_POLL_INTERVAL);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isConnected, sessionActive, refreshPlayback]);

  // ─── Fetch previously used playlist for this program day (Req 27.5) ────────

  useEffect(() => {
    if (!userId || !programDayId || !isConnected) {
      setPreviousPlaylist(null);
      return;
    }

    let cancelled = false;

    async function fetchPreviousPlaylist() {
      try {
        // Look up the last playlist used for this program day from local storage
        const storageKey = `spotify_playlist_${userId}_${programDayId}`;
        const stored = lastPlaylistCache.get(storageKey);
        if (!stored || cancelled) return;

        // Fetch playlist details from Spotify to ensure it still exists
        const token = tokenRef.current ?? (await getToken());
        if (!token || cancelled) return;

        const response = await fetch(
          `https://api.spotify.com/v1/playlists/${stored}?fields=id,name,images,tracks(total),owner(display_name)`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!response.ok || cancelled) return;

        const playlist = await response.json();
        setPreviousPlaylist({
          id: playlist.id,
          name: playlist.name,
          imageUrl: playlist.images?.[0]?.url ?? null,
          trackCount: playlist.tracks?.total ?? 0,
          owner: playlist.owner?.display_name ?? 'Unknown',
        });
      } catch {
        // Non-critical — previous playlist is a convenience feature
      }
    }

    fetchPreviousPlaylist();

    return () => {
      cancelled = true;
    };
  }, [userId, programDayId, isConnected, getToken]);

  // ─── Playback Controls ────────────────────────────────────────────────────

  const play = useCallback(async () => {
    const token = tokenRef.current ?? (await getToken());
    if (!token) return;

    try {
      await fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      setPlayback((prev) => prev ? { ...prev, isPlaying: true } : prev);
    } catch {
      // Silently fail
    }
  }, [getToken]);

  const pause = useCallback(async () => {
    const token = tokenRef.current ?? (await getToken());
    if (!token) return;

    try {
      await fetch('https://api.spotify.com/v1/me/player/pause', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      setPlayback((prev) => prev ? { ...prev, isPlaying: false } : prev);
    } catch {
      // Silently fail
    }
  }, [getToken]);

  const skipNext = useCallback(async () => {
    const token = tokenRef.current ?? (await getToken());
    if (!token) return;

    try {
      await fetch('https://api.spotify.com/v1/me/player/next', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      // Refresh playback to get the new track
      setTimeout(refreshPlayback, 500);
    } catch {
      // Silently fail
    }
  }, [getToken, refreshPlayback]);

  const startPlaylist = useCallback(
    async (playlistId: string) => {
      const token = tokenRef.current ?? (await getToken());
      if (!token) return;

      try {
        await fetch('https://api.spotify.com/v1/me/player/play', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            context_uri: `spotify:playlist:${playlistId}`,
          }),
        });

        // Save as last-used playlist for this program day (Req 27.5)
        if (userId && programDayId) {
          saveLastPlaylist(userId, programDayId, playlistId);
        }

        setPlayback((prev) => ({
          isPlaying: true,
          currentTrack: prev?.currentTrack ?? null,
          progressMs: 0,
          queue: prev?.queue ?? [],
        }));

        // Refresh to get the actual track playing
        setTimeout(refreshPlayback, 1000);
      } catch {
        // Silently fail
      }
    },
    [getToken, refreshPlayback, userId, programDayId]
  );

  // ─── Fetch user playlists (Req 27.3) ─────────────────────────────────────

  const fetchPlaylists = useCallback(async () => {
    const token = tokenRef.current ?? (await getToken());
    if (!token) return;

    setIsLoadingPlaylists(true);

    try {
      const response = await fetch(
        'https://api.spotify.com/v1/me/playlists?limit=30',
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) {
        setIsLoadingPlaylists(false);
        return;
      }

      const data = await response.json();
      const items: SpotifyPlaylist[] = (data.items ?? []).map(
        (item: {
          id: string;
          name: string;
          images: Array<{ url: string }> | null;
          tracks: { total: number };
          owner: { display_name: string };
        }) => ({
          id: item.id,
          name: item.name,
          imageUrl: item.images?.[0]?.url ?? null,
          trackCount: item.tracks?.total ?? 0,
          owner: item.owner?.display_name ?? 'Unknown',
        })
      );

      setPlaylists(items);

      // Use the first few playlists as "suggested" for now
      // In a full implementation, these would come from Agent recommendations
      setSuggestedPlaylists(items.slice(0, 5));
    } catch {
      // Non-critical
    } finally {
      setIsLoadingPlaylists(false);
    }
  }, [getToken]);

  return {
    isConnected,
    isLoading,
    playback,
    playlists,
    suggestedPlaylists,
    previousPlaylist,
    isLoadingPlaylists,
    play,
    pause,
    skipNext,
    startPlaylist,
    refreshPlayback,
    fetchPlaylists,
  };
}
