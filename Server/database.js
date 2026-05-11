/**
 * database.js — SQLite database layer (Phase 4)
 *
 * Uses node:sqlite — built into Node.js v22.5+ and stable in Node v23+.
 * No native compilation or npm install required (unlike better-sqlite3).
 *
 * Tables:
 *   users       — accounts with bcrypt-hashed passwords and roles
 *   messages    — chat history linked to user accounts
 *   audit_log   — admin action history
 *   banned_users — permanently banned accounts
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'openchat.db'));

// ── Optimisations ─────────────────────────────────────────────────────────────
db.exec(`PRAGMA journal_mode = WAL`);
db.exec(`PRAGMA foreign_keys = ON`);

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'user',
    created_at    INTEGER NOT NULL,
    last_seen     INTEGER
  );

  CREATE TABLE IF NOT EXISTS messages (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER NOT NULL,
    username  TEXT    NOT NULL,
    content   TEXT    NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    action       TEXT    NOT NULL,
    performed_by TEXT    NOT NULL,
    target       TEXT,
    detail       TEXT,
    timestamp    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS banned_users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT    UNIQUE NOT NULL COLLATE NOCASE,
    banned_by TEXT    NOT NULL,
    reason    TEXT,
    banned_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_ts   ON messages   (timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_ts      ON audit_log  (timestamp DESC);
`);

// ── Prepared statements ───────────────────────────────────────────────────────

const stmts = {
  // Users
  insertUser:       db.prepare('INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)'),
  findUserByName:   db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE'),
  findUserById:     db.prepare('SELECT * FROM users WHERE id = ?'),
  countUsers:       db.prepare('SELECT COUNT(*) as n FROM users'),
  updateLastSeen:   db.prepare('UPDATE users SET last_seen = ? WHERE id = ?'),
  promoteToAdmin:   db.prepare("UPDATE users SET role = 'admin' WHERE username = ? COLLATE NOCASE"),

  // Messages
  insertMessage:    db.prepare('INSERT INTO messages (user_id, username, content, timestamp) VALUES (?, ?, ?, ?)'),
  recentMessages:   db.prepare('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50'),

  // Audit log
  insertAudit:      db.prepare('INSERT INTO audit_log (action, performed_by, target, detail, timestamp) VALUES (?, ?, ?, ?, ?)'),
  recentAudit:      db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 100'),

  // Bans
  insertBan:        db.prepare('INSERT OR REPLACE INTO banned_users (username, banned_by, reason, banned_at) VALUES (?, ?, ?, ?)'),
  deleteBan:        db.prepare('DELETE FROM banned_users WHERE username = ? COLLATE NOCASE'),
  findBan:          db.prepare('SELECT * FROM banned_users WHERE username = ? COLLATE NOCASE'),
};

// ── Users ─────────────────────────────────────────────────────────────────────

function createUser(username, passwordHash, role = 'user') {
  const result = stmts.insertUser.run(username, passwordHash, role, Date.now());
  return result.lastInsertRowid;
}

function findUser(username) {
  return stmts.findUserByName.get(username) ?? null;
}

function userCount() {
  return stmts.countUsers.get().n;
}

function touchLastSeen(userId) {
  stmts.updateLastSeen.run(Date.now(), userId);
}

function promoteToAdmin(username) {
  stmts.promoteToAdmin.run(username);
}

// ── Messages ──────────────────────────────────────────────────────────────────

function saveMessage(userId, username, content) {
  stmts.insertMessage.run(userId, username, content, Date.now());
}

function getRecentMessages() {
  return stmts.recentMessages.all().reverse(); // oldest-first
}

// ── Audit log ─────────────────────────────────────────────────────────────────

function addAuditEntry(action, performedBy, target = null, detail = null) {
  stmts.insertAudit.run(action, performedBy, target, detail, Date.now());
}

function getAuditLog() {
  return stmts.recentAudit.all();
}

// ── Bans ──────────────────────────────────────────────────────────────────────

function banUser(username, bannedBy, reason = '') {
  stmts.insertBan.run(username, bannedBy, reason, Date.now());
}

function unbanUser(username) {
  stmts.deleteBan.run(username);
}

function isBanned(username) {
  return !!stmts.findBan.get(username);
}

module.exports = {
  createUser, findUser, userCount, touchLastSeen, promoteToAdmin,
  saveMessage, getRecentMessages,
  addAuditEntry, getAuditLog,
  banUser, unbanUser, isBanned,
};