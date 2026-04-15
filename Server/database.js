/**
 * database.js — JSON file-based message store for OpenChat Server
 *
 * Replaces better-sqlite3 with a plain JSON file so no native compilation
 * (node-gyp / Visual Studio / Windows SDK) is required.
 *
 * Data is kept in memory and flushed to disk after every write.
 * File: openchat-messages.json  (created automatically on first run)
 *
 * Upgrade path: In Phase 4 this will be replaced with a proper SQLite/
 * PostgreSQL database alongside user accounts.
 */

const fs   = require('fs');
const path = require('path');

const DB_FILE    = path.join(__dirname, 'openchat-messages.json');
const MAX_STORED = 500; // cap file size — keep only the most recent 500 messages

// ── Load existing messages from disk (or start fresh) ─────────────────────────

let messages = [];

try {
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  messages = JSON.parse(raw);
  if (!Array.isArray(messages)) messages = [];
  console.log(`[DB] Loaded ${messages.length} messages from ${DB_FILE}`);
} catch (err) {
  if (err.code === 'ENOENT') {
    console.log('[DB] No existing message file found — starting fresh.');
  } else {
    console.error('[DB] Warning: could not read message file:', err.message);
    messages = [];
  }
}

// ── Persist to disk ────────────────────────────────────────────────────────────

function flush() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(messages, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB] Warning: could not write message file:', err.message);
  }
}

// ── Exported API ───────────────────────────────────────────────────────────────

/**
 * Save a chat message.
 * @param {string} senderIp
 * @param {string} content
 * @returns {{ id, sender_ip, content, timestamp }}
 */
function saveMessage(senderIp, content) {
  const record = {
    id:        messages.length + 1,
    sender_ip: senderIp,
    content,
    timestamp: Date.now(),
  };

  messages.push(record);

  // Trim to cap
  if (messages.length > MAX_STORED) {
    messages = messages.slice(messages.length - MAX_STORED);
  }

  flush();
  return record;
}

/**
 * Return the most recent 50 messages in chronological order (oldest first).
 * @returns {Array}
 */
function getRecentMessages() {
  return messages.slice(-50);
}

module.exports = { saveMessage, getRecentMessages };