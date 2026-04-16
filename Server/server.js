/**
 * server.js — OpenChat WebSocket Server (Phase 3)
 *
 * New in Phase 3:
 *  - TLS: plain ws:// upgraded to wss:// via an HTTPS server
 *    Self-signed cert auto-generated on first run (node-forge, saved to config/)
 *    Bring-your-own cert via CERT_PATH / KEY_PATH in .env
 *  - Password hashing with bcryptjs
 *    If SERVER_PASSWORD is plain text, it is hashed at startup (in-memory only).
 *    Set SERVER_PASSWORD to the printed bcrypt hash in .env to avoid re-hashing.
 *  - Connection rate limiting (in-memory Map)
 *    Max 5 new connection attempts per IP per 60 s → 5-minute ban on breach
 *  - Max concurrent connection limit (MAX_CONNECTIONS, default 20)
 *  - Incoming message size validation (MAX_PAYLOAD_BYTES, default 65536)
 *  - Security event logging to security.log
 */

require('dotenv').config();

const https     = require('https');
const WebSocket = require('ws');
const bcrypt    = require('bcryptjs');

const { loadOrCreateCert }           = require('./certManager');
const { secLog }                     = require('./securityLog');
const { saveMessage, getRecentMessages } = require('./database');

// ── Config ────────────────────────────────────────────────────────────────────

const PORT            = parseInt(process.env.PORT            || '4000', 10);
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS || '20',   10);
const MAX_PAYLOAD     = parseInt(process.env.MAX_PAYLOAD_BYTES || '65536', 10);
const RATE_WINDOW_MS  = 60_000;   // 1-minute sliding window
const RATE_MAX_HITS   = 5;        // max new connections per window
const BAN_DURATION_MS = 5 * 60_000; // 5-minute ban

// ── Password handling ─────────────────────────────────────────────────────────

const RAW_PASSWORD = process.env.SERVER_PASSWORD || 'changeme';
const IS_BCRYPT_HASH = /^\$2[ab]\$\d+\$/.test(RAW_PASSWORD);

let passwordHash;  // bcrypt hash used for all comparisons

if (IS_BCRYPT_HASH) {
  passwordHash = RAW_PASSWORD;
  console.log('[AUTH] Password loaded as bcrypt hash ✓');
} else {
  if (RAW_PASSWORD === 'changeme') {
    console.warn('⚠  WARNING: Using the default password. Set SERVER_PASSWORD in .env!');
  }
  // Hash on startup (in-memory only — plain text never used for comparison)
  console.log('[AUTH] Hashing SERVER_PASSWORD with bcrypt (salt rounds=12)…');
  passwordHash = bcrypt.hashSync(RAW_PASSWORD, 12);
  console.log('[AUTH] Done. To skip re-hashing on every restart, put this in .env:');
  console.log(`[AUTH]   SERVER_PASSWORD=${passwordHash}`);
}

// ── TLS ───────────────────────────────────────────────────────────────────────

const { cert, key } = loadOrCreateCert();
const httpsServer   = https.createServer({ cert, key });

// ── State ─────────────────────────────────────────────────────────────────────

/**
 * clients: Map<WebSocket, { ip, sessionId }>
 * Only holds authenticated connections.
 */
const clients   = new Map();
const voiceUsers = new Set();

// ── Rate limiter ──────────────────────────────────────────────────────────────
//
// rateLimits: Map<ip, { attempts: number, resetAt: number, bannedUntil: number }>

const rateLimits = new Map();

/** Prune stale entries every 10 minutes so the map never grows unbounded. */
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimits) {
    if (entry.bannedUntil < now && entry.resetAt < now) {
      rateLimits.delete(ip);
    }
  }
}, 10 * 60_000);

/**
 * Returns { allowed: true } or { allowed: false, reason, banRemainingMs }.
 * Mutates the rateLimits map as a side-effect.
 */
function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimits.get(ip);

  if (!entry) {
    entry = { attempts: 0, resetAt: now + RATE_WINDOW_MS, bannedUntil: 0 };
  }

  // Still banned?
  if (entry.bannedUntil > now) {
    return { allowed: false, reason: 'banned', banRemainingMs: entry.bannedUntil - now };
  }

  // Window expired — reset counter
  if (now >= entry.resetAt) {
    entry.attempts = 0;
    entry.resetAt  = now + RATE_WINDOW_MS;
  }

  entry.attempts++;
  rateLimits.set(ip, entry);

  if (entry.attempts > RATE_MAX_HITS) {
    entry.bannedUntil = now + BAN_DURATION_MS;
    rateLimits.set(ip, entry);
    return {
      allowed: false,
      reason: 'rate_exceeded',
      banRemainingMs: BAN_DURATION_MS,
    };
  }

  return { allowed: true };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timestamp() { return new Date().toISOString(); }
function log(msg)    { console.log(`[${timestamp()}] ${msg}`); }

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function getUserList() {
  return Array.from(clients.values()).map(c => ({
    sessionId: c.sessionId,
    ip:        c.ip,
    inVoice:   voiceUsers.has(c.sessionId),
  }));
}

function getVoiceUserList() {
  return Array.from(clients.values())
    .filter(c => voiceUsers.has(c.sessionId))
    .map(c => ({ sessionId: c.sessionId, ip: c.ip }));
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(payload, exclude = null) {
  const data = JSON.stringify(payload);
  for (const [ws] of clients) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function findBySessionId(sessionId) {
  for (const [ws, info] of clients) {
    if (info.sessionId === sessionId) return ws;
  }
  return null;
}

// ── WebSocket server (attached manually – noServer: true) ─────────────────────

const wss = new WebSocket.Server({
  noServer: true,               // <-- FIX: Let manual upgrade handler do everything
  maxPayload: MAX_PAYLOAD,
});

// ── Pre-connection checks (upgrade hook) ─────────────────────────────────────
//
// We intercept the HTTP Upgrade before the WebSocket handshake is completed so
// we can reject banned / over-limit IPs before the WS connection is established.

httpsServer.on('upgrade', (req, socket, head) => {
  const ip = getClientIp(req);

  // Max connections guard
  if (clients.size >= MAX_CONNECTIONS) {
    secLog('MAX_CONN_REJECTED', ip, `limit=${MAX_CONNECTIONS}`);
    socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    socket.destroy();
    return;
  }

  // Rate limit guard
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    const secs = Math.ceil(rl.banRemainingMs / 1000);
    secLog('RATE_LIMIT', ip, `reason=${rl.reason} ban_remaining=${secs}s`);
    socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
    socket.destroy();
    return;
  }

  // Handshake passes — let ws handle it
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

// ── Connection handler ────────────────────────────────────────────────────────

wss.on('connection', (ws, req) => {
  const ip        = getClientIp(req);
  const sessionId = `${ip.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}`;
  let   authenticated = false;

  log(`Connection attempt from ${ip} (session: ${sessionId})`);

  // ── Message handler ───────────────────────────────────────────────────────

  ws.on('message', async (raw) => {

    // Size guard (belt-and-suspenders on top of maxPayload)
    if (raw.length > MAX_PAYLOAD) {
      secLog('OVERSIZED_MSG', ip, `size=${raw.length}`);
      send(ws, { type: 'error', message: 'Message too large' });
      ws.close(1009, 'Message too large');
      return;
    }

    // Parse guard
    let msg;
    try { msg = JSON.parse(raw); }
    catch {
      secLog('MALFORMED_JSON', ip);
      send(ws, { type: 'error', message: 'Malformed JSON' });
      return;
    }

    // Basic structure guard — type must be a non-empty string
    if (!msg || typeof msg.type !== 'string' || msg.type.trim() === '') {
      secLog('INVALID_MSG_TYPE', ip);
      send(ws, { type: 'error', message: 'Invalid message type' });
      return;
    }

    // ── Auth gate ───────────────────────────────────────────────────────────

    if (!authenticated) {
      if (msg.type !== 'auth') {
        send(ws, { type: 'error', message: 'Send auth first' });
        return;
      }

      // Password must be a non-empty string
      if (typeof msg.password !== 'string' || msg.password === '') {
        secLog('AUTH_FAIL', ip, 'reason=empty_password');
        send(ws, { type: 'auth_failed', message: 'Incorrect password' });
        ws.close(1008, 'Bad password');
        return;
      }

      // bcrypt comparison (async, non-blocking)
      const ok = await bcrypt.compare(msg.password, passwordHash);
      if (!ok) {
        secLog('AUTH_FAIL', ip, 'reason=wrong_password');
        send(ws, { type: 'auth_failed', message: 'Incorrect password' });
        ws.close(1008, 'Bad password');
        return;
      }

      authenticated = true;
      clients.set(ws, { ip, sessionId });
      log(`Auth OK — ${ip} (${sessionId}) joined (${clients.size} online)`);

      send(ws, { type: 'auth_success', yourIp: ip, yourSessionId: sessionId });
      send(ws, { type: 'history', messages: getRecentMessages() });
      send(ws, { type: 'user_list', users: getUserList() });

      broadcast({ type: 'user_joined', ip, sessionId, inVoice: false }, ws);
      return;
    }

    // ── Authenticated message handlers ─────────────────────────────────────

    switch (msg.type) {

      // ── Text chat ──────────────────────────────────────────────────────────
      case 'chat': {
        const content = String(msg.content ?? '').trim().slice(0, 2000);
        if (!content) return;
        const ts = Date.now();
        saveMessage(ip, content);
        const payload = { type: 'chat', sender_ip: ip, content, timestamp: ts };
        for (const [client] of clients) send(client, payload);
        log(`[CHAT] ${ip}: ${content}`);
        break;
      }

      // ── Voice: join ────────────────────────────────────────────────────────
      case 'voice_join': {
        if (voiceUsers.has(sessionId)) return;
        voiceUsers.add(sessionId);
        log(`[VOICE] ${ip} (${sessionId}) joined voice (${voiceUsers.size} in voice)`);

        send(ws, {
          type:       'voice_joined_ack',
          voiceUsers: getVoiceUserList().filter(u => u.sessionId !== sessionId),
        });

        broadcast({ type: 'user_voice_joined',  sessionId, ip }, ws);
        broadcast({ type: 'user_voice_state', sessionId, inVoice: true }, ws);
        break;
      }

      // ── Voice: leave ───────────────────────────────────────────────────────
      case 'voice_leave': {
        if (!voiceUsers.has(sessionId)) return;
        voiceUsers.delete(sessionId);
        log(`[VOICE] ${ip} (${sessionId}) left voice`);
        broadcast({ type: 'user_voice_left',  sessionId, ip });
        broadcast({ type: 'user_voice_state', sessionId, inVoice: false });
        break;
      }

      // ── WebRTC signaling relay ─────────────────────────────────────────────
      case 'offer': {
        const target = findBySessionId(msg.targetId);
        if (target) send(target, { type: 'offer', fromId: sessionId, sdp: msg.sdp });
        break;
      }

      case 'answer': {
        const target = findBySessionId(msg.targetId);
        if (target) send(target, { type: 'answer', fromId: sessionId, sdp: msg.sdp });
        break;
      }

      case 'ice-candidate': {
        const target = findBySessionId(msg.targetId);
        if (target) send(target, { type: 'ice-candidate', fromId: sessionId, candidate: msg.candidate });
        break;
      }

      default:
        break;
    }
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────

  ws.on('close', () => {
    if (!authenticated) return;
    clients.delete(ws);

    if (voiceUsers.has(sessionId)) {
      voiceUsers.delete(sessionId);
      broadcast({ type: 'user_voice_left', sessionId, ip });
    }

    log(`${ip} (${sessionId}) disconnected (${clients.size} online)`);
    broadcast({ type: 'user_left', ip, sessionId });
  });

  ws.on('error', (err) => {
    log(`Socket error from ${ip}: ${err.message}`);
    if (authenticated) {
      clients.delete(ws);
      voiceUsers.delete(sessionId);
      broadcast({ type: 'user_left',       ip, sessionId });
      broadcast({ type: 'user_voice_left', sessionId, ip });
    }
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

httpsServer.listen(PORT, '0.0.0.0', () => {
  log(`OpenChat Server listening on wss://0.0.0.0:${PORT}`);
  log('Phase 3: TLS enabled — connections are encrypted (wss://)');
  log(`Max connections : ${MAX_CONNECTIONS}`);
  log(`Max payload     : ${MAX_PAYLOAD} bytes`);
  log(`Rate limit      : ${RATE_MAX_HITS} attempts / ${RATE_WINDOW_MS / 1000}s per IP`);
  log(`Password        : ${IS_BCRYPT_HASH ? '✓ pre-hashed (bcrypt)' : '✓ hashed at startup (bcrypt)'}`);
  log('Waiting for connections…');
});

httpsServer.on('error', (err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});

process.on('SIGINT',  () => { httpsServer.close(() => process.exit(0)); });
process.on('SIGTERM', () => { httpsServer.close(() => process.exit(0)); });