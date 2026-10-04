# Security — VecinoSeguro gate Pi

Operational security checklist for the Raspberry Pi bridge. Read alongside
`pi/setup/HARDWARE.md` (physical/wiring) and `pi/setup/SETUP.md`
(provisioning steps). Nothing here contains real credentials, camera IPs,
or network schemes — placeholders only, per org policy.

## Cameras (Hikvision DS-2CD1047G2H)

- **Change default admin credentials immediately on first boot**, before
  the camera is ever connected to the camera LAN in production. Hikvision
  cameras ship with a well-known default-credential/activation flow —
  leaving it unset (or using the default) is the single most common way
  these devices get compromised.
- **Disable UPnP, P2P (e.g. Hikvision's "Hik-Connect"/cloud-relay
  features), and any "auto port-forward" feature** in the camera's own
  web UI. These features exist specifically to punch outbound/relay
  connections through NAT — leaving them on would let the camera phone
  home or become remotely reachable **independent of** this project's
  Cloudflare Tunnel, directly undermining the "cameras are never exposed
  directly" requirement in `CONTRACT.md`/`README.md`. Turn all three off.
- Disable any other cloud/telemetry feature the camera's firmware offers
  that isn't strictly required for local RTSP streaming.
- **Keep camera firmware updated** via Hikvision's official (offline)
  upgrade tool, applied while the camera is on the isolated camera LAN
  — not by letting the camera reach the internet directly to
  self-update. If an update genuinely requires internet access via
  Hikvision's own cloud tooling, treat that as a deliberate, time-boxed,
  supervised exception, done from a machine on the camera LAN, not a
  standing capability of the camera itself.
- RTSP credentials (embedded in `CAMERA_<N>_RTSP_URL` in the real, private
  `.env`) should be **dedicated per-camera credentials**, not the
  camera's admin account, where the camera firmware supports a
  lower-privilege RTSP-only user.

## Network posture — outbound-only, no inbound ports, ever

- **No inbound port is opened on the Pi's router/firewall for this
  deployment** — not for SSH, not for video, not for anything. Re-state
  the architecture: Cloudflare Tunnel (`cloudflared`, outbound-only) +
  Supabase Realtime (outbound, gate-agent) + Supabase REST calls
  (outbound) are the **only** egress paths this Pi needs. There is no
  scenario in this design that requires forwarding a port inbound to the
  Pi.
- The Pi's own host firewall should default to **deny-inbound** on both
  interfaces (see `pi/setup/HARDWARE.md`'s illustrative, non-runnable
  snippet for the concept — this repo intentionally does not ship a real
  firewall config file, per org policy: describe posture in prose, don't
  paste rules).
- The camera LAN (`eth1`) has **no route to the internet and no route
  from the home LAN**, except through the Pi's own controlled software
  (go2rtc acting as an outbound RTSP client) — see the network diagram in
  `pi/setup/HARDWARE.md`.

## SSH hardening

- **Key-only authentication.** `PasswordAuthentication no` in
  `/etc/ssh/sshd_config`, confirmed after every OS image/update (some
  images can silently re-enable it — check after upgrades).
- **Never port-forward SSH to the public internet.** SSH access to this
  Pi should be LAN-only (physically on-site, or via a separate secure
  channel such as a VPN back to the site network) — it is never reachable
  from the open internet, consistent with the "no inbound ports, ever"
  rule above. If remote administration is needed, prefer tunneling SSH
  through the same Cloudflare Tunnel infrastructure (Cloudflare Access /
  `cloudflared access ssh`) rather than opening a router port — this is a
  **follow-up requirement** for whoever owns remote-admin access, not
  configured by default in this repo.
- Consider disabling root SSH login entirely (`PermitRootLogin no`) and
  administering via a named, key-authenticated user with `sudo`.

## Secret rotation

Rotate immediately on any suspected compromise (lost laptop with the
`.env` on it, a service log accidentally captured a secret, personnel
change, etc.):
- `SUPABASE_SERVICE_ROLE_KEY` — rotate from the Supabase dashboard
  (Project Settings -> API), update `.env`, restart `gate-agent.service`.
- `SUPABASE_JWT_SECRET` — rotating this invalidates **all** currently
  issued JWTs project-wide (every logged-in app session), so coordinate
  with whoever owns `app/`/`supabase/` before doing this — it's not a
  Pi-only change even though Caddy is the component that validates it.
  Update `.env` and restart `caddy.service` after rotating in Supabase.
- `CLOUDFLARE_TUNNEL_TOKEN` — revoke/reissue from the Cloudflare Zero
  Trust dashboard, update `.env`, restart `cloudflared.service`.
- Camera RTSP credentials — rotate on the camera's own web UI, update the
  corresponding `CAMERA_<N>_RTSP_URL` in `.env`, restart `go2rtc.service`.

## Least-privilege service users

Each systemd service (`pi/systemd/*.service`) runs as a dedicated,
unprivileged, no-login system user — never as `root`:
- `vecinoseguro-video` — runs `go2rtc` and `caddy` (shared user; split
  further if your threat model wants them fully separated).
- `vecinoseguro-tunnel` — runs `cloudflared`.
- `vecinoseguro-gate` — runs `gate-agent`, with membership in the `gpio`
  group (not root) for GPIO chardev access — see
  `pi/systemd/gate-agent.service`'s comments on this assumption and the
  follow-up needed once `pi/gate-agent/`'s actual GPIO access method is
  confirmed.

All four unit files also set `NoNewPrivileges=true`, `PrivateTmp=true`,
`ProtectSystem=full`, and `ProtectHome=true` as baseline systemd
sandboxing — narrow any further (e.g. `ProtectSystem=strict` +
explicit `ReadWritePaths=`) once the exact runtime file-access footprint
of each binary is confirmed on the real Pi.

## `.env` file handling

- `chmod 600`, owned by the relevant service user (see
  `pi/setup/SETUP.md` step 7) — never world- or group-readable.
- **Never committed.** Confirmed: nothing under `pi/` in this repo is a
  real secret — `pi/.env.example` contains placeholders only, and every
  other file (`pi/go2rtc.yaml`, `pi/Caddyfile`,
  `pi/cloudflared/config.yml.example`, `pi/systemd/*.service`) references
  secrets only via `${VAR}`/`{env.VAR}` substitution from that env file,
  never inline.
- If you split `.env` per service (see `pi/setup/SETUP.md` step 7's note),
  apply the same `chmod 600` + correct per-user ownership to each split
  file.

## Caddy access log (`/var/log/caddy/`)

- The video token can arrive via `?access_token=<jwt>` (see `pi/Caddyfile`'s
  `from_query`). `pi/Caddyfile`'s `log` block redacts that query parameter's
  value before writing each line, and sets `mode 0600` on the log file
  itself — but neither of those helps if the containing directory is
  world-readable.
- `/var/log/caddy/` must be owned by, and restricted to, the
  `vecinoseguro-video` system user/group — the exact `User=`/`Group=`
  `pi/systemd/caddy.service` runs Caddy as (this is also the user go2rtc
  runs as; see "Least-privilege service users" above). `pi/setup/SETUP.md`'s
  Caddy install step already does `chown vecinoseguro-video /var/log/caddy`
  — confirm on the real Pi that this stuck (`ls -ld /var/log/caddy` should
  show that owner and no world/group write access) after any OS image
  change, the same way you re-check `sshd_config` above.
