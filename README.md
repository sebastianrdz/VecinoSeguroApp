# VecinoSeguro

Aplicación de seguridad comunitaria para un fraccionamiento en Santa Catarina, NL.
Permite a los vecinos ver las cámaras del portón en vivo y abrir el portón de forma
remota, con permisos distintos para **vecinos** y **administradores**.

> **Community security app** — live front-gate cameras + remote gate control, with
> neighbor/admin roles behind a login. React Native (Expo) app · Supabase backend ·
> Raspberry Pi bridge at the gate.

## Repository layout

```
VecinoSeguroApp/
├── app/          # Expo React Native app (Spanish UI)   — Milestone B
├── supabase/     # DB schema, RLS, Edge Functions, seed — Milestone A
├── pi/           # Raspberry Pi gate-agent + go2rtc/Caddy/cloudflared + docs — Milestone C
├── docs/         # Architecture, setup runbook, hardware wiring
└── CONTRACT.md   # Shared data-model & API contract (all packages integrate against this)
```

## Architecture (short)

```
App (iOS/Android) ──HTTPS──► Supabase (Auth · Postgres+RLS · Realtime · Edge Functions)
        │                              ▲ Realtime (outbound)
        │ video (HTTPS)                │
        ▼                              │
Cloudflare Tunnel ─► Caddy(JWT) ─► go2rtc ◄── Raspberry Pi @ gate ──► relay ─► remote button
                                     ▲                                └─► Hikvision RTSP (eth1)
```

- **Gate:** app → Edge Function `open-gate` (authz + audit) → `gate_commands` row →
  Supabase Realtime → Pi `gate-agent` pulses the relay (~500 ms). Pi is **outbound-only**.
- **Video:** Pi `go2rtc` pulls Hikvision RTSP and re-serves it; exposed only through a
  Cloudflare Tunnel fronted by Caddy, which checks the resident's Supabase JWT.

See `CONTRACT.md` for the exact schema and API shapes, and `docs/` for setup.

## Status

Greenfield build. See milestone tasks and `docs/SETUP.md` for the provisioning runbook
(accounts, credentials, deploy steps). **Never commit real credentials, camera IPs, or
network schemes** — use the `.env.example` templates.
