/**
 * server.js — OpenChat Server (Phase 4)
 *
 * New in Phase 4:
 *  - Express HTTP layer for /api/register and /api/login
 *  - JWT-based WebSocket authentication (replaces plain password auth)
 *  - User accounts stored in SQLite via node:sqlite (no compilation required)
 *  - Usernames replace IP addresses in chat messages and user lists
 *  - Admin WebSocket commands: kick, ban, unban, get audit log
 *  - Ban list checked on every new connection attempt
 *  - First registered user (or ADMIN_USERNAME env var) becomes admin
 */

require('dotenv').config();

const https     = require('https');
const express   = require('express');
const WebSocket = require('ws');

const { loadOrCreateCert }  = require('./certManager');
const { secLog }            = require('./securityLog');
const { generateToken, verifyToken, hashPassword, checkPassword } = require('./auth');
const db = require('./database');

// ── Config ────────────────────────────────────────────────────────────────────

const PORT            = parseInt(process.env.PORT             || '4000', 10);
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS  || '20',   10);
const MAX_PAYLOAD     = parseInt(process.env.MAX_PAYLOAD_BYTES || '65536', 10);
const ADMIN_USERNAME  = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();
const RATE_WINDOW_MS  = 60_000;
const RATE_MAX_HITS   = 10;   // slightly more generous — login requests count too
const BAN_DURATION_MS = 5 * 60_000;

// ── Rate limiter ──────────────────────────────────────────────────────────────

const rateLimits = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of rateLimits) {
    if (e.bannedUntil < now && e.resetAt < now) rateLimits.delete(ip);
  }
}, 10 * 60_000);

function checkRateLimit(ip) {
  const now = Date.now();
  let e = rateLimits.get(ip) ?? { attempts: 0, resetAt: now + RATE_WINDOW_MS, bannedUntil: 0 };

  if (e.bannedUntil > now) return { allowed: false, reason: 'banned', banRemainingMs: e.bannedUntil - now };
  if (now >= e.resetAt) { e.attempts = 0; e.resetAt = now + RATE_WINDOW_MS; }

  e.attempts++;
  rateLimits.set(ip, e);

  if (e.attempts > RATE_MAX_HITS) {
    e.bannedUntil = now + BAN_DURATION_MS;
    rateLimits.set(ip, e);
    return { allowed: false, reason: 'rate_exceeded', banRemainingMs: BAN_DURATION_MS };
  }
  return { allowed: true };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ts()      { return new Date().toISOString(); }
function log(msg)  { console.log(`[${ts()}] ${msg}`); }

function getIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return fwd ? fwd.split(',')[0].trim() : (req.socket?.remoteAddress || 'unknown');
}

// ── State ─────────────────────────────────────────────────────────────────────

/**
 * clients: Map<WebSocket, { ip, sessionId, userId, username, role }>
 * Only authenticated connections.
 */
const clients    = new Map();
const voiceUsers = new Set(); // sessionIds

function getUserList() {
  return Array.from(clients.values()).map(c => ({
    sessionId: c.sessionId,
    username:  c.username,
    role:      c.role,
    inVoice:   voiceUsers.has(c.sessionId),
  }));
}

function getVoiceUserList() {
  return Array.from(clients.values())
    .filter(c => voiceUsers.has(c.sessionId))
    .map(c => ({ sessionId: c.sessionId, username: c.username }));
}

function findBySessionId(sessionId) {
  for (const [ws, info] of clients) {
    if (info.sessionId === sessionId) return ws;
  }
  return null;
}

function findByUsername(username) {
  for (const [ws, info] of clients) {
    if (info.username.toLowerCase() === username.toLowerCase()) return ws;
  }
  return null;
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(payload, exclude = null) {
  const data = JSON.stringify(payload);
  for (const [ws] of clients) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

// ── Express app (HTTP auth endpoints) ────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '16kb' }));

// ── CORS (for dev / browser testing) ──────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── POST /api/register ─────────────────────────────────────────────────────────

app.post('/api/register', async (req, res) => {
  const ip = getIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    secLog('RATE_LIMIT_HTTP', ip, `reason=${rl.reason}`);
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const { username, password } = req.body ?? {};

  // Validate
  if (typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 24) {
    return res.status(400).json({ error: 'Username must be 2–24 characters.' });
  }
  if (typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters.' });
  }
  if (!/^[a-zA-Z0-9_\-]+$/.test(username.trim())) {
    return res.status(400).json({ error: 'Username may only contain letters, numbers, _ and -.' });
  }

  const clean = username.trim();

  // Duplicate check
  if (db.findUser(clean)) {
    return res.status(409).json({ error: 'Username is already taken.' });
  }

  // Determine role
  const isFirst        = db.userCount() === 0;
  const isNamedAdmin   = ADMIN_USERNAME && clean.toLowerCase() === ADMIN_USERNAME;
  const role           = (isFirst || isNamedAdmin) ? 'admin' : 'user';

  // Create
  const hash   = hashPassword(password);
  const userId = db.createUser(clean, hash, role);

  const user  = { id: userId, username: clean, role };
  const token = generateToken(user);

  log(`[AUTH] Registered: ${clean} (${role}) from ${ip}`);
  db.addAuditEntry('REGISTER', clean, null, `role=${role} ip=${ip}`);

  return res.status(201).json({ token, username: clean, role });
});

// ── POST /api/login ────────────────────────────────────────────────────────────

app.post('/api/login', async (req, res) => {
  const ip = getIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    secLog('RATE_LIMIT_HTTP', ip, `reason=${rl.reason}`);
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const { username, password } = req.body ?? {};

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = db.findUser(username.trim());
  if (!user) {
    secLog('AUTH_FAIL_HTTP', ip, `user=${username} reason=not_found`);
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const ok = await checkPassword(password, user.password_hash);
  if (!ok) {
    secLog('AUTH_FAIL_HTTP', ip, `user=${username} reason=wrong_password`);
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  // Check ban
  if (db.isBanned(user.username)) {
    secLog('BANNED_LOGIN', ip, `user=${user.username}`);
    return res.status(403).json({ error: 'Your account has been banned.' });
  }

  db.touchLastSeen(user.id);
  const token = generateToken(user);

  log(`[AUTH] Login: ${user.username} (${user.role}) from ${ip}`);
  return res.json({ token, username: user.username, role: user.role });
});

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', phase: 4 }));

// ── TLS + HTTPS server ────────────────────────────────────────────────────────

const { cert, key } = loadOrCreateCert();
const httpsServer   = https.createServer({ cert, key }, app);

// ── WebSocket server ──────────────────────────────────────────────────────────

const wss = new WebSocket.Server({ noServer: true, maxPayload: MAX_PAYLOAD });

httpsServer.on('upgrade', (req, socket, head) => {
  const ip = getIp(req);

  if (clients.size >= MAX_CONNECTIONS) {
    secLog('MAX_CONN_REJECTED', ip);
    socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    socket.destroy();
    return;
  }

  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    secLog('RATE_LIMIT_WS', ip, `reason=${rl.reason}`);
    socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

// ── WS connection handler ─────────────────────────────────────────────────────

wss.on('connection', (ws, req) => {
  const ip = getIp(req);
  let   info = null; // set after successful auth: { ip, sessionId, userId, username, role }

  log(`WS connection from ${ip}`);

  ws.on('message', async (raw) => {
    if (raw.length > MAX_PAYLOAD) {
      secLog('OVERSIZED_MSG', ip);
      ws.close(1009, 'Message too large');
      return;
    }

    let msg;
    try { msg = JSON.parse(raw); } catch {
      send(ws, { type: 'error', message: 'Malformed JSON' });
      return;
    }

    if (!msg || typeof msg.type !== 'string') {
      send(ws, { type: 'error', message: 'Invalid message' });
      return;
    }

    // ── Auth gate ────────────────────────────────────────────────────────────

    if (!info) {
      if (msg.type !== 'auth') {
        send(ws, { type: 'error', message: 'Send auth first' });
        return;
      }

      if (typeof msg.token !== 'string') {
        send(ws, { type: 'auth_failed', message: 'No token provided' });
        ws.close(1008, 'No token');
        return;
      }

      let payload;
      try { payload = verifyToken(msg.token); }
      catch (err) {
        secLog('JWT_INVALID', ip, err.message);
        send(ws, { type: 'auth_failed', message: 'Invalid or expired session. Please log in again.' });
        ws.close(1008, 'Bad token');
        return;
      }

      // Refresh user from DB (catches bans applied after token issue)
      const user = db.findUser(payload.username);
      if (!user) {
        send(ws, { type: 'auth_failed', message: 'Account not found.' });
        ws.close(1008, 'No account');
        return;
      }

      if (db.isBanned(user.username)) {
        secLog('BANNED_WS', ip, `user=${user.username}`);
        send(ws, { type: 'auth_failed', message: 'Your account has been banned.' });
        ws.close(1008, 'Banned');
        return;
      }

      const sessionId = `${user.username}-${Date.now()}`;
      info = { ip, sessionId, userId: user.id, username: user.username, role: user.role };
      clients.set(ws, info);
      db.touchLastSeen(user.id);

      log(`[WS] Auth OK — ${user.username} (${user.role}) session=${sessionId}`);

      send(ws, { type: 'auth_success', username: user.username, role: user.role, sessionId });
      send(ws, { type: 'history', messages: db.getRecentMessages() });
      send(ws, { type: 'user_list', users: getUserList() });

      broadcast({ type: 'user_joined', username: user.username, role: user.role, sessionId, inVoice: false }, ws);
      return;
    }

    // ── Authenticated handlers ────────────────────────────────────────────────

    switch (msg.type) {

      // ── Text chat ────────────────────────────────────────────────────────────
      case 'chat': {
        const content = String(msg.content ?? '').trim().slice(0, 2000);
        if (!content) return;
        db.saveMessage(info.userId, info.username, content);
        const payload = { type: 'chat', username: info.username, role: info.role, content, timestamp: Date.now() };
        for (const [client] of clients) send(client, payload);
        log(`[CHAT] ${info.username}: ${content}`);
        break;
      }

      // ── Voice channel ─────────────────────────────────────────────────────────
      case 'voice_join': {
        if (voiceUsers.has(info.sessionId)) return;
        voiceUsers.add(info.sessionId);
        log(`[VOICE] ${info.username} joined voice`);
        send(ws, { type: 'voice_joined_ack', voiceUsers: getVoiceUserList().filter(u => u.sessionId !== info.sessionId) });
        broadcast({ type: 'user_voice_joined', sessionId: info.sessionId, username: info.username }, ws);
        broadcast({ type: 'user_voice_state',  sessionId: info.sessionId, inVoice: true }, ws);
        break;
      }

      case 'voice_leave': {
        if (!voiceUsers.has(info.sessionId)) return;
        voiceUsers.delete(info.sessionId);
        broadcast({ type: 'user_voice_left',  sessionId: info.sessionId, username: info.username });
        broadcast({ type: 'user_voice_state', sessionId: info.sessionId, inVoice: false });
        break;
      }

      // ── WebRTC signaling relay ─────────────────────────────────────────────────
      case 'offer':
      case 'answer':
      case 'ice-candidate': {
        const target = findBySessionId(msg.targetId);
        if (target) send(target, { ...msg, fromId: info.sessionId });
        break;
      }

      // ── Admin: kick ───────────────────────────────────────────────────────────
      case 'admin_kick': {
        if (info.role !== 'admin') { send(ws, { type: 'error', message: 'Admin only.' }); return; }

        const targetUsername = String(msg.targetUsername ?? '').trim();
        const targetWs       = findByUsername(targetUsername);

        if (!targetWs) {
          send(ws, { type: 'admin_error', message: `${targetUsername} is not online.` });
          return;
        }

        const targetInfo = clients.get(targetWs);
        if (targetInfo?.role === 'admin') {
          send(ws, { type: 'admin_error', message: 'Cannot kick another admin.' });
          return;
        }

        send(targetWs, { type: 'kicked', reason: msg.reason || 'Kicked by admin.' });
        targetWs.close(1008, 'Kicked');

        db.addAuditEntry('KICK', info.username, targetUsername, msg.reason || '');
        log(`[ADMIN] ${info.username} kicked ${targetUsername}`);
        send(ws, { type: 'admin_success', message: `${targetUsername} was kicked.` });
        break;
      }

      // ── Admin: ban ────────────────────────────────────────────────────────────
      case 'admin_ban': {
        if (info.role !== 'admin') { send(ws, { type: 'error', message: 'Admin only.' }); return; }

        const targetUsername = String(msg.targetUsername ?? '').trim();
        if (!targetUsername) { send(ws, { type: 'admin_error', message: 'No username provided.' }); return; }

        // Don't allow banning another admin
        const targetUser = db.findUser(targetUsername);
        if (!targetUser) { send(ws, { type: 'admin_error', message: 'User not found.' }); return; }
        if (targetUser.role === 'admin') { send(ws, { type: 'admin_error', message: 'Cannot ban another admin.' }); return; }

        const reason = String(msg.reason ?? '').trim() || 'Banned by admin.';
        db.banUser(targetUsername, info.username, reason);
        db.addAuditEntry('BAN', info.username, targetUsername, reason);

        // Kick if online
        const targetWs = findByUsername(targetUsername);
        if (targetWs) {
          send(targetWs, { type: 'banned', reason });
          targetWs.close(1008, 'Banned');
        }

        log(`[ADMIN] ${info.username} banned ${targetUsername}: ${reason}`);
        send(ws, { type: 'admin_success', message: `${targetUsername} has been banned.` });
        break;
      }

      // ── Admin: unban ──────────────────────────────────────────────────────────
      case 'admin_unban': {
        if (info.role !== 'admin') { send(ws, { type: 'error', message: 'Admin only.' }); return; }

        const targetUsername = String(msg.targetUsername ?? '').trim();
        if (!targetUsername) { send(ws, { type: 'admin_error', message: 'No username provided.' }); return; }

        db.unbanUser(targetUsername);
        db.addAuditEntry('UNBAN', info.username, targetUsername, '');
        log(`[ADMIN] ${info.username} unbanned ${targetUsername}`);
        send(ws, { type: 'admin_success', message: `${targetUsername} has been unbanned.` });
        break;
      }

      // ── Admin: get audit log ──────────────────────────────────────────────────
      case 'admin_get_audit_log': {
        if (info.role !== 'admin') { send(ws, { type: 'error', message: 'Admin only.' }); return; }
        send(ws, { type: 'audit_log', entries: db.getAuditLog() });
        break;
      }

      default: break;
    }
  });

  ws.on('close', () => {
    if (!info) return;
    clients.delete(ws);

    if (voiceUsers.has(info.sessionId)) {
      voiceUsers.delete(info.sessionId);
      broadcast({ type: 'user_voice_left', sessionId: info.sessionId, username: info.username });
    }

    log(`[WS] ${info.username} disconnected`);
    broadcast({ type: 'user_left', username: info.username, sessionId: info.sessionId });
  });

  ws.on('error', (err) => {
    log(`WS error (${info?.username ?? ip}): ${err.message}`);
    if (info) {
      clients.delete(ws);
      voiceUsers.delete(info.sessionId);
      broadcast({ type: 'user_left',       username: info.username, sessionId: info.sessionId });
      broadcast({ type: 'user_voice_left', sessionId: info.sessionId });
    }
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

httpsServer.listen(PORT, '0.0.0.0', () => {
  log(`OpenChat Server (Phase 4) listening on wss://0.0.0.0:${PORT}`);
  log(`HTTP auth API: https://0.0.0.0:${PORT}/api/register | /api/login`);
  log(`Admin username rule: ${ADMIN_USERNAME ? `forced="${ADMIN_USERNAME}"` : 'first registered user'}`);
  log('Waiting for connections…');
});

httpsServer.on('error', err => { console.error(`[FATAL] ${err.message}`); process.exit(1); });
process.on('SIGINT',  () => httpsServer.close(() => process.exit(0)));
process.on('SIGTERM', () => httpsServer.close(() => process.exit(0)));