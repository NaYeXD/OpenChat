/**
 * securityLog.js — Security event logger for OpenChat Server (Phase 3)
 *
 * Writes security-relevant events (failed auth, rate-limit hits, oversized
 * payloads, malformed messages) to security.log in the server directory.
 * Each line is also echoed to stdout with a [SEC] prefix.
 */

const fs   = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'security.log');

// Open in append mode; created automatically if it doesn't exist.
const stream = fs.createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf8' });

stream.on('error', (err) => {
  console.error('[SEC] Could not write to security.log:', err.message);
});

function secLog(event, ip, detail = '') {
  const line = `[${new Date().toISOString()}] [${event}] ip=${ip}${detail ? ' ' + detail : ''}\n`;
  stream.write(line);
  process.stdout.write(`[SEC] ${line}`);
}

module.exports = { secLog };
