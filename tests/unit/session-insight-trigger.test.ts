/**
 * Tests for the client session-insight trigger service (Task 10).
 * Verifies de-duplication (fires once per session id) and that a returned
 * insight schedules a local notification.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the notification service.
const mockSchedule = vi.fn().mockResolvedValue('notif-1');
vi.mock('@/services/notifications', () => ({
  scheduleInsightNotification: (...args: unknown[]) => mockSchedule(...args),
}));

// Mock supabase auth.
const mockGetSession = vi.fn();
vi.mock('@/utils/supabase', () => ({
  supabase: { auth: { getSession: () => mockGetSession() } },
}));

import { resetInsightDedup, triggerSessionInsight } from '@/services/session-insight';

const originalFetch = globalThis.fetch;

describe('triggerSessionInsight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInsightDedup();
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns no_session for an empty id', async () => {
    const r = await triggerSessionInsight('');
    expect(r.triggered).toBe(false);
    expect(r.reason).toBe('no_session');
  });

  it('calls the edge function and schedules a notification on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insight: { content: 'Great session!', actionable: false } }),
    }) as any;

    const r = await triggerSessionInsight('sess-1');
    expect(r.triggered).toBe(true);
    expect(r.content).toBe('Great session!');
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    // called with the chat deep-link route
    expect(mockSchedule.mock.calls[0][2]).toBe('/(tabs)/chat');
  });

  it('de-duplicates repeat calls for the same session id', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insight: { content: 'x', actionable: false } }),
    }) as any;

    await triggerSessionInsight('sess-dup');
    const second = await triggerSessionInsight('sess-dup');

    expect(second.triggered).toBe(false);
    expect(second.reason).toBe('duplicate');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // only the first hit the network
  });

  it('allows retry after a transient request failure (not deduped)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => null }) as any;
    const first = await triggerSessionInsight('sess-retry');
    expect(first.triggered).toBe(false);
    expect(first.reason).toBe('request_failed');

    // Second attempt should try again (dedup entry was released).
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insight: { content: 'ok now', actionable: false } }),
    }) as any;
    const second = await triggerSessionInsight('sess-retry');
    expect(second.triggered).toBe(true);
  });

  it('returns no_auth when there is no session token', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const r = await triggerSessionInsight('sess-noauth');
    expect(r.triggered).toBe(false);
    expect(r.reason).toBe('no_auth');
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});
