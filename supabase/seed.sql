-- ============================================================================
-- VecinoSeguro — local dev seed data
--
-- PLACEHOLDER DATA ONLY. No real names, emails, phone numbers, addresses,
-- or credentials. All UUIDs, emails, and phone numbers below are synthetic
-- and use RFC 2606 / obviously-fake conventions (example.com, 555-xxxx).
-- Safe to run repeatedly via `supabase db reset`.
--
-- Seeding strategy (documented per task): profiles.id is a FK to
-- auth.users.id (1:1, id = auth.uid()), so we can't seed profiles without a
-- backing auth.users row. We insert minimal placeholder auth.users rows
-- with FIXED, well-known UUIDs; the on_auth_user_created trigger
-- (20260101000004_triggers.sql) then auto-creates each matching profiles
-- row with role='neighbor', status='pending'. We follow up with an UPDATE
-- to set the realistic role/status/full_name/etc for each seed persona.
--
-- These auth.users rows have NO usable password (encrypted_password is a
-- non-matching placeholder) and cannot log in as-is. For real local login
-- testing, create users via `supabase auth admin` / the Studio dashboard
-- using these same fixed UUIDs (or update the trigger-created profile for
-- a user you create there), then re-run just the profile UPDATEs below.
--
-- The profiles_role/status protection trigger (trg_protect_profile_role_status)
-- only special-cases service_role and admin actors; a plain seed script run
-- as the `postgres` superuser is neither, so it would otherwise revert our
-- role/status UPDATEs back to the trigger-assigned defaults. We disable that
-- trigger for the duration of this seed script and re-enable it immediately
-- after, so production behavior is unaffected.
-- ============================================================================

begin;

alter table public.profiles disable trigger trg_protect_profile_role_status;

-- ---------------------------------------------------------------------------
-- Placeholder auth.users rows (fixed UUIDs, fake @example.com emails)
-- ---------------------------------------------------------------------------
-- Column list intentionally minimal: instance_id/id/aud/role/email/
-- encrypted_password/email_confirmed_at/raw_app_meta_data/
-- raw_user_meta_data/created_at/updated_at are the long-stable core of the
-- GoTrue auth.users schema. Token/reauthentication columns (confirmation_token,
-- recovery_token, email_change_*, reauthentication_token, etc.) are
-- deliberately omitted — their exact set has changed across GoTrue
-- versions, but every version defines them as nullable or NOT NULL DEFAULT
-- '', so leaving them out and taking the default is the more portable
-- choice. `supabase start`/`db reset` runs the auth service's own
-- migrations against auth.users before this seed applies, so the modern
-- shape is what you'll actually have.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'admin.placeholder@example.com',
    'not-a-real-hash-placeholder-cannot-login',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Admin Placeholder"}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'neighbor1.placeholder@example.com',
    'not-a-real-hash-placeholder-cannot-login',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Vecino Uno Placeholder"}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'neighbor2.placeholder@example.com',
    'not-a-real-hash-placeholder-cannot-login',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Vecino Dos Placeholder"}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'neighbor3.placeholder@example.com',
    'not-a-real-hash-placeholder-cannot-login',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Vecino Tres Placeholder"}',
    now(),
    now()
  )
on conflict (id) do nothing;

-- on_auth_user_created has now fired for each row above, creating matching
-- public.profiles rows with role='neighbor', status='pending',
-- full_name='Admin Placeholder' / 'Vecino Uno Placeholder' / etc.

-- ---------------------------------------------------------------------------
-- households (placeholder unit labels)
-- ---------------------------------------------------------------------------
insert into public.households (id, unit_label, notes)
values
  ('10000000-0000-0000-0000-000000000001', 'Casa 12', 'Placeholder household — front row, near main gate.'),
  ('10000000-0000-0000-0000-000000000002', 'Casa 7',  null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Promote/adjust the placeholder profiles to realistic seed states
-- ---------------------------------------------------------------------------
update public.profiles
set role = 'admin',
    status = 'active',
    phone = '555-0100'
where id = '00000000-0000-0000-0000-000000000001';

update public.profiles
set role = 'neighbor',
    status = 'active',
    phone = '555-0101',
    household_id = '10000000-0000-0000-0000-000000000001'
where id = '00000000-0000-0000-0000-000000000002';

update public.profiles
set role = 'neighbor',
    status = 'pending',
    household_id = '10000000-0000-0000-0000-000000000002'
where id = '00000000-0000-0000-0000-000000000003';

update public.profiles
set role = 'neighbor',
    status = 'pending'
where id = '00000000-0000-0000-0000-000000000004';

alter table public.profiles enable trigger trg_protect_profile_role_status;

-- ---------------------------------------------------------------------------
-- cameras
-- ---------------------------------------------------------------------------
insert into public.cameras (id, name, stream_key, sort_order, enabled)
values
  ('20000000-0000-0000-0000-000000000001', 'Portón principal', 'porton_principal', 1, true),
  ('20000000-0000-0000-0000-000000000002', 'Portón peatonal',  'porton_peatonal',  2, true)
on conflict (id) do nothing;

commit;
