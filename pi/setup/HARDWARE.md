# Hardware — VecinoSeguro gate Pi

Bill of materials, network topology, and relay wiring for the Raspberry Pi
bridge at the gate. No real IP ranges, hostnames, or camera credentials
appear anywhere in this file — placeholders only, per org policy.

## Bill of materials

| # | Item | Notes |
|---|---|---|
| 1 | Raspberry Pi 4 Model B (4GB+) **or** Raspberry Pi 5 (4GB+) | Either is fine for 2-3 cameras + relay + tunnel. Pi 5 gives more CPU headroom for the ffmpeg sub-stream re-encode (see `pi/go2rtc.yaml`); prefer it if buying new and running more than ~2 cameras. |
| 2 | Official Raspberry Pi USB-C power supply (5V/3A for Pi 4, 5V/5A for Pi 5) | Under-powering causes intermittent USB-NIC/camera-LAN dropouts — don't substitute a phone charger. |
| 3 | 32GB+ A2-rated microSD card, or (preferred) USB3 SSD boot | SSD boot is materially more reliable for 24/7 operation than SD; use if the board/OS supports it. |
| 4 | USB3-to-Gigabit-Ethernet adapter (2nd NIC) | Dedicated to the isolated camera LAN (`eth1`) — see network topology below. Pick a chipset with mainline Linux driver support (e.g. common ASIX/Realtek USB3 NIC chipsets) to avoid DKMS headaches on Raspberry Pi OS. |
| 5 | 1-channel **opto-isolated** relay module (5V logic, dry NO/NC/COM contacts) | Drives the gate remote's button contacts. Opto-isolation is mandatory — see wiring section below for why. |
| 6 | Hookup wire, small gauge (22-24 AWG), plus a couple of spare screw-terminal connectors | For tapping the relay across the existing button leads without cutting them. |
| 7 | Inline fuse or resettable fuse (PTC), rated for the button circuit's actual voltage/current | Current-limits the relay's dry-contact side; see safety notes below. |
| 8 | 2-3x Hikvision DS-2CD1047G2H IP cameras | RTSP-capable; see `pi/setup/SECURITY.md` for mandatory first-boot hardening (default credentials, UPnP/P2P/cloud features). |
| 9 | PoE injectors/switch **or** camera-rated DC power supplies, one per camera (unless a PoE switch feeds them directly) | If using a PoE switch on the camera LAN, the USB NIC (`eth1`) just needs to reach that switch; the switch handles camera power. Either way, camera power is independent of Pi power. |
| 10 | Outdoor-rated, weatherproof enclosure (IP65+) for the Pi + relay, if mounted at/near the gate | Include cable glands for the two Ethernet runs + relay wiring; ventilation or a small fan if the enclosure is fully sealed and in direct sun. |
| 11 | (Optional) Small UPS HAT / battery backup for the Pi | Keeps gate-agent + video alive through brief outages; not required for pilot but recommended before wider rollout. |

## Network topology — two NICs, two purposes

```
                     ┌───────────────────────────────────────────┐
                     │              Raspberry Pi                  │
                     │                                             │
   Home / uplink LAN │  eth0 (onboard)         eth1 (USB adapter)  │  Camera LAN
  <UPLINK_SUBNET>    │  DHCP from home router   static, isolated   │  <CAMERA_LAN_SUBNET>
  ───────────────────┤──────────►                       ◄─────────┤───────────────────
   (internet access  │  OUTBOUND ONLY:                  Pi + cameras only.       │
    via home router) │  - cloudflared -> Cloudflare edge  No route to eth0/      │
                     │  - gate-agent  -> Supabase          internet from here,   │
                     │  (Realtime + REST)                  and no route IN from  │
                     │                                      eth0 except via the  │
                     │                                      Pi's own software    │
                     │                                      (go2rtc pulling      │
                     │                                      RTSP as a client).   │
                     └───────────────────────────────────────────┘
                                                                  │
                                                        ┌─────────┴─────────┐
                                                        │   Hikvision cams   │
                                                        │  (RTSP, isolated)  │
                                                        └────────────────────┘
```

- **`eth0` (onboard NIC) — uplink.** DHCP from the home/site router.
  Used **only** for outbound connections: `cloudflared` to the Cloudflare
  edge, `gate-agent` to Supabase (Realtime + REST). Nothing ever needs to
  reach the Pi *inbound* on this interface — no port is forwarded on the
  router for this device, ever (see `pi/setup/SECURITY.md`).
- **`eth1` (USB gigabit adapter) — isolated camera LAN.** Static IP in a
  placeholder subnet, written here as `<CAMERA_LAN_SUBNET>` (pick any
  private range that isn't already used elsewhere on site; do not reuse
  the home LAN's range). Only the cameras and the Pi sit on this segment
  — no switch uplink to the home router, no route back to `eth0`/the
  internet. The **only** thing allowed to bridge camera-LAN data out to
  anything else is the Pi's own software (`go2rtc`, acting purely as an
  outbound RTSP *client* pulling frames — see `pi/go2rtc.yaml`), never a
  network-level route between the two interfaces.
- The Pi's own firewall posture should be **deny-inbound-by-default** on
  both interfaces (see `pi/setup/SECURITY.md` for the prose description —
  intentionally no raw firewall config is included in this repo per org
  policy). If you want a minimal illustrative example of the *concept*
  (not a file to actually apply), it looks like:
  ```
  # ILLUSTRATIVE ONLY — not a real ruleset, placeholder interface names:
  # default policy: DROP on INPUT for both <UPLINK_IFACE> and <CAMERA_LAN_IFACE>
  # allow: established/related traffic back in
  # allow: loopback
  # (no ACCEPT rules for unsolicited inbound on either interface)
  ```

## Gate relay wiring — parallel tap across the existing remote button

**Goal:** the Pi can trigger a gate-open pulse in software, while the
physical remote/button **remains fully powered and usable** as a manual
fallback at all times. This is achieved by wiring the relay's dry contact
in **parallel** with the existing button contacts — never in series, and
never by cutting/splicing the button's existing wires.

### GPIO pinout

| Signal | Raspberry Pi pin | Notes |
|---|---|---|
| Relay control signal | **BCM GPIO 17** (physical pin 11 on the 40-pin header) | Matches `GATE_GPIO_PIN` default (`pi/.env.example`). If you must use a different BCM pin (board layout conflict, etc.), change `GATE_GPIO_PIN` in `.env` to match — do not hardcode a different pin in gate-agent without updating this env var. |
| Relay module 5V | Pin 2 or 4 (5V) | Confirm your specific relay module's logic-side voltage requirement (most opto-isolated 1-channel modules are 5V logic) before wiring — check its datasheet. |
| Relay module GND | Pin 6 (or any GND pin) | Shared ground reference between Pi and relay module's logic side only — **not** the same as the gate-side circuit, which is why opto-isolation matters (see below). |

### Why opto-isolation

The relay module's **logic side** (GPIO signal + 5V + GND, connected to
the Pi) is optically — not electrically — coupled to its **switching
side** (the dry NO/COM contacts that tap into the gate remote's button
circuit). This galvanic isolation means any voltage spike, surge, or
miswiring on the gate-remote side of the circuit **cannot** propagate
back into the Pi's GPIO or 5V rail. Given the gate-side circuit is
physically at an exterior gate (lightning-adjacent, subject to
switching transients from other gate hardware), this isolation is not
optional — always use an opto-isolated relay module for this, not a
bare mechanical relay driven directly off GPIO.

### Wiring the parallel tap

1. **Power down** the gate remote/control box before opening it or
   touching any wiring (see safety notes below).
2. Identify the existing physical push-button's two leads inside the
   gate control box (the button that currently triggers the gate to
   open).
3. **Do not cut or splice these wires.** Instead, tap a spare wire onto
   each of the button's two existing terminal points (most button/remote
   terminals accept a second wire under the same screw terminal, or you
   can use a small splice connector/terminal block placed non-destructively
   in-line) — one wire to each side of the button contact.
4. Run those two tap wires to the relay module's **NO (Normally-Open)**
   and **COM (Common)** dry-contact terminals. When the relay energizes
   (GPIO pulses HIGH for `GATE_PULSE_MS`, default 500ms), NO and COM
   short together — electrically identical to a human pressing the
   physical button for that same ~500ms.
5. Confirm the relay is rated for the button circuit's actual voltage and
   current (check the gate control box's documentation or measure with a
   multimeter with the circuit de-energized first) — do not assume it's
   low-voltage without checking; some gate openers use mains-adjacent
   control voltages internally.
6. Add the inline fuse (BOM item #7) in series on the tap, sized to the
   button circuit's expected current, so a wiring fault on the relay side
   can't damage the gate control box's button circuit.
7. Re-apply power. Test with the **existing physical button first** —
   confirm the gate still opens normally with the remote alone (fallback
   path intact) — then test the relay pulse via gate-agent (see the
   smoke-test checklist in `pi/setup/SETUP.md`).

### Safety notes

- **Never cut or splice the remote's existing wiring** — parallel tap
  only. The remote must work exactly as before if the Pi/relay is ever
  removed or loses power.
- **Always disconnect power** to the gate control box before opening it
  or making/adjusting any wiring connection.
- **Match the relay's contact rating** to the actual button-circuit
  voltage/current — check before wiring, don't assume low-voltage.
- **Fuse/current-limit** the tap (BOM item #7) so a relay-side fault
  can't take out the gate's existing control electronics.
- **Weatherproof** the enclosure housing the Pi + relay if it lives at or
  near the gate outdoors (BOM item #10) — condensation and dust are the
  two most common field-failure causes for this kind of install.
- **Label the wiring** at both ends (relay terminal + button terminal) so
  a future maintainer who's never seen this install can identify the tap
  without guessing, and can safely remove it without affecting the
  original remote wiring.
