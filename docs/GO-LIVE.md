# VecinoSeguro — Go-Live & Store Submission Checklist

Complete this after the pilot works end to end (login → live cameras → gate open, with roles).
Detailed per-component steps live in `app/README.md`, `supabase/README.md`, `pi/setup/`.

## A. Pre-submission gates (must pass)
- [ ] Security review findings addressed (see the QA report; nothing `critical`/`high` open).
- [ ] `supabase db reset` run against a real local/staging stack; `seed.sql` verified once.
- [ ] Rotate all real secrets into a proper store (EAS secrets, Supabase function secrets, Pi
      `.env` on-device). No secret ever committed or pasted in chat.
- [ ] End-to-end smoke test on a real device: neighbor can view cameras + open gate; admin can
      approve/block a user and see the activity log; a **logged-out** device is denied video (401).
- [ ] Gate: physical relay pulses once (~500 ms) per tap; rapid taps rate-limited; `gate_events`
      shows every open with actor + timestamp.

## B. App store assets (both platforms)
- [ ] App name: **VecinoSeguro** · Category: Utilities / Lifestyle.
- [ ] Real app icon + adaptive icon + splash (replace the placeholder green squares in `app/assets/`).
- [ ] Screenshots (iPhone 6.7"/6.5" + iPad if supported; Android phone/tablet) — capture the
      Cámaras, Portón, and Vecinos screens in Spanish.
- [ ] Short + full description in **Spanish** (community/private-access framing — emphasize it's a
      private residential tool, not public surveillance).
- [ ] **Privacy:** in-app Aviso de Privacidad (already in the app) + store privacy questionnaire.
      Declare camera + account data usage honestly. Link a hosted privacy policy URL.
- [ ] Support contact + a note that this app is for authorized residents of one community.

## C. Apple App Store
- [ ] Apple Developer account active ($99/yr); create the App ID + app record in App Store Connect.
- [ ] `eas build --platform ios --profile production`; upload to TestFlight; pilot with a few residents.
- [ ] App Review notes: explain it's a **private, invite/approval-gated** community app; provide a
      demo login (a seeded neighbor + admin) so reviewers can test without a real gate.
- [ ] Camera-usage + background/network justifications ready (Apple asks about surveillance-style apps).
- [ ] Submit for review.

## D. Google Play
- [ ] Play Developer account active ($25 one-time); create the app in Play Console.
- [ ] `eas build --platform android --profile production` (AAB); upload to **internal testing** first.
- [ ] Data safety form + content rating questionnaire completed.
- [ ] Provide demo credentials for review; note the approval-gated access model.
- [ ] Promote from internal → production once the pilot is clean.

## E. Operational readiness
- [ ] Pi services enabled on boot and auto-restart (`systemctl status` all green); `caddy validate`
      and a real `go2rtc` start confirmed on the actual Pi.
- [ ] Cloudflare Tunnel healthy; camera streams reachable only through it, only when authenticated.
- [ ] Backup/rotation plan for Supabase; someone owns the admin account and offboarding.
- [ ] Reconciliation/alert for the rare "relay pulsed but DB write failed" case (flagged by the Pi team).
- [ ] LFPDPPP items from `docs/SETUP.md` complete (gate notice, retention policy, HOA sign-off).

## F. Day-one operations
- [ ] Seed the real cameras (names + `stream_key`s) and households.
- [ ] Onboard the first residents (they sign up → admin approves in **Vecinos**).
- [ ] Post the gate camera-monitoring notice physically at the entrance.
