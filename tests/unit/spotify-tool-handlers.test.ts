/**
 * Unit tests for Spotify tool handlers: spotify_search_playlist,
 * spotify_create_playlist, and spotify_modify_playlist.
 *
 * Validates: Requirements 26.1, 26.2, 26.3
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the spotify-client module
vi.mock('../../supabase/functions/_shared/spotify-client.ts', () => ({
  getSpotifyAccessToken: vi.fn(),
  spotifyApiRequest: vi.fn(),
  SpotifyReconnectError: class SpotifyReconnectError extends Error {
    constructor() {
      super('Spotify reconnection required');
      this.name = 'SpotifyReconnectError';
    }
  },
}));

import {
    getSpotifyAccessToken,
    spotifyApiRequest,
} from '../../supabase/functions/_shared/spotify-client.ts';
import { getToolHandler } from '../../supabase/functions/_shared/tool-handlers.ts';

const mockGetToken = vi.mocked(getSpotifyAccessToken);
const mockApiRequest = vi.mocked(spotifyApiRequest);

describe('Tool Handlers - Spotify (Task 4.5)', () => {
  const userId = 'user-spotify-123';
  const mockSupabase = {} as any; // Supabase is passed to getSpotifyAccessToken

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockResolvedValue('mock-access-token');
  });

  describe('spotify_search_playlist', () => {
    it('searches for playlists and returns formatted results', async () => {
      const handler = getToolHandler('spotify_search_playlist')!;

      mockApiRequest.mockResolvedValue({
        playlists: {
          items: [
            {
              id: 'pl-1',
              name: 'Workout Beats',
              description: 'High energy tracks',
              tracks: { total: 50 },
              external_urls: { spotify: 'https://open.spotify.com/playlist/pl-1' },
            },
            {
              id: 'pl-2',
              name: 'Gym Motivation',
              description: '',
              tracks: { total: 30 },
              external_urls: { spotify: 'https://open.spotify.com/playlist/pl-2' },
            },
          ],
        },
      });

      const result = (await handler(mockSupabase, userId, {
        query: 'workout',
        limit: 5,
      })) as any;

      expect(mockGetToken).toHaveBeenCalledWith(mockSupabase, userId);
      expect(mockApiRequest).toHaveBeenCalledWith(
        'mock-access-token',
        'GET',
        '/search?type=playlist&q=workout&limit=5'
      );
      expect(result.playlists).toHaveLength(2);
      expect(result.playlists[0]).toEqual({
        id: 'pl-1',
        name: 'Workout Beats',
        description: 'High energy tracks',
        tracks_total: 50,
        external_url: 'https://open.spotify.com/playlist/pl-1',
      });
    });

    it('defaults limit to 5 when not provided', async () => {
      const handler = getToolHandler('spotify_search_playlist')!;
      mockApiRequest.mockResolvedValue({ playlists: { items: [] } });

      await handler(mockSupabase, userId, { query: 'chill' });

      expect(mockApiRequest).toHaveBeenCalledWith(
        'mock-access-token',
        'GET',
        '/search?type=playlist&q=chill&limit=5'
      );
    });

    it('throws when query is missing', async () => {
      const handler = getToolHandler('spotify_search_playlist')!;

      await expect(handler(mockSupabase, userId, {})).rejects.toThrow(
        'spotify_search_playlist requires a "query" argument'
      );
    });

    it('URL-encodes the query parameter', async () => {
      const handler = getToolHandler('spotify_search_playlist')!;
      mockApiRequest.mockResolvedValue({ playlists: { items: [] } });

      await handler(mockSupabase, userId, { query: 'high energy workout' });

      expect(mockApiRequest).toHaveBeenCalledWith(
        'mock-access-token',
        'GET',
        '/search?type=playlist&q=high%20energy%20workout&limit=5'
      );
    });

    it('handles empty results gracefully', async () => {
      const handler = getToolHandler('spotify_search_playlist')!;
      mockApiRequest.mockResolvedValue({ playlists: { items: [] } });

      const result = (await handler(mockSupabase, userId, {
        query: 'nonexistent',
      })) as any;

      expect(result.playlists).toEqual([]);
    });

    it('propagates SpotifyReconnectError when token retrieval fails', async () => {
      const handler = getToolHandler('spotify_search_playlist')!;
      mockGetToken.mockRejectedValue(new Error('Spotify reconnection required'));

      await expect(
        handler(mockSupabase, userId, { query: 'test' })
      ).rejects.toThrow('Spotify reconnection required');
    });
  });

  describe('spotify_create_playlist', () => {
    it('creates a playlist and returns details', async () => {
      const handler = getToolHandler('spotify_create_playlist')!;

      mockApiRequest
        .mockResolvedValueOnce({ id: 'spotify-user-42' }) // GET /me
        .mockResolvedValueOnce({
          id: 'new-pl-1',
          name: 'Morning Run',
          external_urls: { spotify: 'https://open.spotify.com/playlist/new-pl-1' },
        }); // POST /users/.../playlists

      const result = (await handler(mockSupabase, userId, {
        name: 'Morning Run',
        description: 'Energizing morning playlist',
      })) as any;

      expect(mockApiRequest).toHaveBeenCalledWith(
        'mock-access-token',
        'GET',
        '/me'
      );
      expect(mockApiRequest).toHaveBeenCalledWith(
        'mock-access-token',
        'POST',
        '/users/spotify-user-42/playlists',
        { name: 'Morning Run', description: 'Energizing morning playlist', public: false }
      );
      expect(result).toEqual({
        playlist_id: 'new-pl-1',
        name: 'Morning Run',
        external_url: 'https://open.spotify.com/playlist/new-pl-1',
        tracks_added: 0,
      });
    });

    it('creates a playlist and adds tracks when track_uris provided', async () => {
      const handler = getToolHandler('spotify_create_playlist')!;
      const trackUris = ['spotify:track:abc', 'spotify:track:def'];

      mockApiRequest
        .mockResolvedValueOnce({ id: 'spotify-user-42' }) // GET /me
        .mockResolvedValueOnce({
          id: 'new-pl-2',
          name: 'Lift Heavy',
          external_urls: { spotify: 'https://open.spotify.com/playlist/new-pl-2' },
        }) // POST create
        .mockResolvedValueOnce({ snapshot_id: 'snap-1' }); // POST add tracks

      const result = (await handler(mockSupabase, userId, {
        name: 'Lift Heavy',
        track_uris: trackUris,
      })) as any;

      expect(mockApiRequest).toHaveBeenCalledWith(
        'mock-access-token',
        'POST',
        '/playlists/new-pl-2/tracks',
        { uris: trackUris }
      );
      expect(result.tracks_added).toBe(2);
    });

    it('throws when name is missing', async () => {
      const handler = getToolHandler('spotify_create_playlist')!;

      await expect(
        handler(mockSupabase, userId, { description: 'no name' })
      ).rejects.toThrow('spotify_create_playlist requires a "name" argument');
    });

    it('creates playlist as private by default', async () => {
      const handler = getToolHandler('spotify_create_playlist')!;

      mockApiRequest
        .mockResolvedValueOnce({ id: 'spotify-user-42' })
        .mockResolvedValueOnce({
          id: 'pl-private',
          name: 'Secret Jams',
          external_urls: { spotify: 'https://open.spotify.com/playlist/pl-private' },
        });

      await handler(mockSupabase, userId, { name: 'Secret Jams' });

      expect(mockApiRequest).toHaveBeenCalledWith(
        'mock-access-token',
        'POST',
        '/users/spotify-user-42/playlists',
        expect.objectContaining({ public: false })
      );
    });
  });

  describe('spotify_modify_playlist', () => {
    it('adds tracks to a playlist', async () => {
      const handler = getToolHandler('spotify_modify_playlist')!;
      const addTracks = ['spotify:track:111', 'spotify:track:222'];

      mockApiRequest.mockResolvedValueOnce({ snapshot_id: 'snap-add' });

      const result = (await handler(mockSupabase, userId, {
        playlist_id: 'pl-existing',
        add_tracks: addTracks,
      })) as any;

      expect(mockApiRequest).toHaveBeenCalledWith(
        'mock-access-token',
        'POST',
        '/playlists/pl-existing/tracks',
        { uris: addTracks }
      );
      expect(result).toEqual({
        playlist_id: 'pl-existing',
        tracks_added: 2,
        tracks_removed: 0,
      });
    });

    it('removes tracks from a playlist', async () => {
      const handler = getToolHandler('spotify_modify_playlist')!;
      const removeTracks = ['spotify:track:333'];

      mockApiRequest.mockResolvedValueOnce({ snapshot_id: 'snap-rm' });

      const result = (await handler(mockSupabase, userId, {
        playlist_id: 'pl-existing',
        remove_tracks: removeTracks,
      })) as any;

      expect(mockApiRequest).toHaveBeenCalledWith(
        'mock-access-token',
        'DELETE',
        '/playlists/pl-existing/tracks',
        { tracks: [{ uri: 'spotify:track:333' }] }
      );
      expect(result).toEqual({
        playlist_id: 'pl-existing',
        tracks_added: 0,
        tracks_removed: 1,
      });
    });

    it('adds and removes tracks in the same call', async () => {
      const handler = getToolHandler('spotify_modify_playlist')!;

      mockApiRequest
        .mockResolvedValueOnce({ snapshot_id: 'snap-add' }) // add
        .mockResolvedValueOnce({ snapshot_id: 'snap-rm' }); // remove

      const result = (await handler(mockSupabase, userId, {
        playlist_id: 'pl-mix',
        add_tracks: ['spotify:track:aaa'],
        remove_tracks: ['spotify:track:bbb', 'spotify:track:ccc'],
      })) as any;

      expect(result).toEqual({
        playlist_id: 'pl-mix',
        tracks_added: 1,
        tracks_removed: 2,
      });
    });

    it('throws when playlist_id is missing', async () => {
      const handler = getToolHandler('spotify_modify_playlist')!;

      await expect(
        handler(mockSupabase, userId, { add_tracks: ['spotify:track:x'] })
      ).rejects.toThrow(
        'spotify_modify_playlist requires a "playlist_id" argument'
      );
    });

    it('throws when neither add_tracks nor remove_tracks provided', async () => {
      const handler = getToolHandler('spotify_modify_playlist')!;

      await expect(
        handler(mockSupabase, userId, { playlist_id: 'pl-1' })
      ).rejects.toThrow(
        'spotify_modify_playlist requires at least one of "add_tracks" or "remove_tracks"'
      );
    });
  });

  describe('spotify_suggest_pace_playlist', () => {
    it('suggests playlists for running with target pace', async () => {
      const handler = getToolHandler('spotify_suggest_pace_playlist')!;

      mockApiRequest.mockResolvedValue({
        playlists: {
          items: [
            {
              id: 'pace-pl-1',
              name: '170 BPM Running Mix',
              description: 'High cadence running tracks',
              tracks: { total: 40 },
              external_urls: { spotify: 'https://open.spotify.com/playlist/pace-pl-1' },
            },
          ],
        },
      });

      const result = (await handler(mockSupabase, userId, {
        activity_type: 'running',
        target_pace_seconds_per_km: 330,
        duration_minutes: 45,
      })) as any;

      expect(mockGetToken).toHaveBeenCalledWith(mockSupabase, userId);
      expect(result.activity_type).toBe('running');
      expect(result.target_bpm_range).toEqual({ min: 170, max: 180, label: 'moderate running' });
      expect(result.effective_pace_seconds_per_km).toBe(330);
      expect(result.duration_minutes).toBe(45);
      expect(result.route_context_used).toBe(false);
      expect(result.playlists).toHaveLength(1);
      expect(result.playlists[0].name).toBe('170 BPM Running Mix');
    });

    it('uses route history when target pace is not provided', async () => {
      const handler = getToolHandler('spotify_suggest_pace_playlist')!;

      mockApiRequest.mockResolvedValue({ playlists: { items: [] } });

      const result = (await handler(mockSupabase, userId, {
        activity_type: 'running',
        recent_route_summary: {
          avg_pace_seconds_per_km: 390,
          avg_speed_kmh: 9.2,
          distance_meters: 5000,
          elevation_gain_meters: 50,
        },
      })) as any;

      expect(result.effective_pace_seconds_per_km).toBe(390);
      expect(result.target_bpm_range).toEqual({ min: 150, max: 165, label: 'easy running' });
      expect(result.route_context_used).toBe(true);
    });

    it('prefers target pace over route history average', async () => {
      const handler = getToolHandler('spotify_suggest_pace_playlist')!;

      mockApiRequest.mockResolvedValue({ playlists: { items: [] } });

      const result = (await handler(mockSupabase, userId, {
        activity_type: 'running',
        target_pace_seconds_per_km: 280,
        recent_route_summary: {
          avg_pace_seconds_per_km: 390,
        },
      })) as any;

      // Should use the target pace (280) which is fast running, not the route avg (390)
      expect(result.effective_pace_seconds_per_km).toBe(280);
      expect(result.target_bpm_range).toEqual({ min: 175, max: 185, label: 'fast running' });
    });

    it('returns walking BPM range for walking activity', async () => {
      const handler = getToolHandler('spotify_suggest_pace_playlist')!;

      mockApiRequest.mockResolvedValue({ playlists: { items: [] } });

      const result = (await handler(mockSupabase, userId, {
        activity_type: 'walking',
      })) as any;

      expect(result.target_bpm_range).toEqual({ min: 115, max: 135, label: 'walking pace' });
    });

    it('returns cycling BPM range for cycling activity', async () => {
      const handler = getToolHandler('spotify_suggest_pace_playlist')!;

      mockApiRequest.mockResolvedValue({ playlists: { items: [] } });

      const result = (await handler(mockSupabase, userId, {
        activity_type: 'cycling',
      })) as any;

      expect(result.target_bpm_range).toEqual({ min: 130, max: 160, label: 'cycling tempo' });
    });

    it('throws when activity_type is missing', async () => {
      const handler = getToolHandler('spotify_suggest_pace_playlist')!;

      await expect(handler(mockSupabase, userId, {})).rejects.toThrow(
        'spotify_suggest_pace_playlist requires "activity_type"'
      );
    });

    it('throws when activity_type is invalid', async () => {
      const handler = getToolHandler('spotify_suggest_pace_playlist')!;

      await expect(
        handler(mockSupabase, userId, { activity_type: 'swimming' })
      ).rejects.toThrow(
        'spotify_suggest_pace_playlist requires "activity_type"'
      );
    });

    it('defaults to moderate running BPM when no pace data available', async () => {
      const handler = getToolHandler('spotify_suggest_pace_playlist')!;

      mockApiRequest.mockResolvedValue({ playlists: { items: [] } });

      const result = (await handler(mockSupabase, userId, {
        activity_type: 'running',
      })) as any;

      expect(result.effective_pace_seconds_per_km).toBeNull();
      expect(result.target_bpm_range).toEqual({ min: 160, max: 175, label: 'moderate running' });
    });

    it('returns slow jogging BPM for pace above 420 s/km', async () => {
      const handler = getToolHandler('spotify_suggest_pace_playlist')!;

      mockApiRequest.mockResolvedValue({ playlists: { items: [] } });

      const result = (await handler(mockSupabase, userId, {
        activity_type: 'running',
        target_pace_seconds_per_km: 480,
      })) as any;

      expect(result.target_bpm_range).toEqual({ min: 140, max: 155, label: 'slow jogging' });
    });
  });
});
