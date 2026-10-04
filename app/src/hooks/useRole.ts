import { useAuth } from '../context/AuthContext';
import type { UserRole, UserStatus } from '../types/database';

interface RoleInfo {
  role: UserRole | null;
  status: UserStatus | null;
  isAdmin: boolean;
  isActive: boolean;
  isPending: boolean;
  isBlocked: boolean;
}

/**
 * Convenience UI-only role/status checks derived from the resident's
 * `profiles` row. This gates navigation and screen affordances for UX —
 * the real enforcement is server-side via RLS and the Edge Functions
 * (see CONTRACT.md). Never rely on this hook alone for anything sensitive.
 */
export function useRole(): RoleInfo {
  const { profile } = useAuth();

  return {
    role: profile?.role ?? null,
    status: profile?.status ?? null,
    isAdmin: profile?.role === 'admin',
    isActive: profile?.status === 'active',
    isPending: profile?.status === 'pending',
    isBlocked: profile?.status === 'blocked',
  };
}
