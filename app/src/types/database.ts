/**
 * Types mirroring CONTRACT.md exactly. Keep field/table/enum names in sync
 * with the contract — it is the source of truth for all three packages.
 */

export type UserRole = 'neighbor' | 'admin';
export type UserStatus = 'pending' | 'active' | 'blocked';
export type GateCommandStatus = 'pending' | 'sent' | 'done' | 'failed';
export type GateResult = 'success' | 'failed';
export type EventSource = 'app' | 'pi' | 'system';

export interface Profile {
  id: string; // uuid, = auth.uid()
  full_name: string | null;
  phone: string | null;
  household_id: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
}

export interface Household {
  id: string;
  unit_label: string;
  notes: string | null;
  created_at: string;
}

export interface Camera {
  id: string;
  name: string;
  stream_key: string;
  sort_order: number;
  enabled: boolean;
  created_at: string;
}

export interface GateCommand {
  id: string;
  requested_by: string;
  status: GateCommandStatus;
  created_at: string;
  picked_up_at: string | null;
  completed_at: string | null;
}

export interface GateEvent {
  id: string;
  actor_id: string | null;
  action: 'open';
  source: EventSource;
  result: GateResult;
  command_id: string | null;
  detail: string | null;
  created_at: string;
  // Convenience join used by the Actividad screen (admin), not a raw column.
  actor?: Pick<Profile, 'id' | 'full_name'> | null;
}

export interface Invite {
  id: string;
  email: string;
  role: UserRole;
  invited_by: string;
  accepted_at: string | null;
  created_at: string;
}

/** Database table/view name constants, so call sites never hand-type strings. */
export const TABLES = {
  profiles: 'profiles',
  households: 'households',
  cameras: 'cameras',
  gateCommands: 'gate_commands',
  gateEvents: 'gate_events',
  invites: 'invites',
} as const;
