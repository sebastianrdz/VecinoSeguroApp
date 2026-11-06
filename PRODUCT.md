# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Residents ("vecinos") and administrators of a gated residential community (fraccionamiento) in Mexico. Three jobs carry equal weight:

- **Neighbor at the gate:** opening the gate, often in a hurry, outdoors, possibly one-handed from a car.
- **Neighbor checking cameras:** viewing live community cameras from anywhere.
- **Admin (community committee member):** approving new neighbors, assigning households (viviendas), managing roles and blocking access, reviewing the gate activity log.

Many neighbors are not tech-savvy.

## Product Purpose

VecinoSeguro lets approved residents open the community gate remotely and watch the community's cameras from their phones, with admins controlling who has access. Success: a neighbor opens the gate in one obvious action; an admin can onboard and revoke neighbors without technical help; nobody outside the approved community gets gate or video access.

## Positioning

Access is gated by community membership, not by a shared code or key: every neighbor has an individual account an admin approves, every gate opening is attributed in an audit log, and a blocked neighbor loses gate and video access within about a minute.

## Operating Context

- A Raspberry Pi at the community pulses a relay wired across the gate remote's button and serves camera video (go2rtc behind Caddy and a Cloudflare Tunnel). Not yet installed; the hardware milestone is pending.
- Backend is Supabase (Auth, Postgres with RLS, Edge Functions `open-gate`, `admin-manage-user`, `issue-video-token`). A dev project exists.
- Gate opening is rate-limited per user (about 8 seconds).
- Video uses a 60-second token refreshed about every 45 seconds while a stream is open.

## Capabilities and Constraints

- Roles: `neighbor`, `admin`. Statuses: `pending` (waiting-for-approval screen), `active`, `blocked` (blocked screen).
- Neighbor tabs: Cámaras, Portón, Perfil. Admin adds Actividad and Vecinos.
- A household (vivienda) is a unit label (e.g. "Casa 12"); it does not gate camera access.
- Built with Expo (React Native), TypeScript, single shared design language across iOS and Android (user's choice; do not fork the design per OS beyond native affordances).
- Spanish (es-MX) only; all copy lives in `app/src/i18n/es.ts`.
- Camera streaming and gate control are not testable end to end until the Pi exists.
- Compliance (LFPDPPP privacy notice, etc.) is tracked in `docs/SETUP.md`.

## Brand Commitments

None confirmed. The product name "VecinoSeguro" is in use; there is no logo, and the current colors (green `#0F5132`) and placeholder icons are not binding.

## Evidence on Hand

No real users, testimonials, case studies, photos of the community, or logo. A dev Supabase project and a test admin and neighbor account exist. Do not fabricate community names, testimonials, or statistics.

## Product Principles

1. **The gate button comes first.** The most common action must be obvious and reachable without reading.
2. **Plain language for non-technical neighbors.** Short, friendly es-MX copy; no jargon or raw errors.
3. **Trust is visible.** State (pending, active, blocked) and the effect of actions (who opened the gate, when) are always clear.
4. **Admin work stays light.** Approving, assigning and blocking take as few taps as possible and are hard to do by mistake.
5. **Works outdoors and in a hurry.** Large targets, strong contrast, tolerant of one-handed use and bad light.

## Accessibility & Inclusion

Older and non-technical users are a primary audience: large touch targets, high contrast, readable type sizes, clear labels and feedback. No formal standard was specified; aim for WCAG 2.1 AA as a floor.
