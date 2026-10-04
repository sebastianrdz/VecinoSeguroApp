import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../lib/supabase';
import type { IssueVideoTokenResponse } from '../types/api';

/**
 * Security fix (CONTRACT.md "issue-video-token" / "Video"): the app must
 * NEVER use the raw ~1h Supabase user JWT for video. It mints a short-lived
 * (TTL 60s) token scoped to `purpose: "video"` via the `issue-video-token`
 * Edge Function instead, and refreshes it well before expiry. Caddy only
 * accepts `purpose == "video"` tokens, and `issue-video-token` re-checks
 * `profiles.status` at mint time — so a blocked user stops getting new
 * video tokens within ~60s even if their session JWT is still valid, and a
 * leaked stream URL's token expires on its own shortly after.
 */

// TTL is 60s per contract; refresh comfortably before expiry so an in-flight
// stream never sees an expired token.
const REFRESH_INTERVAL_MS = 45_000;

export type VideoTokenState =
  | { kind: 'loading' }
  | { kind: 'ready'; token: string; expiresAt: string }
  /** Minting failed with 401/403 — not authenticated, or not `active`. */
  | { kind: 'denied' }
  /** Minting failed for any other reason (network, 5xx, malformed body). */
  | { kind: 'error' };

export interface UseVideoTokenResult {
  state: VideoTokenState;
  /** Forces an immediate re-mint (in addition to the ~45s auto-refresh) — use for a manual "reintentar" action. */
  retry: () => void;
}

/**
 * Mints and auto-refreshes a video-only access token while `enabled` is
 * true (i.e. while at least one stream is mounted). Pass `enabled: false`
 * (or unmount the component using this hook) to stop refreshing — there's
 * no reason to keep minting tokens when no player is on screen.
 */
export function useVideoToken(enabled: boolean): UseVideoTokenResult {
  const [state, setState] = useState<VideoTokenState>({ kind: 'loading' });
  const mountedRef = useRef(true);

  const fetchToken = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke<IssueVideoTokenResponse>(
        'issue-video-token',
        { method: 'POST' }
      );

      if (!mountedRef.current) return;

      if (error) {
        const status = (error as { context?: Response }).context?.status;
        setState(status === 401 || status === 403 ? { kind: 'denied' } : { kind: 'error' });
        return;
      }

      if (!data?.token) {
        setState({ kind: 'error' });
        return;
      }

      setState({ kind: 'ready', token: data.token, expiresAt: data.expires_at });
    } catch {
      if (mountedRef.current) setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      setState({ kind: 'loading' });
      return () => {
        mountedRef.current = false;
      };
    }

    fetchToken();
    const interval = setInterval(fetchToken, REFRESH_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [enabled, fetchToken]);

  const retry = useCallback(() => {
    if (enabled) fetchToken();
  }, [enabled, fetchToken]);

  return { state, retry };
}
