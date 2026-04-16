/**
 * certManager.js — TLS Certificate Manager for OpenChat Server (Phase 3)
 *
 * On first run, generates a self-signed RSA-2048 / SHA-256 certificate using
 * node-forge and saves it to the /config directory.
 *
 * On subsequent runs, loads the existing cert/key from disk.
 *
 * To use your own certificate (Let's Encrypt, etc.), set CERT_PATH and KEY_PATH
 * in your .env file pointing to your cert.pem and key.pem files.
 */

const forge = require('node-forge');
const fs    = require('fs');
const path  = require('path');

const CONFIG_DIR = path.join(__dirname, 'config');
const CERT_FILE  = process.env.CERT_PATH || path.join(CONFIG_DIR, 'cert.pem');
const KEY_FILE   = process.env.KEY_PATH  || path.join(CONFIG_DIR, 'key.pem');

// ── Self-signed cert generation ───────────────────────────────────────────────

function generateSelfSigned() {
  console.log('[TLS] No certificate found — generating self-signed RSA-2048 cert…');
  console.log('[TLS] (This takes a few seconds on first run.)');

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey    = keys.publicKey;
  cert.serialNumber = Date.now().toString(16);

  cert.validity.notBefore = new Date();
  cert.validity.notAfter  = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const attrs = [
    { name: 'commonName',         value: 'OpenChat Self-Hosted Server' },
    { name: 'organizationName',   value: 'OpenChat'                    },
    { name: 'organizationalUnitName', value: 'Self-Hosted'             },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);   // self-signed: issuer == subject

  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    {
      name: 'keyUsage',
      keyCertSign:    true,
      digitalSignature: true,
      nonRepudiation:  true,
      keyEncipherment: true,
      dataEncipherment: true,
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
    },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
      ],
    },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  // Ensure config directory exists
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  fs.writeFileSync(CERT_FILE, forge.pki.certificateToPem(cert),        'utf8');
  fs.writeFileSync(KEY_FILE,  forge.pki.privateKeyToPem(keys.privateKey), 'utf8');

  console.log(`[TLS] ✓ Certificate saved to ${CERT_FILE}`);
  console.log(`[TLS] ✓ Private key  saved to ${KEY_FILE}`);
  console.log('[TLS] ✓ Valid for 10 years. Clients will see a "self-signed" warning.');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns { cert, key } Buffers for use with https.createServer().
 * Generates a self-signed cert on first call if none exist.
 */
function loadOrCreateCert() {
  const certExists = fs.existsSync(CERT_FILE);
  const keyExists  = fs.existsSync(KEY_FILE);

  if (!certExists || !keyExists) {
    generateSelfSigned();
  } else {
    console.log(`[TLS] ✓ Loaded certificate from ${CERT_FILE}`);
  }

  return {
    cert: fs.readFileSync(CERT_FILE),
    key:  fs.readFileSync(KEY_FILE),
  };
}

module.exports = { loadOrCreateCert };
