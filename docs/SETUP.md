# VecinoSeguro — Provisioning Runbook (top level)

This is the **order of operations** to take VecinoSeguro from repo to a working pilot. Each
component has its own detailed README (`supabase/README.md`, `app/README.md`,
`pi/setup/SETUP.md`); this file ties them together and lists what YOU must provide.

> Security: never commit real credentials, camera IPs, or network schemes. Fill secrets into
> the local `.env` files (copied from each `.env.example`), which are git-ignored.

---

## 0. Accounts & licenses to create (do these first)
| # | Account | Cost | Used for |
|---|---|---|---|
| 1 | **Supabase** project | free → $25/mo | Auth, database, Realtime, Edge Functions |
| 2 | **Cloudflare** account + a **domain** | ~$10/yr domain | Cloudflare Tunnel for secure video |
| 3 | **Apple Developer Program** | $99/yr | Publish to App Store / TestFlight |
| 4 | **Google Play Developer** | $25 once | Publish to Play Store / internal track |
| 5 | **Expo** account (EAS) | free tier ok | Cloud builds for iOS/Android |

## 1. Hardware to buy
See `pi/setup/HARDWARE.md` for the full BOM and wiring. Core: Raspberry Pi 4/5, 32GB+ card,
official PSU, **USB gigabit ethernet adapter** (2nd NIC for the camera LAN), **1-channel
opto-isolated relay module**, jumper wires + solder. Optional UPS HAT for outage resilience.

## 2. Stand up the backend (Milestone A)
Follow `supabase/README.md`:
1. Create the Supabase project; copy the Project URL + anon key + service-role key.
2. `supabase link`, then push migrations (schema + RLS).
3. Set Edge Function secrets (see names in `CONTRACT.md`), deploy `open-gate`,
   `admin-manage-user`, and `issue-video-token`.
   - **Critical shared secret:** set `SUPABASE_JWT_SECRET` here AND use the *same* value on the Pi
     (step 4.2) so Caddy can validate the `purpose:"video"` tokens. If they differ, video auth fails.
4. Run `seed.sql` (creates a placeholder admin + sample cameras — edit to real, non-committed
   values). Promote your own account to `admin`.

## 3. Configure & run the app (Milestone B)
Follow `app/README.md`:
1. `cd app && npm install`; copy `.env.example` → `.env`; fill `EXPO_PUBLIC_SUPABASE_URL`,
   `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and (after step 4) `EXPO_PUBLIC_VIDEO_BASE_URL`.
2. `npx expo start` with a dev client on a real device to test login + roles + the gate button.
3. Later: `eas build` for iOS/Android; TestFlight + Play internal track before public submission.

## 4. Build & install the Pi (Milestone C)
Follow `pi/setup/SETUP.md` and `pi/setup/HARDWARE.md`:
1. Flash Raspberry Pi OS Lite (64-bit), enable SSH, set up dual NICs (internet + camera LAN).
2. Copy `pi/.env.example` → `.env`; fill Supabase service-role key, camera RTSP URLs, GPIO pin,
   Cloudflare tunnel token, Supabase JWT secret — **on the Pi only, never in git/chat**.
3. Install go2rtc, Caddy, cloudflared, and the gate-agent; enable the `systemd` services.
4. Wire the relay across the gate remote's button per `pi/setup/HARDWARE.md`. Keep the remote
   powered. Bench-test with the mock relay first, then the real one.

## 5. Wire video end to end (Milestone D)
1. Point the Cloudflare Tunnel hostname at Caddy; set that hostname as the app's
   `EXPO_PUBLIC_VIDEO_BASE_URL`.
2. Confirm a **logged-in** phone on cellular data sees the camera tiles; a **logged-out** device
   gets denied (401).

## 6. Harden & submit (Milestone E)
Security review, rate-limit checks, error/empty states, publish the in-app Aviso de Privacidad,
prepare store assets, run EAS builds, pilot via TestFlight/Play internal, then submit publicly.

---

## Compliance checklist (Mexico / LFPDPPP) — before go-live
- [ ] Visible camera-monitoring notice posted at the gate.
- [ ] In-app **Aviso de Privacidad** published and linked.
- [ ] Footage/data retention policy defined.
- [ ] Resident consent captured at sign-up.
- [ ] HOA / legal sign-off on camera use and data handling.

## What the orchestrator still needs from you (open items)
1. Confirm the **Raspberry Pi model** on hand.
2. Open the **gate remote** and confirm accessible button pads + its power source.
3. Confirm **RTSP is enabled** on the Hikvisions; have camera IPs/credentials ready (enter on the Pi).
4. Choose a **domain name** for the Cloudflare Tunnel.
