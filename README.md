# 📡 OpenChat

Open-source, self-hosted voice & text chat. No accounts required with third-party services, no monthly fees — just run the server on any PC or homelab and connect.

---

## Project Structure

```
OpenChat/
├── server/                        ← Node.js WebSocket server
│   ├── server.js                  ← Main server entry point
│   ├── database.js                ← JSON message persistence
│   ├── package.json
│   ├── .env.example               ← Copy to .env and configure
│   └── openchat-messages.json     ← Auto-created on first message
│
└── client/                        ← Electron + React desktop app
    ├── electron/
    │   ├── main.js                ← Electron main process
    │   └── preload.js             ← Context bridge
    ├── src/
    │   ├── App.jsx                ← Root component, WebSocket logic
    │   ├── main.jsx               ← React entry point
    │   ├── hooks/
    │   │   └── useVoice.js        ← WebRTC peer connection logic
    │   ├── components/
    │   │   ├── ConnectScreen.jsx  ← Login / connect screen
    │   │   ├── MainLayout.jsx     ← Two-panel layout wrapper
    │   │   ├── UserList.jsx       ← Left sidebar: users + voice controls
    │   │   ├── ChatPanel.jsx      ← Right panel: chat history + input
    │   │   └── VoiceControls.jsx  ← Join / Leave / Mute buttons
    │   └── styles/
    │       ├── index.css          ← Main stylesheet
    │       └── voice.css          ← Voice channel styles
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or newer (v20+ recommended)
- A microphone (for voice chat)

### Server

```bash
cd OpenChat/server
npm install
```

No native compilation required — all dependencies are pure JavaScript.

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

Open `.env` and set your values:

```env
PORT=4000
SERVER_PASSWORD=your-secret-password
```

> ⚠️ Always change the password before running on any network.

**2 — Start**

```bash
npm start
```

Expected output:

```
[DB] No existing message file found — starting fresh.
[2026-...] OpenChat Server listening on ws://0.0.0.0:4000
[2026-...] Phase 2: WebRTC signaling relay enabled
[2026-...] Password: ✓ custom set
[2026-...] Waiting for connections...
```

The server runs as a background console process. Leave this terminal open while clients are connected. To stop it press `Ctrl+C`.

**Running permanently on a homelab (Windows)**

Use PM2 to keep the server alive across reboots:

```bash
npm install -g pm2
pm2 start server.js --name openchat
pm2 save
pm2 startup
```

**Running permanently on Linux / WSL**

Create `/etc/systemd/system/openchat.service`:

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

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now openchat
```

---

### Client

The client requires two terminals running at the same time during development.

**Terminal 1 — Start Vite (must run first):**

```bash
cd OpenChat/client
npx vite
```

Wait until you see `VITE ready` and `Local: http://localhost:5173`.

**Terminal 2 — Start Electron:**

```bash
cd OpenChat/client
npx electron .
```

The OpenChat desktop window will open automatically.

> Note: `npm run dev` runs both together but can be unreliable on Windows. The two-terminal method above is more stable.

**Connecting**

Fill in the Connect screen:

| Field | Value |
|---|---|
| Server Address | `127.0.0.1` if server is on the same machine, otherwise the server's LAN IP (e.g. `192.168.1.100`) |
| Port | `4000` (or whatever you set in `.env`) |
| Password | The `SERVER_PASSWORD` from `.env` |

**Finding the server's LAN IP (so other devices can connect)**

```
Windows:  ipconfig
Linux:    ip addr
```

Look for the IPv4 address on your local network adapter (usually starts with `192.168.x.x`).

---

## What Was Implemented

### Phase 1 — Foundation (Text Chat + Server)

**Server:**
- WebSocket server using the `ws` library
- Password authentication — wrong password closes the connection immediately
- Each authenticated client tracked by IP address
- Broadcasts `user_joined` / `user_left` events to all connected clients
- Receives text chat messages, saves them to a JSON file, and broadcasts to all clients
- Sends the last 50 messages as history to each new client on connect
- Graceful shutdown on `Ctrl+C`

**Client:**
- Electron + React + Vite desktop application
- Connect screen with server address, port, and password fields
- 8-second connection timeout with clear error messages
- Two-panel layout: user list on the left, chat on the right
- Users displayed by IP address with a "you" badge on your own entry
- Real-time chat: messages appear instantly across all connected clients
- System messages when users join or leave
- Date dividers in chat history
- Auto-scroll to latest message
- Disconnect button returns to the connect screen

**Storage:**
- Messages saved to `server/openchat-messages.json`
- File is created automatically on the first message
- Survives server restarts — history loads on reconnect
- Capped at 500 stored messages

---

### Phase 2 — Voice Chat (WebRTC)

**Server:**
- Each client now receives a unique **session ID** (`ip-timestamp`) on connect
- Session ID included in all user list, join, and leave broadcasts
- Tracks which sessions are currently in the voice channel
- Handles `voice_join` and `voice_leave` messages, updates voice state for all clients
- **WebRTC signaling relay** — routes `offer`, `answer`, and `ice-candidate` messages between peers by session ID
- The server never reads or processes audio or SDP content — it only routes
- Voice state included in the user list so new joiners see who is already in voice

**Client:**
- **Join Voice** button in the left sidebar — requests microphone access via `getUserMedia`
- Audio constraints: echo cancellation, noise suppression, and auto gain control enabled by default
- **Mute / Unmute** toggle — disables local audio tracks without closing the WebRTC connection
- **Leave Voice** button — stops the microphone and closes all peer connections cleanly
- 🎙 mic icon appears next to each user currently in the voice channel
- 🔇 icon shown when you are muted (visible to yourself only locally)
- 🔴 LIVE badge appears in the voice panel while you are in a call
- Displays how many users are currently in the call
- New `useVoice` hook encapsulates all WebRTC logic cleanly, separate from chat logic
- ICE candidate queuing — candidates that arrive before the remote description is set are buffered and applied once it is ready
- Peer connections closed automatically when a user disconnects entirely

**WebRTC flow (LAN, no STUN/TURN needed):**

```
User A joins voice          Server              User B (already in voice)
──────────────              ──────              ─────────────────────────
getUserMedia()
voice_join ──────────────▶
                           voice_joined_ack ──▶ A  ← list of current voice users
                           user_voice_joined ──▶ B  ← notified someone joined

A creates offer for B
offer ────────────────────▶
                           relay ─────────────▶ B
                                                B creates answer
                           ◀── answer
A sets remote description

◀──────── ICE candidates flow both ways via server relay ──────▶

🎙  Audio flows directly A ↔ B  (server not involved in audio at all)
```

---

## Roadmap

| Phase | Status | Feature |
|---|---|---|
| 1 | ✅ Done | WebSocket server, text chat, message persistence, Electron client |
| 2 | ✅ Done | Voice chat via WebRTC, signaling relay, mute/leave controls |
| 3 | Planned | TLS encryption (`wss://`), password hashing, rate limiting |
| 4 | Planned | User accounts, registration, login, JWT auth, admin/kick/ban |
| 5 | Planned | One-click installers, Windows Service, auto-updater |
| 6 | Planned | STUN/TURN for internet use, UI polish, public open-source release |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm install` fails on server with `node-gyp` errors | This was fixed in Phase 1 — the server uses a pure JS JSON store, no native modules. Make sure you're not accidentally restoring `better-sqlite3` to `package.json`. |
| `ERR_CONNECTION_REFUSED` in the client | The server is not running. Start it with `npm start` in `server/` first. |
| Black screen in Electron | The Vite dev server isn't running. Start `npx vite` in Terminal 1 before launching Electron. |
| `&&` not working in PowerShell | Use two separate terminals instead of chaining commands with `&&`. |
| Microphone access denied | Allow microphone access in Windows Settings → Privacy & Security → Microphone. |
| Voice connects but no audio | Make sure both clients are on the same LAN. STUN/TURN is not configured until Phase 6 — internet connections between different networks will not work yet. |
| Incorrect password error | Double-check `SERVER_PASSWORD` in `server/.env` matches exactly what you typed in the client. |

---

## License

MIT — do whatever you want with it.