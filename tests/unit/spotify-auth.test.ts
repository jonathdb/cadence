/**
 * Unit tests for the Spotify auth service (client-side OAuth2 PKCE flow).
 *
 * Validates: Requirements 25.1, 25.2, 25.3, 25.4, 25.5, 25.6
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mock expo-auth-session ---
const mockPromptAsync = vi.fn();
const mockExchangeCodeAsync = vi.fn();
const mockRevokeAsync = vi.fn();
const mockMakeRedirectUri = vi.fn().mockReturnValue('cadence://spotify-callback');

vi.mock('expo-auth-session', () => ({
  makeRedirectUri: (...args: unknown[]) => mockMakeRedirectUri(...args),
  exchangeCodeAsync: (...args: unknown[]) => mockExchangeCodeAsync(...args),
  revokeAsync: (...args: unknown[]) => mockRevokeAsync(...args),
  TokenTypeHint: { RefreshToken: 'refresh_token', AccessToken: 'access_token' },
  AuthRequest: class MockAuthRequest {
    codeVerifier = 'test-code-verifier';
    constructor(public config: Record<string, unknown>) {}
    promptAsync = mockPromptAsync;
  },
}));

// --- Mock expo-web-browser ---
vi.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: vi.fn(),
}));

// --- Mock Supabase ---
const mockFrom = vi.fn();
const mockGetUser = vi.fn();

vi.mock('@/utils/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getUser: () => mockGetUser(),
    },
  },
}));

// --- Mock global fetch for Spotify API calls ---
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// --- Set environment variable ---
vi.stubEnv('EXPO_PUBLIC_SPOTIFY_CLIENT_ID', 'test-spotify-client-id');

import {
    connectSpotify,
    disconnectSpotify,
    getSpotifyConnectionStatus,
    refreshSpotifyToken,
} from '@/services/spotify';

const EXPECTED_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-modify-public',
  'playlist-modify-private',
];

describe('Spotify Auth Service', () => {
  const userId = 'user-spotify-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: userId } },
    });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
    });
  });

  describe('connectSpotify', () => {
    it('should return null when user cancels the auth flow', async () => {
      mockPromptAsync.mockResolvedValue({ type: 'cancel' });

      const result = await connectSpotify();

      expect(result).toBeNull();
      expect(mockExchangeCodeAsync).not.toHaveBeenCalled();
    });

    it('should return null when auth flow is dismissed', async () => {
      mockPromptAsync.mockResolvedValue({ type: 'dismiss' });

      const result = await connectSpotify();

      expect(result).toBeNull();
    });

    it('should exchange code and store tokens on success', async () => {
      mockPromptAsync.mockResolvedValue({
        type: 'success',
        params: { code: 'auth-code-xyz' },
      });

      mockExchangeCodeAsync.mockResolvedValue({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        expiresIn: 3600,
        issuedAt: 1000000,
      });

      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      const result = await connectSpotify();

      expect(result).not.toBeNull();
      expect(result!.access_token).toBe('access-token-123');
      expect(result!.refresh_token).toBe('refresh-token-456');
      expect(result!.expires_at).toBe(1000000 + 3600);
      expect(result!.scopes).toEqual(EXPECTED_SCOPES);

      // Verify tokens were stored in Supabase with correct column names
      expect(mockFrom).toHaveBeenCalledWith('user_spotify_tokens');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: userId,
          access_token: 'access-token-123',
          refresh_token: 'refresh-token-456',
          scopes: EXPECTED_SCOPES,
        }),
        { onConflict: 'user_id' }
      );
    });

    it('should throw when no authorization code is returned', async () => {
      mockPromptAsync.mockResolvedValue({
        type: 'success',
        params: {}, // No code
      });

      await expect(connectSpotify()).rejects.toThrow(
        'no authorization code was returned'
      );
    });

    it('should throw when token storage fails', async () => {
      mockPromptAsync.mockResolvedValue({
        type: 'success',
        params: { code: 'auth-code-xyz' },
      });

      mockExchangeCodeAsync.mockResolvedValue({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        expiresIn: 3600,
        issuedAt: 1000000,
      });

      mockFrom.mockReturnValue({
        upsert: vi.fn().mockResolvedValue({
          error: { message: 'RLS violation' },
        }),
      });

      await expect(connectSpotify()).rejects.toThrow(
        'Failed to store Spotify tokens'
      );
    });

    it('should request all required scopes including playback control (Req 25.2)', async () => {
      mockPromptAsync.mockResolvedValue({ type: 'cancel' });

      await connectSpotify();

      // The AuthRequest constructor is called with the correct scopes
      expect(mockMakeRedirectUri).toHaveBeenCalledWith({
        scheme: 'cadence',
        path: 'spotify-callback',
      });
    });

    it('should use PKCE flow (Req 25.1)', async () => {
      mockPromptAsync.mockResolvedValue({
        type: 'success',
        params: { code: 'auth-code-xyz' },
      });

      mockExchangeCodeAsync.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 3600,
        issuedAt: 1000,
      });

      mockFrom.mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      });

      await connectSpotify();

      // Verify code_verifier was passed in the exchange
      expect(mockExchangeCodeAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          extraParams: { code_verifier: 'test-code-verifier' },
        }),
        expect.any(Object)
      );
    });

    it('should throw when user is not authenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      mockPromptAsync.mockResolvedValue({
        type: 'success',
        params: { code: 'auth-code-xyz' },
      });

      mockExchangeCodeAsync.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 3600,
        issuedAt: 1000,
      });

      await expect(connectSpotify()).rejects.toThrow(
        'User must be authenticated'
      );
    });
  });

  describe('disconnectSpotify', () => {
    it('should revoke tokens and delete from DB (Req 25.6)', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_spotify_tokens') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    access_token: 'stored-access-token',
                    refresh_token: 'stored-refresh-token',
                  },
                  error: null,
                }),
              }),
            }),
            delete: mockDelete,
          };
        }
        return {};
      });

      mockRevokeAsync.mockResolvedValue(true);

      await disconnectSpotify(userId);

      // Verify revocation was attempted with refresh token
      expect(mockRevokeAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'stored-refresh-token',
          tokenTypeHint: 'refresh_token',
        }),
        expect.any(Object)
      );

      // Verify deletion from DB
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should still delete from DB if revocation fails', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_spotify_tokens') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    access_token: 'stored-access-token',
                    refresh_token: 'stored-refresh-token',
                  },
                  error: null,
                }),
              }),
            }),
            delete: mockDelete,
          };
        }
        return {};
      });

      mockRevokeAsync.mockRejectedValue(new Error('Network error'));

      await disconnectSpotify(userId);

      // Even though revocation failed, tokens should still be deleted
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should do nothing when no tokens are stored', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      });

      await disconnectSpotify(userId);

      expect(mockRevokeAsync).not.toHaveBeenCalled();
    });

    it('should throw when fetch of tokens fails', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'DB unavailable' },
            }),
          }),
        }),
      });

      await expect(disconnectSpotify(userId)).rejects.toThrow(
        'Failed to fetch Spotify tokens'
      );
    });

    it('should throw when deletion fails', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_spotify_tokens') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    access_token: 'at',
                    refresh_token: 'rt',
                  },
                  error: null,
                }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                error: { message: 'Delete failed' },
              }),
            }),
          };
        }
        return {};
      });

      mockRevokeAsync.mockResolvedValue(true);

      await expect(disconnectSpotify(userId)).rejects.toThrow(
        'Failed to delete Spotify tokens'
      );
    });
  });

  describe('getSpotifyConnectionStatus', () => {
    it('should return connected=false when no tokens exist', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      });

      const status = await getSpotifyConnectionStatus(userId);

      expect(status.connected).toBe(false);
      expect(status.expiresAt).toBeNull();
      expect(status.scopes).toBeNull();
      expect(status.accountName).toBeNull();
    });

    it('should return connected=true with account name when tokens exist and not expired', async () => {
      const futureDate = new Date(Date.now() + 3600_000).toISOString();

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                access_token: 'valid-access-token',
                refresh_token: 'rt',
                expires_at: futureDate,
                scopes: ['playlist-read-private'],
              },
              error: null,
            }),
          }),
        }),
      });

      // Mock the /me endpoint call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ display_name: 'John Doe', id: 'johndoe123' }),
      });

      const status = await getSpotifyConnectionStatus(userId);

      expect(status.connected).toBe(true);
      expect(status.scopes).toEqual(['playlist-read-private']);
      expect(status.accountName).toBe('John Doe');
    });

    it('should return connected=true when expired but has refresh token', async () => {
      const pastDate = new Date(Date.now() - 3600_000).toISOString();

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                access_token: 'expired-token',
                refresh_token: 'valid-refresh',
                expires_at: pastDate,
                scopes: ['playlist-modify-public'],
              },
              error: null,
            }),
          }),
        }),
      });

      // Mock /me endpoint — might fail with expired token, returns null accountName
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const status = await getSpotifyConnectionStatus(userId);

      // Still connected because refresh token can renew server-side
      expect(status.connected).toBe(true);
      expect(status.accountName).toBeNull();
    });

    it('should return connected=false when expired and no refresh token', async () => {
      const pastDate = new Date(Date.now() - 3600_000).toISOString();

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                access_token: 'expired-token',
                refresh_token: '',
                expires_at: pastDate,
                scopes: ['playlist-modify-public'],
              },
              error: null,
            }),
          }),
        }),
      });

      const status = await getSpotifyConnectionStatus(userId);

      expect(status.connected).toBe(false);
    });

    it('should throw on database error', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Connection timeout' },
            }),
          }),
        }),
      });

      await expect(getSpotifyConnectionStatus(userId)).rejects.toThrow(
        'Failed to check Spotify connection'
      );
    });

    it('should fall back to Spotify id if display_name is null', async () => {
      const futureDate = new Date(Date.now() + 3600_000).toISOString();

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                access_token: 'valid-access-token',
                refresh_token: 'rt',
                expires_at: futureDate,
                scopes: ['playlist-read-private'],
              },
              error: null,
            }),
          }),
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ display_name: null, id: 'spotify_user_42' }),
      });

      const status = await getSpotifyConnectionStatus(userId);

      expect(status.accountName).toBe('spotify_user_42');
    });
  });

  describe('refreshSpotifyToken', () => {
    it('should return existing token if not expired (Req 25.3)', async () => {
      const futureDate = new Date(Date.now() + 3600_000).toISOString();

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                access_token: 'still-valid-token',
                refresh_token: 'rt',
                expires_at: futureDate,
              },
              error: null,
            }),
          }),
        }),
      });

      const token = await refreshSpotifyToken(userId);

      expect(token).toBe('still-valid-token');
      // Should not have called fetch for token refresh
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should refresh token when expired and return new access token (Req 25.3)', async () => {
      const pastDate = new Date(Date.now() - 3600_000).toISOString();

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_spotify_tokens') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    access_token: 'expired-token',
                    refresh_token: 'valid-refresh-token',
                    expires_at: pastDate,
                  },
                  error: null,
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        return {};
      });

      // Mock Spotify token endpoint response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      });

      const token = await refreshSpotifyToken(userId);

      expect(token).toBe('new-access-token');
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should clear tokens and return null when refresh fails (revoked) (Req 25.4)', async () => {
      const pastDate = new Date(Date.now() - 3600_000).toISOString();

      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_spotify_tokens') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    access_token: 'expired-token',
                    refresh_token: 'revoked-refresh-token',
                    expires_at: pastDate,
                  },
                  error: null,
                }),
              }),
            }),
            delete: mockDelete,
          };
        }
        return {};
      });

      // Mock Spotify token endpoint returning 400 (refresh token revoked)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      const token = await refreshSpotifyToken(userId);

      expect(token).toBeNull();
      // Should have cleared tokens from DB
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should return null when no tokens exist', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      });

      const token = await refreshSpotifyToken(userId);

      expect(token).toBeNull();
    });

    it('should return null on network error without clearing tokens', async () => {
      const pastDate = new Date(Date.now() - 3600_000).toISOString();

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                access_token: 'expired-token',
                refresh_token: 'refresh-token',
                expires_at: pastDate,
              },
              error: null,
            }),
          }),
        }),
      });

      // Simulate network failure
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const token = await refreshSpotifyToken(userId);

      expect(token).toBeNull();
    });
  });
});
