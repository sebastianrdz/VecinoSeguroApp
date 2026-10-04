# VecinoSeguro — Shared Contract (v1)

All three packages (`app/`, `supabase/`, `pi/`) MUST integrate against these exact shapes.
Change here first, then update dependents. Names are authoritative.

## Enums
- `user_role`: `'neighbor' | 'admin'`
- `user_status`: `'pending' | 'active' | 'blocked'`
- `gate_command_status`: `'pending' | 'sent' | 'done' | 'failed'`
- `gate_result`: `'success' | 'failed'`
- `event_source`: `'app' | 'pi' | 'system'`

## Tables (Postgres / Supabase)

### profiles  (1:1 with auth.users)
| column | type | notes |
|---|---|---|
| id | uuid PK | = auth.uid() |
| full_name | text | |
| phone | text | nullable |
| household_id | uuid FK→households.id | nullable |
| role | user_role | default `'neighbor'` |
| status | user_status | default `'pending'` (admin approves) |
| created_at | timestamptz | default now() |

### households
| id uuid PK | unit_label text (e.g. "Casa 12") | notes text nullable | created_at timestamptz |

### cameras
| id uuid PK | name text (es, e.g. "Portón principal") | stream_key text UNIQUE | sort_order int | enabled bool default true | created_at timestamptz |
- `stream_key` matches the go2rtc stream name in `pi/go2rtc.yaml` (e.g. `porton_principal`).

### gate_commands   ← Pi consumes this via Realtime
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| requested_by | uuid FK→profiles.id | |
| status | gate_command_status | default `'pending'` |
| created_at | timestamptz | default now() |
| picked_up_at | timestamptz | Pi sets when received |
| completed_at | timestamptz | Pi sets on done/failed |

### gate_events   ← immutable audit log
| id uuid PK | actor_id uuid FK→profiles.id (nullable for system) | action text (`'open'`) | source event_source | result gate_result | command_id uuid FK→gate_commands.id nullable | detail text nullable | created_at timestamptz |

### invites
| id uuid PK | email text | role user_role default 'neighbor' | invited_by uuid FK→profiles.id | accepted_at timestamptz nullable | created_at timestamptz |

## RLS (intent — implement in migrations)
- `profiles`: user reads/updates own row (not role/status); admin reads/writes all.
- `households`, `cameras`: authenticated `active` users read; admin writes.
- `gate_commands`: **no direct client insert** — only Edge Function (service role). Pi (service role) reads/updates. Neighbor may read own rows.
- `gate_events`: insert only via service role; admin reads all; neighbor reads own (`actor_id = auth.uid()`).
- `invites`: admin only.
- Helper: SQL function `is_admin()` and `is_active()` used across policies.

## Edge Functions (HTTPS, require `Authorization: Bearer <supabase jwt>`)

### POST /functions/v1/open-gate
- Auth: caller must be `active`. Any active role may open (v1). 
- Server: rate-limit (max 1 accepted command / 8s / user; reject rapid repeats), insert `gate_commands` (status `pending`), insert `gate_events` (action `open`, source `app`, result set later by Pi or `success` on accept — see note).
- **Response 200:** `{ "ok": true, "command_id": "<uuid>", "status": "pending" }`
- **Response 429:** `{ "ok": false, "error": "rate_limited", "retry_after_seconds": <int> }`
- **Response 401/403:** `{ "ok": false, "error": "unauthorized" | "not_active" }`
- Note: `gate_events` audit row is written at accept time (who/when); Pi later writes a second event with the physical `result`.

### POST /functions/v1/admin-manage-user
- Auth: caller must be `admin`.
- Body: `{ "action": "approve" | "set_role" | "block" | "unblock" | "remove" | "invite" | "set_household", "user_id"?: uuid, "role"?: user_role, "email"?: string, "household_id"?: uuid }`
- `set_household` assigns/corrects a user's `household_id` (admin-only; neighbors cannot self-edit it). `approve` also optionally accepts `household_id`.
- Guards: `block`/`remove`/`set_role→neighbor` are rejected (`409 last_admin`) if they would leave zero active admins. `block`/`remove` also best-effort revoke the user's refresh tokens (fast status re-check on every call is the primary revocation).
- **Response 200:** `{ "ok": true, "user": {…} }` (or `{ "ok": true }` for invite/remove)
- **Errors:** `{ "ok": false, "error": "<code>" }` with 4xx.

### POST /functions/v1/issue-video-token  (REQUIRED — security fix, Finding 1)
- Auth: caller must be `active` (re-check `profiles.status` at mint time — this is the revocation point).
- Mints a **short-lived JWT** signed with `SUPABASE_JWT_SECRET` (HS256), TTL **60s**, containing at least
  `{ "sub": <uid>, "purpose": "video", "exp": <now+60> }`.
- **Response 200:** `{ "token": "<video jwt>", "expires_at": "<iso>" }`
- **Response 401/403:** `{ "ok": false, "error": "unauthorized" | "not_active" }`
- **Revocation model:** the app uses ONLY this token for video (never the raw 1h user token), refreshing it
  every ~45s while a stream is mounted. Caddy accepts ONLY tokens with `purpose == "video"`, so a leaked
  raw user token cannot view cameras, and a blocked user stops getting new video tokens within 60s.
- `admin-manage-user` `block`/`remove` MUST also call Supabase Auth admin **global sign-out** for that user
  to stop refresh-token renewal.

## Realtime (Pi ⇄ Supabase)
- Channel: Postgres changes on `public.gate_commands`, event `INSERT`, filter `status=eq.pending`.
- On receive, Pi: set `status='sent'`+`picked_up_at`, pulse relay, then set `status='done'|'failed'`+`completed_at` and insert a `gate_events` row (`source='pi'`, `result=...`, `command_id=<id>`).

## Video (app ⇄ Caddy/go2rtc)
- Base URL from app env `EXPO_PUBLIC_VIDEO_BASE_URL` (the Cloudflare Tunnel hostname).
- Per-camera stream page: `GET {VIDEO_BASE_URL}/stream.html?src={stream_key}` (go2rtc MSE/HLS), OR embed via WebView. Requests carry the **short-lived video token** from `issue-video-token` (header or `?access_token=`), NOT the raw user JWT. Caddy validates the token signature+exp AND requires `purpose == "video"` before proxying to go2rtc.
- `stream_key` values come from the `cameras` table.
- **Sub-stream convention (from Pi/go2rtc):** for the multi-camera **grid**, request the low-bandwidth variant `{stream_key}_sub`; for **fullscreen**, use the full-quality `{stream_key}`. The app's Cámaras grid should build tiles with `src={stream_key}_sub` and the fullscreen view with `src={stream_key}`.

## Environment variables (names are contractual; values are per-deployment secrets)
### app/  (Expo — only EXPO_PUBLIC_* are safe to ship)
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_VIDEO_BASE_URL`

### supabase/  (Edge Function secrets)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (provided by platform), `GATE_RATE_LIMIT_SECONDS` (default 8)
- `SUPABASE_JWT_SECRET` — **shared secret**: the same value MUST be set both here (so `issue-video-token` can sign the video token) and on the Pi (so Caddy can validate it). They must match exactly or video auth fails.

### pi/  (never committed — see pi/.env.example)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `GATE_GPIO_PIN` (default 17), `GATE_PULSE_MS` (default 500)
- `CAMERA_1_RTSP_URL` … (per camera), mapped to go2rtc stream_keys
- `CLOUDFLARE_TUNNEL_TOKEN`, `SUPABASE_JWT_SECRET` (for Caddy JWT validation)
