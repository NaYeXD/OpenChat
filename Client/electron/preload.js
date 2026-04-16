/**
 * electron/preload.js — Preload script (Phase 3)
 *
 * Phase 3 additions:
 *  - confirmSelfSignedCert(host) → IPC call to show the cert-trust dialog
 *  - acceptCertFingerprint(fp)   → tells main process to cache a fingerprint
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** The OS platform — useful for platform-specific UI tweaks */
  platform: process.platform,

  /** App version from package.json */
  version: process.env.npm_package_version || '1.0.0',

  /**
   * Show a dialog asking the user to confirm a self-signed certificate.
   * Returns a Promise<boolean> — true if the user clicked "Connect Anyway".
   * Call this BEFORE opening the WebSocket so the cert verify proc has the
   * fingerprint cached when Chromium makes the TLS handshake.
   *
   * @param {string} host  Hostname or IP being connected to
   */
  confirmSelfSignedCert: (host) =>
    ipcRenderer.invoke('confirm-self-signed-cert', host),

  /**
   * Tell the main process to permanently accept this cert fingerprint for
   * the lifetime of the session (no more dialogs for the same cert).
   *
   * @param {string} fingerprint  Certificate SHA-256 fingerprint
   */
  acceptCertFingerprint: (fingerprint) =>
    ipcRenderer.send('accept-cert-fingerprint', fingerprint),
});
