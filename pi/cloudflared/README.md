# Cloudflare Tunnel (`cloudflared`) — VecinoSeguro gate Pi

## Outbound-only, always

`cloudflared` makes **only outbound** connections from the Pi out to the
Cloudflare edge (over HTTPS/QUIC) and registers itself as a reachable
tunnel there. **No inbound port is ever opened** on the Pi's router or
firewall for video traffic — this is the entire point of using a tunnel
instead of port-forwarding. The public hostname resolves at Cloudflare's
edge, which forwards matched requests down the existing outbound
connection to `cloudflared` on the Pi, which then talks to Caddy over
`localhost` only. Nothing on the camera LAN (`eth1`) is ever involved in
this path.

## Two ways to run it — pick one

### 1. Token-only invocation (DEFAULT in this repo)

```
cloudflared tunnel run --token ${CLOUDFLARE_TUNNEL_TOKEN}
```

This is what `pi/systemd/cloudflared.service` runs by default. The token
(`CLOUDFLARE_TUNNEL_TOKEN`, contractual env var — see `pi/.env.example`)
is created once in the Cloudflare Zero Trust dashboard when you create a
tunnel there, and it encodes the tunnel ID + credentials + (if configured
in the dashboard) the public-hostname routing rule. There is no
`config.yml` to maintain on the Pi at all.

**Tradeoffs:**
- Simplest to deploy and rotate (rotate = issue a new token in the
  dashboard, update `.env`, restart the service — no file to re-copy).
- Routing (which public hostname → which local service) is configured in
  the Cloudflare dashboard, not versioned in this repo — a manual,
  undocumented-in-git step. This is why `pi/cloudflared/config.yml.example`
  exists: to show what the equivalent, reviewable ingress rule looks like,
  even if you don't run it that way.
- Good default for a single-tunnel, single-hostname deployment like this
  one (one Pi, one video hostname).

### 2. Config-file (`config.yml`) invocation

```
cloudflared tunnel run --config /opt/vecinoseguro/pi/cloudflared/config.yml <TUNNEL_NAME>
```

Uses `pi/cloudflared/config.yml.example` (copy to `config.yml`, fill
placeholders, keep it out of git — it will contain a real tunnel UUID).

**Tradeoffs:**
- Ingress rules are explicit and reviewable as a file (useful if you ever
  add more than one hostname/service behind the same tunnel).
- Requires the one-time `cloudflared tunnel create <name>` step to
  generate the tunnel UUID + credentials JSON, and keeping that
  credentials file's permissions tight (root-readable only) on the Pi.
- Slightly more moving parts for a single-hostname deployment; the
  token-only method above covers this deployment's actual needs with less
  to maintain.

**This repo defaults to the token-only method** (option 1) since this
deployment is a single Pi with a single public video hostname — the
config-file approach is documented as an option, not required, for future
scenarios (e.g. adding a second public service on the same tunnel).

## What you still need to do yourself (human, one-time, in Cloudflare's console)

These are Cloudflare account actions, not repo files — flagged here as
follow-up requirements rather than silently assumed:
1. Create (or have access to) a Cloudflare account + a registered domain.
2. Create a tunnel (Zero Trust dashboard → Networks → Tunnels, or
   `cloudflared tunnel create <name>` from an authenticated CLI session).
3. Copy the tunnel token into the Pi's real `.env` as
   `CLOUDFLARE_TUNNEL_TOKEN` (never commit it — see `pi/.env.example`).
4. Add a public hostname route for the tunnel pointing at
   `http://localhost:8080` (Caddy's loopback port — see `pi/Caddyfile`).
5. Set that same public hostname as `EXPO_PUBLIC_VIDEO_BASE_URL` in the
   app's env (owned by `app/`, not this component — see CONTRACT.md).

No real tunnel IDs, hostnames, or tokens are included anywhere in this
repo — placeholders only, per org policy.
