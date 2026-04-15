/**
 * server.js — OpenChat WebSocket Server (Phase 2)
 *
 * New in Phase 2:
 *  - Each client gets a unique sessionId (ip + timestamp) on connect
 *  - sessionId is included in all user list / join / leave broadcasts
 *  - Voice channel tracking (which sessionIds are in voice)
 *  - WebRTC signaling relay: offer / answer / ice-candidate
 *    The server never touches SDP content — it only routes by sessionId
 */

require('dotenv').config();

const WebSocket  = require('ws');
const { saveMessage, getRecentMessages } = require('./database');

// ── Config ────────────────────────────────────────────────────────────────────

const PORT     = parseInt(process.env.PORT || '4000', 10);
const PASSWORD = process.env.SERVER_PASSWORD || 'changeme';

if (PASSWORD === 'changeme') {
  console.warn('⚠  WARNING: Using the default password. Set SERVER_PASSWORD in .env!');
}

// ── State ─────────────────────────────────────────────────────────────────────

/**
 * clients: Map<WebSocket, { ip: string, sessionId: string }>
 * Only holds authenticated connections.
 */
const clients = new Map();

/**
 * voiceUsers: Set<sessionId>
 * Tracks which authenticated sessions are currently in the voice channel.
 */
const voiceUsers = new Set();

// ── Helpers ───────────────────────────────────────────────────────────────────

function timestamp() {
  return new Date().toISOString();
}

function log(msg) {
  console.log(`[${timestamp()}] ${msg}`);
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

/** Serialised user list — sent to clients */
function getUserList() {
  return Array.from(clients.values()).map(c => ({
    sessionId: c.sessionId,
    ip:        c.ip,
    inVoice:   voiceUsers.has(c.sessionId),
  }));
}

/** Serialised voice user list */
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

/**
 * Find the WebSocket for a given sessionId.
 * Used to route signaling messages to the correct peer.
 */
function findBySessionId(sessionId) {
  for (const [ws, info] of clients) {
    if (info.sessionId === sessionId) return ws;
  }
  return null;
}

// ── Server ────────────────────────────────────────────────────────────────────

const wss = new WebSocket.Server({ port: PORT });

wss.on('connection', (ws, req) => {
  const ip        = getClientIp(req);
  const sessionId = `${ip.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}`;
  let authenticated = false;

  log(`Connection attempt from ${ip} (session: ${sessionId})`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); }
    catch {
      send(ws, { type: 'error', message: 'Malformed JSON' });
      return;
    }

    // ── Auth gate ──────────────────────────────────────────────────────────

    if (!authenticated) {
      if (msg.type !== 'auth') {
        send(ws, { type: 'error', message: 'Send auth first' });
        return;
      }
      if (msg.password !== PASSWORD) {
        log(`Auth FAILED from ${ip}`);
        send(ws, { type: 'auth_failed', message: 'Incorrect password' });
        ws.close(1008, 'Bad password');
        return;
      }

      authenticated = true;
      clients.set(ws, { ip, sessionId });
      log(`Auth OK — ${ip} (${sessionId}) joined (${clients.size} online)`);

      // Tell client its own identity
      send(ws, { type: 'auth_success', yourIp: ip, yourSessionId: sessionId });

      // Send chat history
      send(ws, { type: 'history', messages: getRecentMessages() });

      // Send full user list (includes voice status)
      send(ws, { type: 'user_list', users: getUserList() });

      // Notify everyone else
      broadcast({
        type:      'user_joined',
        ip,
        sessionId,
        inVoice:   false,
      }, ws);

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
        if (voiceUsers.has(sessionId)) return; // already in voice
        voiceUsers.add(sessionId);
        log(`[VOICE] ${ip} (${sessionId}) joined voice (${voiceUsers.size} in voice)`);

        // Tell the joiner who is already in voice (so they can send offers)
        send(ws, {
          type:       'voice_joined_ack',
          voiceUsers: getVoiceUserList().filter(u => u.sessionId !== sessionId),
        });

        // Notify everyone else that this user joined voice
        broadcast({
          type:      'user_voice_joined',
          sessionId,
          ip,
        }, ws);

        // Also update the joiner's own entry in everyone's user list
        broadcast({
          type:      'user_voice_state',
          sessionId,
          inVoice:   true,
        }, ws);

        break;
      }

      // ── Voice: leave ───────────────────────────────────────────────────────
      case 'voice_leave': {
        if (!voiceUsers.has(sessionId)) return;
        voiceUsers.delete(sessionId);
        log(`[VOICE] ${ip} (${sessionId}) left voice`);
        broadcast({ type: 'user_voice_left', sessionId, ip });
        broadcast({ type: 'user_voice_state', sessionId, inVoice: false });
        break;
      }

      // ── WebRTC signaling relay ─────────────────────────────────────────────
      // The server reads ONLY targetId to route the message.
      // SDP and candidate content are passed through untouched.

      case 'offer': {
        const target = findBySessionId(msg.targetId);
        if (target) {
          send(target, { type: 'offer', fromId: sessionId, sdp: msg.sdp });
        }
        break;
      }

      case 'answer': {
        const target = findBySessionId(msg.targetId);
        if (target) {
          send(target, { type: 'answer', fromId: sessionId, sdp: msg.sdp });
        }
        break;
      }

      case 'ice-candidate': {
        const target = findBySessionId(msg.targetId);
        if (target) {
          send(target, { type: 'ice-candidate', fromId: sessionId, candidate: msg.candidate });
        }
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

    // Clean up voice state
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
      broadcast({ type: 'user_left', ip, sessionId });
      broadcast({ type: 'user_voice_left', sessionId, ip });
    }
  });
});

wss.on('listening', () => {
  log(`OpenChat Server listening on ws://0.0.0.0:${PORT}`);
  log('Phase 2: WebRTC signaling relay enabled');
  log(`Password: ${PASSWORD === 'changeme' ? '⚠  DEFAULT (change it!)' : '✓ custom set'}`);
  log('Waiting for connections...');
});

wss.on('error', (err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});

process.on('SIGINT',  () => { wss.close(() => process.exit(0)); });
process.on('SIGTERM', () => { wss.close(() => process.exit(0)); });