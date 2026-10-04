import { useCallback, useState } from 'react';

import { supabase } from '../lib/supabase';
import type { OpenGateResponse } from '../types/api';

export type OpenGateUiState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'accepted'; commandId: string }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'not_active' }
  | { kind: 'unauthorized' }
  | { kind: 'offline' }
  | { kind: 'error'; message?: string };

/**
 * Calls `POST /functions/v1/open-gate` per CONTRACT.md and maps every
 * documented response (200 / 429 / 401 / 403) plus network failure to a UI
 * state the Portón screen can render directly.
 */
export function useOpenGate() {
  const [state, setState] = useState<OpenGateUiState>({ kind: 'idle' });

  const openGate = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const { data, error } = await supabase.functions.invoke<OpenGateResponse>(
        'open-gate',
        { method: 'POST' }
      );

      if (error) {
        // supabase-js's FunctionsHttpError carries the raw Response on
        // `error.context` for non-2xx replies — parse it to recover the
        // documented `{ ok:false, error:"..." }` body.
        const context = (error as { context?: Response }).context;
        let body: OpenGateResponse | null = null;
        try {
          body = context ? await context.json() : null;
        } catch {
          body = null;
        }

        if (body && body.ok === false) {
          setState(mapErrorBody(body));
          return;
        }

        setState({ kind: 'error', message: error.message });
        return;
      }

      if (!data) {
        setState({ kind: 'error' });
        return;
      }

      if (data.ok) {
        setState({ kind: 'accepted', commandId: data.command_id });
        return;
      }

      setState(mapErrorBody(data));
    } catch (err) {
      const isNetworkError =
        err instanceof TypeError || (err as Error)?.message === 'Network request failed';
      setState(isNetworkError ? { kind: 'offline' } : { kind: 'error' });
    }
  }, []);

  const reset = useCallback(() => setState({ kind: 'idle' }), []);

  return { state, openGate, reset };
}

function mapErrorBody(body: Extract<OpenGateResponse, { ok: false }>): OpenGateUiState {
  if (body.error === 'rate_limited') {
    return { kind: 'rate_limited', retryAfterSeconds: body.retry_after_seconds };
  }
  if (body.error === 'not_active') {
    return { kind: 'not_active' };
  }
  if (body.error === 'unauthorized') {
    return { kind: 'unauthorized' };
  }
  return { kind: 'error' };
}
