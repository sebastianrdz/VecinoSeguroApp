/**
 * Request/response shapes for Supabase Edge Functions, per CONTRACT.md
 * "Edge Functions" section. Keep in exact sync with the contract.
 */
import type { UserRole } from './database';

// ---- POST /functions/v1/open-gate --------------------------------------

export interface OpenGateSuccess {
  ok: true;
  command_id: string;
  status: 'pending';
}

export interface OpenGateRateLimited {
  ok: false;
  error: 'rate_limited';
  retry_after_seconds: number;
}

export interface OpenGateUnauthorized {
  ok: false;
  error: 'unauthorized' | 'not_active';
}

export type OpenGateResponse =
  | OpenGateSuccess
  | OpenGateRateLimited
  | OpenGateUnauthorized;

// ---- POST /functions/v1/admin-manage-user ------------------------------

export type AdminManageUserAction =
  | 'approve'
  | 'set_role'
  | 'block'
  | 'unblock'
  | 'remove'
  | 'invite';

export interface AdminManageUserRequest {
  action: AdminManageUserAction;
  user_id?: string;
  role?: UserRole;
  email?: string;
  household_id?: string;
}

export interface AdminManageUserSuccess {
  ok: true;
  user?: Record<string, unknown>;
}

export interface AdminManageUserError {
  ok: false;
  error: string;
}

export type AdminManageUserResponse =
  | AdminManageUserSuccess
  | AdminManageUserError;

// ---- POST /functions/v1/issue-video-token (optional) -------------------

export interface IssueVideoTokenResponse {
  token: string;
  expires_at: string;
}
