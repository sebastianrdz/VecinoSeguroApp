# Setup — VecinoSeguro gate Pi

Step-by-step provisioning for the Raspberry Pi at the gate. Read
`pi/setup/HARDWARE.md` first for the BOM/wiring, and
`pi/setup/SECURITY.md` before going live. No real hostnames, IPs, keys, or
credentials appear anywhere below — fill those into the real (non-committed)
`.env`/OS config on the actual Pi only.

This file documents every step, including ones that require a manual
console click or an interactive login — those are called out explicitly
as **[MANUAL]** so nothing is silently assumed to be automatable from this
repo alone.

## 0. Flash the OS

1. Use Raspberry Pi Imager (or `rpi-imager` CLI) to flash **Raspberry Pi
   OS Lite (64-bit)** to the SD card / USB SSD (BOM in `HARDWARE.md`).
2. **[MANUAL]** In the Imager's advanced options (gear icon / Ctrl+Shift+X),
   before writing:
   - Set a hostname of your choosing (placeholder only — don't use a
     real one in any repo file).
   - Enable SSH, **"Allow public-key authentication only"** — do not
     enable password authentication. Paste your own SSH public key here.
   - Set locale/timezone as appropriate for the site.
   - Do NOT set a password-based login if the imager offers both — key
     auth only, per `pi/setup/SECURITY.md`.
3. Boil the plate: this step's output (the `userconf.txt`/first-boot
   config the Imager writes) lives on the SD card itself, not in this
   repo — there's nothing to commit here.

## 1. First boot & base OS config

1. Boot the Pi with both NICs' cables **not yet connected to their final
   networks** if you want to do initial setup over a bench network first
   (optional but recommended) — otherwise connect `eth0` to the home/site
   router now.
2. **[MANUAL]** SSH in using your key (no password prompt should appear —
   if one does, password auth is still enabled; fix that now per
   `pi/setup/SECURITY.md` before proceeding).
3. `sudo raspi-config` (or `nmtui`/`nmcli` on newer Raspberry Pi OS) to:
   - Confirm SSH is enabled, password auth is off
     (`/etc/ssh/sshd_config`: `PasswordAuthentication no`,
     `PubkeyAuthentication yes`), then `sudo systemctl restart ssh`.
   - Expand filesystem if on SD card.
   - Set timezone/locale if not already set via the Imager.
4. `sudo apt update && sudo apt full-upgrade -y && sudo reboot`.

## 2. Configure the two NICs

Per `pi/setup/HARDWARE.md`'s topology (`eth0` = uplink, `eth1` = isolated
camera LAN). Using `systemd-networkd` or `NetworkManager`'s `nmcli`
(whichever ships on your Raspberry Pi OS image) — example shown with
`nmcli`, substitute the placeholder subnet with a real, non-conflicting
private range you choose for the camera LAN:

```
# eth0 — uplink, DHCP from the home/site router (usually already the
# default; explicit for clarity):
sudo nmcli con mod "Wired connection 1" ipv4.method auto
# (rename/identify the eth0 connection profile name as shown by `nmcli con show`)

# eth1 — isolated camera LAN, static address, no gateway/DNS (it should
# never route anywhere but to the cameras + the Pi itself):
sudo nmcli con add type ethernet ifname eth1 con-name camera-lan \
  ipv4.method manual ipv4.addresses <CAMERA_LAN_SUBNET_PI_ADDRESS>/24 \
  ipv4.gateway "" ipv4.dns ""
sudo nmcli con up camera-lan
```

Replace `<CAMERA_LAN_SUBNET_PI_ADDRESS>` with a real placeholder-free
address once you're on the actual Pi — never write the real subnet into
this repo. Confirm cameras are reachable from the Pi on `eth1` only
(`ping`/`curl` to a camera's RTSP port) and confirm `eth1` has **no**
default route (`ip route show dev eth1` should show no `default` line).

## 3. Install go2rtc

1. Download the `go2rtc` binary for `linux/arm64` from its GitHub
   Releases page onto the Pi (verify the checksum against the published
   release checksums).
2. `sudo install -m 755 go2rtc /usr/local/bin/go2rtc`
3. `sudo apt install -y ffmpeg` — required for the sub-stream re-encode
   in `pi/go2rtc.yaml` (`ffmpeg:<stream>#...` sources).
4. Create the service user and directories:
   ```
   sudo useradd --system --no-create-home --shell /usr/sbin/nologin vecinoseguro-video
   sudo mkdir -p /opt/vecinoseguro/pi
   sudo chown -R vecinoseguro-video:vecinoseguro-video /opt/vecinoseguro/pi
   ```
5. Copy `pi/go2rtc.yaml` to `/opt/vecinoseguro/pi/go2rtc.yaml` on the Pi.
6. Copy `pi/systemd/go2rtc.service` to `/etc/systemd/system/go2rtc.service`.
7. Don't enable/start yet — do that in step 7 below once `.env` exists.

## 4. Install Caddy (custom build with the JWT module)

`pi/Caddyfile` requires the third-party `ggicci/caddy-jwt` module, which
is **not** in stock Caddy. Build with `xcaddy` — either directly on the
Pi (arm64) or cross-compiled elsewhere and copied over.

### Option A — xcaddy on-device build

```
# Install Go (per https://go.dev/doc/install, arm64 build) and xcaddy:
go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest

# Build a Caddy binary with the JWT module baked in:
~/go/bin/xcaddy build --with github.com/ggicci/caddy-jwt

sudo install -m 755 caddy /usr/local/bin/caddy
```

### Option B — Docker/xcaddy build container (build elsewhere, copy binary over)

```dockerfile
# pi/setup/ — illustrative Dockerfile snippet for a reproducible build;
# not committed as a running container in this repo (no container
# runtime is part of this deployment) — use it to build the binary, then
# `docker cp` the resulting /usr/local/bin/caddy out and onto the Pi.
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/ggicci/caddy-jwt

FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/local/bin/caddy
```

Build for `linux/arm64` (`docker buildx build --platform linux/arm64 ...`)
if building on a non-ARM machine, then copy the resulting binary onto the
Pi at `/usr/local/bin/caddy`.

### Either way

```
sudo mkdir -p /var/log/caddy
sudo useradd --system --no-create-home --shell /usr/sbin/nologin vecinoseguro-video 2>/dev/null || true
sudo chown vecinoseguro-video:vecinoseguro-video /var/log/caddy
```
(the `|| true` above just avoids an error if this user was already created
in step 3 — go2rtc and Caddy share the `vecinoseguro-video` user in this
design; see `pi/systemd/caddy.service`'s comments if you'd rather split
them.)

Copy `pi/Caddyfile` to `/opt/vecinoseguro/pi/Caddyfile` and
`pi/systemd/caddy.service` to `/etc/systemd/system/caddy.service`.

**Before first start**, validate the config against your actual built
binary:
```
caddy validate --config /opt/vecinoseguro/pi/Caddyfile --adapter caddyfile
```
This could not be run during authoring (no `caddy` binary available in
that environment) — treat this as a required step here, not optional.

## 5. Install cloudflared

1. Download the `cloudflared` `.deb` (arm64) from Cloudflare's package
   repo, or the standalone binary, per Cloudflare's current install docs.
2. `sudo dpkg -i cloudflared-linux-arm64.deb` (or
   `sudo install -m 755 cloudflared /usr/local/bin/cloudflared` for the
   standalone binary).
3. **[MANUAL]** In the Cloudflare Zero Trust dashboard (or via
   `cloudflared tunnel login` + `cloudflared tunnel create <name>` from an
   authenticated CLI session): create the tunnel, note its token, add a
   public-hostname route pointing at `http://localhost:8080` (Caddy's
   loopback port). See `pi/cloudflared/README.md` for the token-vs-config
   tradeoff — this repo defaults to the token-only method.
4. Put the token into the real `.env` as `CLOUDFLARE_TUNNEL_TOKEN` (step 7).
5. `sudo useradd --system --no-create-home --shell /usr/sbin/nologin vecinoseguro-tunnel`
6. Copy `pi/systemd/cloudflared.service` to
   `/etc/systemd/system/cloudflared.service`.
   (If you instead chose the config-file method, also copy
   `pi/cloudflared/config.yml.example` to
   `/opt/vecinoseguro/pi/cloudflared/config.yml`, fill it in, and switch
   the `ExecStart=` line per that unit file's commented alternative.)

## 6. Deploy gate-agent

`pi/gate-agent/` is owned by another engineer and out of scope for this
component to write — this step documents the expected shape assuming a
standard Python venv layout; confirm specifics against
`pi/gate-agent/README.md` once that component exists.

1. `sudo useradd --system --no-create-home --shell /usr/sbin/nologin vecinoseguro-gate`
2. `sudo usermod -aG gpio vecinoseguro-gate` (grants GPIO chardev access —
   see `pi/systemd/gate-agent.service`'s comments and
   `pi/setup/HARDWARE.md` for the wiring this drives).
3. Copy/clone `pi/gate-agent/` to `/opt/vecinoseguro/pi/gate-agent` on the
   Pi.
4. `cd /opt/vecinoseguro/pi/gate-agent && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
   (confirm the actual requirements/entrypoint file names against that
   component's own README once it exists — do not assume).
5. Copy `pi/systemd/gate-agent.service` to
   `/etc/systemd/system/gate-agent.service`, and confirm/adjust its
   `ExecStart=` to match gate-agent's real entrypoint (flagged as an
   assumption in that unit file).

## 7. Populate the real `.env`

1. On the Pi: `sudo mkdir -p /opt/vecinoseguro/pi`
2. Copy `pi/.env.example` to `/opt/vecinoseguro/pi/.env`.
3. Fill in every value — real Supabase URL/service-role key, real camera
   RTSP URLs, real Cloudflare tunnel token, real Supabase JWT secret (see
   each var's comment in `pi/.env.example` for where to find it).
4. **Never commit this file.** It's already covered by the repo's
   `.gitignore`.
5. Lock down permissions:
   ```
   sudo chown vecinoseguro-video:vecinoseguro-video /opt/vecinoseguro/pi/.env
   sudo chmod 600 /opt/vecinoseguro/pi/.env
   ```
   All four services reference the same `EnvironmentFile=` path — either
   share one `.env` (simplest; shown above) or split per-service files
   with tighter per-user ownership if your threat model wants that
   separation (see `pi/setup/SECURITY.md`).

## 8. Enable & start all four services

```
sudo systemctl daemon-reload
sudo systemctl enable --now go2rtc.service
sudo systemctl enable --now caddy.service
sudo systemctl enable --now cloudflared.service
sudo systemctl enable --now gate-agent.service
```

Verify each:
```
systemctl status go2rtc caddy cloudflared gate-agent
journalctl -u go2rtc -n 50 --no-pager
journalctl -u caddy -n 50 --no-pager
journalctl -u cloudflared -n 50 --no-pager
journalctl -u gate-agent -n 50 --no-pager
```
All four should show `active (running)` with no repeated restart loops in
the journal.

Also confirm go2rtc's loopback-only binding actually took effect:
```
ss -tlnp | grep go2rtc
# every line must show 127.0.0.1:<port> — never 0.0.0.0 or a NIC address
```

## 9. Smoke-test checklist

1. **Gate relay:** from the Supabase dashboard (Table Editor) or the app,
   insert/trigger a `gate_commands` row with `status='pending'`. Confirm
   in `journalctl -u gate-agent -f`:
   - the row is picked up (`status` -> `sent`, `picked_up_at` set),
   - the relay audibly/visibly pulses for ~`GATE_PULSE_MS`,
   - `status` transitions to `done` (or `failed`) with `completed_at` set,
   - a corresponding `gate_events` row appears with `source='pi'`.
   Also confirm the **physical remote button still works** independently
   (fallback path intact — see `pi/setup/HARDWARE.md`).
2. **Video, authorized:** load
   `{VIDEO_BASE_URL}/stream.html?src=<a_real_stream_key>` (VIDEO_BASE_URL
   is the Cloudflare Tunnel hostname set in `app/`'s
   `EXPO_PUBLIC_VIDEO_BASE_URL` — not this component's to set, but its
   value should match what you configured in cloudflared's ingress route)
   with a **short-lived video token from `POST /functions/v1/issue-video-token`**
   attached (either the app's own WebView flow, which refreshes it ~45s, or
   manually via `?access_token=<video jwt>` for a bench test) — confirm
   playback works. Note this is NOT the same as the user's normal Supabase
   session JWT — see `pi/Caddyfile`'s header comment.
3. **Video, denied — no/bad token:** load the same URL with **no token** or
   an **expired/garbage token** — confirm you get `401`/`403` and Caddy's
   access log (`/var/log/caddy/vecinoseguro-access.log`) shows the denial
   (with the `access_token` value redacted, not in plaintext — see
   `pi/Caddyfile`'s `log` block), and that go2rtc is never touched (no
   corresponding entry appears in `journalctl -u go2rtc` for that request).
3b. **Video, denied — wrong-purpose token:** load the same URL with a
   valid, unexpired, correctly-signed **normal user session JWT** (i.e. the
   token the app uses for regular API calls, NOT one from
   `issue-video-token`) — confirm this ALSO gets `403`, because it lacks
   `purpose: "video"`. This is the specific case the `@notVideo` matcher in
   `pi/Caddyfile` exists to catch; a `200` here would mean that check
   silently isn't working.
4. **Grid vs fullscreen quality:** confirm both `?src=<stream_key>` (main)
   and `?src=<stream_key>_sub` (sub, if your app/grid code is wired to
   request it) load distinguishably different resolutions.
