# VecinoSeguro — App (Expo React Native)

Spanish-language (es-MX) resident app: live gate cameras + remote gate control,
with neighbor/admin roles. See `../CONTRACT.md` for the authoritative data
model and API contract this app integrates against, and `../README.md` for
the overall repo layout.

## Stack

- Expo SDK 57 (React Native 0.86, React 19), TypeScript, new architecture.
- Supabase (`@supabase/supabase-js`) for auth, Postgres, and Edge Functions;
  session persisted via `expo-secure-store`.
- React Navigation (native-stack + bottom-tabs).
- `i18n-js` + `expo-localization`, single locale shipped: `es-MX`.
- Live video via `react-native-webview` against the go2rtc/Caddy stream URL.

## Getting started

```bash
cd app
npm install
cp .env.example .env
# edit .env with your Supabase project + video tunnel values
npx expo start
```

Open in Expo Go for a quick check of UI/navigation — **camera streaming and
gate control require a custom dev client** (see below) because they depend on
`expo-secure-store` session persistence and a real Supabase backend; Expo Go
works fine for everything else during development.

### Environment variables

Names are contractual (see `../CONTRACT.md` → "Environment variables"). Only
`EXPO_PUBLIC_*` variables are safe to ship in the client bundle:

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) API key |
| `EXPO_PUBLIC_VIDEO_BASE_URL` | Cloudflare Tunnel hostname fronting Caddy + go2rtc |

Never commit a real `.env` — only `.env.example` is tracked.

## Project structure

```
app/
├── App.tsx                     # Root: providers + navigation
├── index.ts                    # Expo entry point
├── app.config.ts               # Expo config (name, bundle ids, plugins, EAS)
├── eas.json                    # EAS Build profiles (development/preview/production)
└── src/
    ├── lib/supabase.ts         # Supabase client (SecureStore-backed session), video URL builder
    ├── i18n/                   # es.ts (single source of copy) + i18n-js setup
    ├── theme/tokens.ts          # Design tokens (colors, spacing, radii, typography)
    ├── types/                   # database.ts + api.ts mirroring CONTRACT.md exactly
    ├── context/AuthContext.tsx  # Session + profile state, signIn/signUp/signOut
    ├── hooks/                    # useRole, useOpenGate, useAdminManageUser
    ├── components/               # Shared building blocks (PrimaryButton, ScreenContainer, StateViews, StatusPill)
    ├── navigation/                # RootNavigator, AuthStack, MainTabs, param-list types
    └── screens/
        ├── auth/                 # Login, Signup, PendingApproval, Blocked
        ├── cameras/               # Cameras grid + fullscreen WebView player
        ├── gate/                  # Portón (open-gate button + last-opened)
        ├── activity/              # Actividad (admin) — gate_events audit log
        ├── neighbors/             # Vecinos (admin) — approve/invite/set-role/block
        └── profile/               # Perfil/Ajustes + Aviso de Privacidad
```

## Roles & navigation

- Unauthenticated → Auth stack (Iniciar sesión / Registro).
- Signed in, profile missing/`pending`/not `active` → Pantalla de espera
  ("Cuenta en revisión").
- Signed in, `status = 'blocked'` → Pantalla de acceso bloqueado.
- Signed in, `active` → Main tabs: **Cámaras**, **Portón**, and for
  `role = 'admin'` only, **Actividad** and **Vecinos**, plus **Perfil**.

Role/status checks in `useRole()` are a **UI convenience only** — every
sensitive action (opening the gate, managing users) is re-checked server-side
by RLS policies and the Edge Functions, per `../CONTRACT.md`.

## Type checking

```bash
npm run typecheck   # tsc --noEmit
npm run doctor       # expo-doctor
```

## EAS Build (custom dev client + store builds)

```bash
npm install -g eas-cli
eas login
eas init                 # writes your real project id into app.config.ts "extra.eas.projectId"
eas build --profile development --platform ios     # or android
eas build --profile preview --platform all
eas build --profile production --platform all
eas submit --profile production --platform ios      # or android
```

`eas.json` ships three profiles:

- `development` — internal distribution, custom dev client, placeholder env
  values (replace with your project's real Supabase URL/anon key before
  building, or configure them as EAS secrets/env instead).
- `preview` — internal distribution build for QA on physical devices.
- `production` — store-distributable build with auto-incrementing build
  numbers.

## Video streaming (grid vs. fullscreen)

Per `../CONTRACT.md`'s sub-stream convention, the app requests two different
quality variants of the same `stream_key`:

- **Cámaras grid** — each tile plays the low-bandwidth `{stream_key}_sub`
  variant live (`buildStreamUrl(streamKey, videoToken, { sub: true })`).
- **Fullscreen** — the full-quality `{stream_key}` variant
  (`buildStreamUrl(streamKey, videoToken)`).

**Video token security (CONTRACT.md "issue-video-token"):** neither screen
ever passes the raw ~1h Supabase user session JWT to a stream URL. Both
source their token from `src/hooks/useVideoToken.ts`, which mints a
short-lived (TTL 60s, `purpose:"video"`) token via the `issue-video-token`
Edge Function and auto-refreshes it every ~45s while at least one stream is
mounted (`CamerasScreen` only keeps refreshing while ≥1 tile is live;
`CameraFullscreenScreen` refreshes for as long as the screen is open). Caddy
only accepts `purpose == "video"` tokens and `issue-video-token` re-checks
`profiles.status` at mint time, so a blocked user (or a leaked stream URL
carrying the raw user JWT) cannot view cameras, and a newly-blocked user
stops getting fresh video tokens within ~60s. If minting fails (401/403, or
a transient error), grid tiles silently fall back to the static placeholder
and the fullscreen screen shows a Spanish "Sin acceso al video" state —
never a raw error.

**Grid performance cap:** `CamerasScreen` does not mount a `WebView` for
every tile unconditionally. It tracks which tiles `FlatList` currently
considers visible (`onViewableItemsChanged` / `viewabilityConfig`) and only
renders a live player for those; off-screen tiles fall back to a static
placeholder. On top of that, concurrently-mounted live players are hard-capped
at `MAX_CONCURRENT_STREAMS = 6` (see `src/screens/cameras/CamerasScreen.tsx`)
— if more than 6 tiles are simultaneously visible, only the first 6 (by list
order) get a live feed and the rest show the placeholder, so scrolling stays
smooth and shared tunnel bandwidth isn't blown regardless of how many cameras
a given community has configured. Raise or lower that constant if a
community's device/network profile calls for it.

## Assets

`assets/icon.png`, `assets/adaptive-icon.png`, and `assets/favicon.png` are
solid placeholder squares (brand green `#0F5132`) so the project builds
out of the box. Replace them with real artwork before shipping to the stores.

## Known limitations / TODO for a future milestone

- No push notifications for gate events yet.
- Off-screen/over-the-cap grid tiles fall back to a static colored placeholder
  (no thumbnail image) rather than a live feed — see "Video streaming" above.
- Offline detection is best-effort: it reacts to failed network calls rather
  than a dedicated connectivity listener, to avoid adding a NetInfo
  dependency for v1.
