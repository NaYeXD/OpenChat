# 📡 OpenChat

Open-source, self-hosted voice & text chat. No third-party accounts, no monthly fees — run the server on any PC or homelab and connect from anywhere.

---

## Project Structure

```
OpenChat/
├── server/
│   ├── server.js          ← Main server (wss://, auth, signaling, chat)
│   ├── database.js        ← JSON message persistence
│   ├── certManager.js     ← TLS certificate generation (node-forge)
│   ├── securityLog.js     ← Security event logger
│   ├── package.json
│   ├── .env.example
│   ├── config/            ← Auto-created: cert.pem, key.pem
│   ├── openchat-messages.json  ← Auto-created on first message
│   └── security.log       ← Auto-created on first security event
│
└── client/
    ├── electron/
    │   ├── main.js        ← Electron main process + TLS cert handler
    │   └── preload.js     ← contextBridge: cert IPC, platform info
    ├── src/
    │   ├── App.jsx        ← Root component, WebSocket + wss:// logic
    │   ├── main.jsx       ← React entry point
    │   ├── hooks/
    │   │   └── useVoice.js
    │   ├── components/
    │   │   ├── ConnectScreen.jsx   ← Login, Remember server, wss badge
    │   │   ├── MainLayout.jsx
    │   │   ├── UserList.jsx
    │   │   ├── ChatPanel.jsx       ← Padlock indicator in header
    │   │   ├── VoiceControls.jsx
    │   │   ├── DeviceSelector.jsx
    │   │   └── UserContextMenu.jsx ← Right-click volume control
    │   └── styles/
    │       ├── index.css
    │       ├── voice.css
    │       └── security.css        ← Phase 3 UI additions
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or newer
- A microphone (for voice chat)

### Server

```bash
cd OpenChat/server
npm install
```

No native compilation — all dependencies are pure JavaScript or pre-built.

### Client

```bash
cd OpenChat/client
npm install
```

---

## How to Run

### Server

**1 — Configure**

```bash
cd OpenChat/server
copy .env.example .env
```

Edit `.env`:

```env
PORT=4000
SERVER_PASSWORD=your-secret-password
```

> ⚠️ Change the password before exposing to any network.

**2 — Start**

```bash
npm start
```

On first run, the server generates a self-signed TLS certificate and prints:

```
[TLS] No certificate found — generating self-signed RSA-2048 cert…
[TLS] ✓ Certificate saved to config/cert.pem
[TLS] ✓ Private key  saved to config/key.pem
[AUTH] Hashing SERVER_PASSWORD with bcrypt…
[AUTH] Done. To skip re-hashing on every restart, put this in .env:
[AUTH]   SERVER_PASSWORD=$2b$12$...
OpenChat Server listening on wss://0.0.0.0:4000
```

Copy the printed `SERVER_PASSWORD=$2b$12$...` hash into your `.env` to avoid re-hashing on every restart.

**Running permanently (Windows — PM2)**

```bash
npm install -g pm2
pm2 start server.js --name openchat
pm2 save && pm2 startup
```

**Running permanently (Linux — systemd)**

```ini
[Unit]
Description=OpenChat Server
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/OpenChat/server
ExecStart=/usr/bin/node server.js
Restart=on-failure
EnvironmentFile=/home/youruser/OpenChat/server/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now openchat
```

---

### Client

**Terminal 1 — Vite:**
```bash
cd OpenChat/client
npx vite
```

**Terminal 2 — Electron (after Vite says "ready"):**
```bash
cd OpenChat/client
npx electron .
```

**Connecting**

On the Connect screen:

| Field | Value |
|---|---|
| Server Address | `127.0.0.1` (same machine) or the server's LAN/public IP |
| Port | `4000` |
| Password | Your `SERVER_PASSWORD` |

A dialog will appear asking you to confirm the self-signed certificate — click **Connect Anyway**. This only appears once per session. Tick **Remember this server** to pre-fill the address next time.

Once connected, a 🔒 **Encrypted** badge appears in the chat header confirming you are on `wss://`.

---

## Exposing Your Server to the Internet Safely

### Step 1 — Port forwarding

On your router, forward TCP port `4000` (or your chosen port) to the **local IP** of your server machine. Your router admin panel will have a "Port Forwarding" or "Virtual Server" section.

Find your server's local IP:
- **Windows:** `ipconfig` → look for IPv4 Address
- **Linux:** `ip addr` → look for `inet` on your LAN adapter

### Step 2 — Firewall

Allow the port through your OS firewall:

**Windows:**
```powershell
netsh advfirewall firewall add rule name="OpenChat" dir=in action=allow protocol=TCP localport=4000
```

**Linux (ufw):**
```bash
sudo ufw allow 4000/tcp
```

### Step 3 — Find your public IP

Go to [whatismyip.com](https://whatismyip.com) to find your public-facing IP address. Give this to your users. For a stable address, use a free DDNS service like [DuckDNS](https://www.duckdns.org/) so your domain stays the same even if your ISP changes your IP.

### Step 4 — Certificate options

| Option | How | Trust |
|---|---|---|
| **Self-signed** (default) | Auto-generated on first run, saved to `config/` | Client sees a one-time warning dialog |
| **Let's Encrypt** (recommended for public servers) | Use [Certbot](https://certbot.eff.org/) on a domain you own | No warning — fully trusted by all clients |

To use your own cert, set in `.env`:
```env
CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
```

**Self-signed vs CA-signed:**
- A self-signed cert encrypts your connection just as well — the only difference is that no authority has verified you own the domain. It is perfectly safe for a server you control; users just need to click through the one-time warning.
- A CA-signed cert (Let's Encrypt) removes the warning and is better for a public server with many users.

### Security limits (Phase 3 defaults)

| Setting | Default | `.env` key |
|---|---|---|
| Max concurrent connections | 20 | `MAX_CONNECTIONS` |
| Max message size | 64 KB | `MAX_PAYLOAD_BYTES` |
| Rate limit | 5 new connections / IP / minute, 5-minute ban | hardcoded |

Security events (failed auth, rate limit hits, oversized messages) are written to `server/security.log`.

---

## What Was Implemented

### Phase 1 — Foundation

- WebSocket server (`ws` library), password auth, message persistence (JSON file), Electron + React client, real-time text chat, user join/leave events, chat history on connect.

### Phase 2 — Voice Chat

- WebRTC peer-to-peer voice via signaling relay on the server. Session IDs per connection. Voice channel join/leave/mute controls. Per-user volume via Web Audio `GainNode` (0–200%). Right-click context menu on users to adjust volume. Audio device selection (mic input, speaker output). Mic icon on voice users.

### Phase 3 — Security Hardening

**Server:**
- Upgraded from `ws://` to `wss://` — all traffic is TLS-encrypted
- Self-signed RSA-2048 certificate auto-generated via `node-forge` on first run, saved to `config/cert.pem` + `config/key.pem`. Valid for 10 years.
- Bring-your-own cert supported via `CERT_PATH` / `KEY_PATH` in `.env`
- Passwords hashed with `bcryptjs` (salt rounds 12) — plain text never used for comparison after startup. Pre-hashing supported for fast restarts.
- Rate limiting: max 5 connection attempts per IP per 60 seconds, 5-minute ban on breach (in-memory Map, no library)
- Max concurrent connection cap (default 20, configurable)
- Incoming message size validation at transport layer (`maxPayload`) and in the handler
- Security event logging to `security.log` — failed auth, rate limits, malformed messages, oversized payloads

**Client:**
- WebSocket connection uses `wss://` throughout
- Electron self-signed cert handling via `session.setCertificateVerifyProc` + `app.on('certificate-error')` — covers both page loads and WebSocket upgrades
- One-time confirmation dialog before connecting to a server using a self-signed cert
- 🔒 **Encrypted** badge in the chat panel header when connected over `wss://`
- **Remember this server** checkbox — saves IP and port to `localStorage` for quick reconnect. Includes a "forget" link to clear saved data.

---

## Roadmap

| Phase | Status | Feature |
|---|---|---|
| 1 | ✅ Done | Text chat, message persistence, Electron client |
| 2 | ✅ Done | Voice chat (WebRTC), per-user volume, device selection |
| 3 | ✅ Done | TLS encryption, bcrypt passwords, rate limiting, padlock UI |
| 4 | Planned | User accounts, registration, login, JWT auth, admin/kick/ban |
| 5 | Planned | One-click installers, Windows Service, auto-updater |
| 6 | Planned | STUN/TURN for internet voice, UI polish, public release |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ERR_CONNECTION_REFUSED` | Server is not running. Start it with `npm start` in `server/`. |
| `ERR_CERT_AUTHORITY_INVALID` in Electron | Expected for self-signed certs. Click "Connect Anyway" in the dialog. If no dialog appears, restart Electron. |
| Black screen on launch | Vite isn't running. Start `npx vite` in Terminal 1 before Electron. |
| `&&` not working in PowerShell | Use two separate terminals instead. |
| Password rejected after `.env` change | Make sure you saved the file and restarted the server. |
| Microphone denied | Allow mic in Windows Settings → Privacy & Security → Microphone. |
| Voice connects but no audio | Both clients must be on the same LAN. STUN/TURN is not configured until Phase 6. |
| Cert regenerated unexpectedly | `config/cert.pem` or `config/key.pem` was deleted. The server auto-generates a new one — clients will need to accept it again. |

---

## License

MIT — do whatever you want with it.