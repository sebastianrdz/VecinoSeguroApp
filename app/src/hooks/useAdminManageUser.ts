import { useCallback, useState } from 'react';

import { supabase } from '../lib/supabase';
import type { AdminManageUserRequest, AdminManageUserResponse } from '../types/api';

/**
 * CONTRACT.md only documents the response *shape* for admin-manage-user
 * (`{ ok: true, user?: {...} }` / `{ ok: false, error: "<code>" }`), not a
 * closed set of error codes — `AdminManageUserError.error` is typed as a
 * plain `string` on purpose. The backend may return codes beyond any we've
 * seen before (e.g. `not_active`, `not_admin`, `invalid_action`,
 * `missing_params`, `not_found`, or new ones added later). Callers must
 * treat `error` as opaque and never assume it's one of a fixed list —
 * always fall back to a generic Spanish message (e.g.
 * `t('neighbors.actionError')`) for any code they don't specifically
 * recognize, and never pattern-match it into a crash.
 */

/** Runtime guard — a malformed/unexpected body should degrade, not throw. */
function isAdminManageUserResponse(value: unknown): value is AdminManageUserResponse {
  return (
    !!value &&
    typeof value === 'object' &&
    'ok' in value &&
    typeof (value as { ok: unknown }).ok === 'boolean'
  );
}

/**
 * Calls `POST /functions/v1/admin-manage-user` per CONTRACT.md. Caller must
 * be `admin` — enforced server-side; this hook just surfaces the result.
 */
export function useAdminManageUser() {
  const [loading, setLoading] = useState(false);

  const callAdminManageUser = useCallback(
    async (body: AdminManageUserRequest): Promise<AdminManageUserResponse> => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke<AdminManageUserResponse>(
          'admin-manage-user',
          { method: 'POST', body }
        );

        if (error) {
          const context = (error as { context?: Response }).context;
          try {
            const parsed: unknown = context ? await context.json() : null;
            if (isAdminManageUserResponse(parsed)) return parsed;
          } catch {
            // Body wasn't JSON (or had no `ok` boolean) — fall through below
            // rather than surface a half-parsed/undefined shape to the UI.
          }
          return { ok: false, error: error.message ?? 'unknown_error' };
        }

        if (isAdminManageUserResponse(data)) return data;
        return { ok: false, error: 'empty_response' };
      } catch {
        return { ok: false, error: 'network_error' };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { callAdminManageUser, loading };
}
