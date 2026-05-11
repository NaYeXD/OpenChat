/**
 * auth.js — JWT and bcrypt helpers (Phase 4)
 */

const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'openchat-dev-secret-CHANGE-ME';
const JWT_EXPIRY = process.env.JWT_EXPIRY  || '7d';

if (JWT_SECRET === 'openchat-dev-secret-CHANGE-ME') {
  console.warn('⚠  WARNING: JWT_SECRET is not set in .env. Set a long random secret!');
  console.warn('   Generate one: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
}

// ── JWT ───────────────────────────────────────────────────────────────────────

/**
 * Issue a signed JWT for a user record.
 * @param {{ id, username, role }} user
 * @returns {string} signed token
 */
function generateToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/**
 * Verify and decode a JWT.
 * @param {string} token
 * @returns {{ userId, username, role }} decoded payload
 * @throws if invalid or expired
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// ── Bcrypt ────────────────────────────────────────────────────────────────────

const SALT_ROUNDS = 12;

function hashPassword(plain) {
  return bcrypt.hashSync(plain, SALT_ROUNDS);
}

async function checkPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { generateToken, verifyToken, hashPassword, checkPassword };