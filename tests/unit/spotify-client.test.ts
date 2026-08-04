/**
 * Unit tests for the Spotify client helper (token management and API calls).
 *
 * Validates: Requirements 26.1, 26.2, 26.3
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getSpotifyAccessToken,
    spotifyApiRequest,
    SpotifyReconnectError,
} from '../../supabase/functions/_shared/spotify-client.ts';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock Deno.env for Spotify credentials
vi.stubGlobal('Deno', {
  env: {
    get: vi.fn((key: string) => {
      if (key === 'SPOTIFY_CLIENT_ID') return 'test-client-id';
      if (key === 'SPOTIFY_CLIENT_SECRET') return 'test-client-secret';
      return undefined;
    }),
  },
});

// --- Mock Supabase helpers ---

function createMockSupabaseForTokens(options: {
  tokenData?: {
    access_token: string;
    refresh_token: string;
    expires_at: string;
    scopes: string[];
  } | null;
  tokenError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({
      error: options.updateError ?? null,
    }),
  });

  return {
    from: vi.fn((table: string) => {
      if (table === 'user_spotify_tokens') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: options.tokenData ?? null,
                error: options.tokenError ?? (options.tokenData ? null : { message: 'Not found' }),
              }),
            }),
          }),
          update: updateMock,
        };
      }
      return {};
    }),
    _updateMock: updateMock,
  } as any;
}

describe('Spotify Client', () => {
  const userId = 'user-spotify-test';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getSpotifyAccessToken', () => {
    it('returns existing token when not expired', async () => {
      const futureDate = new Date(Date.now() + 3600_000).toISOString();
      const supabase = createMockSupabaseForTokens({
        tokenData: {
          access_token: 'valid-token',
          refresh_token: 'refresh-abc',
          expires_at: futureDate,
          scopes: ['playlist-read-private'],
        },
      });

      const token = await getSpotifyAccessToken(supabase, userId);
      expect(token).toBe('valid-token');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('refreshes token when expired', async () => {
      const pastDate = new Date(Date.now() - 3600_000).toISOString();
      const supabase = createMockSupabaseForTokens({
        tokenData: {
          access_token: 'expired-token',
          refresh_token: 'refresh-xyz',
          expires_at: pastDate,
          scopes: ['playlist-read-private'],
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          expires_in: 3600,
          refresh_token: 'new-refresh',
        }),
      });

      const token = await getSpotifyAccessToken(supabase, userId);
      expect(token).toBe('new-token');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://accounts.spotify.com/api/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );
    });

    it('throws SpotifyReconnectError when no token record exists', async () => {
      const supabase = createMockSupabaseForTokens({
        tokenData: null,
        tokenError: { message: 'Not found' },
      });

      await expect(
        getSpotifyAccessToken(supabase, userId)
      ).rejects.toBeInstanceOf(SpotifyReconnectError);
    });

    it('throws SpotifyReconnectError when refresh fails (401)', async () => {
      const pastDate = new Date(Date.now() - 3600_000).toISOString();
      const supabase = createMockSupabaseForTokens({
        tokenData: {
          access_token: 'expired-token',
          refresh_token: 'revoked-refresh',
          expires_at: pastDate,
          scopes: ['playlist-read-private'],
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(
        getSpotifyAccessToken(supabase, userId)
      ).rejects.toBeInstanceOf(SpotifyReconnectError);
    });
  });

  describe('spotifyApiRequest', () => {
    it('makes a GET request with auth header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ playlists: { items: [] } }),
      });

      const result = await spotifyApiRequest(
        'test-token',
        'GET',
        '/search?type=playlist&q=test'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.spotify.com/v1/search?type=playlist&q=test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
      expect(result).toEqual({ playlists: { items: [] } });
    });

    it('makes a POST request with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: 'new-playlist-id' }),
      });

      const result = await spotifyApiRequest(
        'test-token',
        'POST',
        '/users/user123/playlists',
        { name: 'Test', public: false }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.spotify.com/v1/users/user123/playlists',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Test', public: false }),
        })
      );
      expect(result).toEqual({ id: 'new-playlist-id' });
    });

    it('handles 204 No Content responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const result = await spotifyApiRequest(
        'test-token',
        'DELETE',
        '/playlists/pl-1/tracks',
        { tracks: [{ uri: 'spotify:track:1' }] }
      );

      expect(result).toBeNull();
    });

    it('throws on non-2xx response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => '{"error":{"message":"Forbidden"}}',
      });

      await expect(
        spotifyApiRequest('bad-token', 'GET', '/me')
      ).rejects.toThrow('Spotify API error (403)');
    });
  });
});
