# 📡 OpenChat

Open-source, self-hosted voice & text chat. No third-party accounts, no monthly fees — run the server on any PC or homelab and connect from anywhere.

---

## Project Structure

```
OpenChat/
├── server/
│   ├── server.js               ← Main server (wss://, auth, signaling, chat)
│   ├── database.js             ← SQLite persistence (messages + user accounts)
│   ├── auth.js                 ← JWT issuance & verification
│   ├── certManager.js          ← TLS certificate generation (node-forge)
│   ├── securityLog.js          ← Security event logger
│   ├── package.json
│   ├── .env.example
│   ├── scripts/
│   │   ├── install-service.js  ← Registers OpenChat as a Windows Service
│   │   └── uninstall-service.js
│   ├── installer/
│   │   ├── windows/            ← Inno Setup script → OpenChatServer-Setup.exe
│   ├── release/                ← Built installers land here
│   ├── config/                 ← Auto-created: cert.pem, key.pem
│   └── openchat.db             ← Auto-created SQLite database
│
└── client/
    ├── electron/
    │   ├── main.js             ← Electron main process + TLS cert handler
    │   └── preload.js          ← contextBridge: cert IPC, platform info
    ├── src/
    │   ├── App.jsx             ← Root component, WebSocket + wss:// logic
    │   ├── main.jsx            ← React entry point
    │   ├── hooks/
    │   │   └── useVoice.js
    │   ├── components/
    │   │   ├── ConnectScreen.jsx    ← Login, register, remember server
    │   │   ├── MainLayout.jsx
    │   │   ├── UserList.jsx
    │   │   ├── ChatPanel.jsx        ← Padlock indicator in header
    │   │   ├── VoiceControls.jsx
    │   │   ├── DeviceSelector.jsx
    │   │   ├── AdminPanel.jsx       ← Kick, ban, audit log (admin only)
    │   │   └── UserContextMenu.jsx  ← Right-click volume control
    │   └── styles/
    │       ├── index.css
    │       ├── voice.css
    │       └── security.css
    ├── assets/
    │   ├── icon.ico            ← Windows installer icon
    │   └── icon.png            ← Linux installer icon
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) **v22.5 or newer** (required for built-in SQLite)
- A microphone (for voice chat)

### Option A — Installers (recommended)

Download the latest release from the [Releases](../../releases) page:

| Package | Platform |
|---|---|
| `OpenChatServer-Setup-x.x.x.exe` | Windows server |
| `OpenChat-Setup-x.x.x.exe` | Windows client |

The server installer handles dependencies, `.env` creation, and service registration automatically.

### Option B — Run from source

**Server:**
```bash
cd OpenChat/server
npm install
cp .env.example .env   # then edit .env
npm start
```

**Client:**
```bash
cd OpenChat/client
npm install
npm run dev
```

---

## Configuration

Edit `server/.env` before starting:

```env
PORT=4000

# Generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=your-long-random-secret
JWT_EXPIRY=7d

# Optional: promote a specific username to admin on registration
ADMIN_USERNAME=

# Optional: use your own TLS cert (e.g. Let's Encrypt)
CERT_PATH=
KEY_PATH=

MAX_CONNECTIONS=20
MAX_PAYLOAD_BYTES=65536
```

> ⚠️ Generate a real `JWT_SECRET` before exposing to any network. Never reuse the example value.

---

## How to Run (from source)

### Server

```bash
cd OpenChat/server
npm start
```

On first run, the server generates a self-signed TLS certificate and prints:

```
[TLS] No certificate found — generating self-signed RSA-2048 cert…
[TLS] ✓ Certificate saved to config/cert.pem
OpenChat Server listening on wss://0.0.0.0:4000
```

### Client

```bash
cd OpenChat/client
npm run dev
```

**Connecting**

On the Connect screen:

| Field | Value |
|---|---|
| Server Address | `127.0.0.1` (same machine) or the server's LAN/public IP |
| Port | `4000` |

Register an account on first use. The first registered user is automatically promoted to admin.

A dialog will appear asking you to confirm the self-signed certificate — click **Connect Anyway**. Tick **Remember this server** to pre-fill the address next time.

Once connected, a 🔒 **Encrypted** badge appears in the chat header confirming you are on `wss://`.

---

## User Accounts & Admin

OpenChat uses JWT-based accounts stored in a local SQLite database — no third-party auth.

- The **first registered user** becomes admin automatically. You can also set `ADMIN_USERNAME` in `.env` to force a specific username to admin on registration.
- Admins see an **Admin Panel** in the client with the ability to kick, ban, and unban users, and view the audit log.
- Banned users are blocked at the WebSocket handshake.

---

## Exposing Your Server to the Internet

### Step 1 — Port forwarding

Forward TCP port `4000` (or your chosen port) to your server's local IP in your router's admin panel.

Find your local IP:
- **Windows:** `ipconfig` → IPv4 Address

### Step 2 — Firewall

**Windows:**
```powershell
netsh advfirewall firewall add rule name="OpenChat" dir=in action=allow protocol=TCP localport=4000
```

### Step 3 — Find your public IP

Go to [whatismyip.com](https://whatismyip.com). For a stable address, use a free DDNS service like [DuckDNS](https://www.duckdns.org/).

### Step 4 — Certificate options

| Option | How | Trust |
|---|---|---|
| **Self-signed** (default) | Auto-generated on first run | One-time warning dialog in client |
| **Let's Encrypt** (recommended for public servers) | [Certbot](https://certbot.eff.org/) on a domain you own | No warning — fully trusted |

To use your own cert, set in `.env`:
```env
CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
```

### Security limits (defaults)

| Setting | Default | `.env` key |
|---|---|---|
| Max concurrent connections | 20 | `MAX_CONNECTIONS` |
| Max message size | 64 KB | `MAX_PAYLOAD_BYTES` |
| Rate limit | 5 connections / IP / minute, 5-min ban | hardcoded |

Security events are written to `server/security.log`.

---

## What Was Implemented

### Phase 1 — Foundation
WebSocket server, password auth, message persistence, Electron + React client, real-time text chat, user join/leave events, chat history on connect.

### Phase 2 — Voice Chat
WebRTC peer-to-peer voice via signaling relay. Per-user volume via Web Audio `GainNode` (0–200%). Right-click context menu on users. Audio device selection (mic input, speaker output).

### Phase 3 — Security Hardening
Upgraded to `wss://` (TLS). Self-signed RSA-2048 cert auto-generated via `node-forge`. Bring-your-own cert support. Passwords hashed with `bcryptjs`. Rate limiting and connection caps. Security event logging. Client cert confirmation dialog and 🔒 badge.

### Phase 4 — User Accounts & Admin
SQLite user database (`node:sqlite`). JWT-based registration and login. First-user admin promotion. Admin panel with kick, ban, unban, and audit log. WebSocket authentication via JWT.

### Phase 5 — Installers
Windows `.exe` installer (Inno Setup) — installs server files, runs `npm install`, registers as a Windows Service, starts automatically on boot.

---

## Roadmap

| Phase | Status | Feature |
|---|---|---|
| 1 | ✅ Done | Text chat, message persistence, Electron client |
| 2 | ✅ Done | Voice chat (WebRTC), per-user volume, device selection |
| 3 | ✅ Done | TLS encryption, bcrypt auth, rate limiting |
| 4 | ✅ Done | User accounts, JWT auth, admin panel |
| 5 | ✅ Done | One-click installers, Windows Service, systemd |
| 6 | Planned | STUN/TURN for internet voice, UI polish |
| 7 | Planned | Linux and MacOS release |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ERR_CONNECTION_REFUSED` | Server is not running. Start it with `npm start` or check the service status. |
| `ERR_CERT_AUTHORITY_INVALID` in Electron | Expected for self-signed certs. Click "Connect Anyway" in the dialog. |
| Black screen on launch | Run `npm run dev` — Vite must be running before Electron in dev mode. |
| `&&` not working in PowerShell | Use two separate terminals instead. |
| Registration fails | Check that `JWT_SECRET` is set in `.env` and the server restarted after changes. |
| Voice connects but no audio | STUN/TURN is not yet configured (Phase 6). Voice currently requires both clients on the same LAN. |
| Cert regenerated unexpectedly | `config/cert.pem` or `config/key.pem` was deleted. Clients will need to accept the new cert. |
| Windows Service not starting | Open Event Viewer → Windows Logs → Application for node-windows error details. |

---

## License

MIT — do whatever you want with it.