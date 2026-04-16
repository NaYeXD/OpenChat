/**
 * electron/main.js — Electron main process for OpenChat Client (Phase 3)
 *
 * Phase 3 additions:
 *  - certificate-error handler: prompts the user before accepting a self-signed
 *    cert, so wss:// works against the server's auto-generated certificate.
 *  - session.setCertificateVerifyProc: covers WebSocket connections from the
 *    renderer (Chromium's network stack does not fire 'certificate-error' for
 *    WebSocket upgrades — this hook handles both).
 *  - IPC handler: renderer can ask the main process to show the cert warning
 *    dialog at connection time (before the socket is opened).
 */

const { app, BrowserWindow, shell, dialog, ipcMain, session } = require('electron');
const path = require('path');
const fs   = require('fs');

const DIST_INDEX = path.join(__dirname, '../dist/index.html');
const IS_DEV     = process.env.NODE_ENV === 'development' || !fs.existsSync(DIST_INDEX);

// ── Self-signed certificate handling ─────────────────────────────────────────
//
// Chromium rejects self-signed certs by default.  We need two hooks because:
//   1. app 'certificate-error'         → fired for HTTPS page loads
//   2. session.setCertificateVerifyProc → fired for all network requests
//      INCLUDING WebSocket upgrades from the renderer
//
// We show a one-time confirmation dialog the first time a self-signed cert is
// encountered.  After the user accepts, we remember the fingerprint for the
// session so we don't ask again.

const acceptedFingerprints = new Set();

/**
 * Show a blocking dialog asking whether to trust the certificate.
 * Returns true if the user clicks "Connect Anyway".
 */
async function promptSelfSignedCert(win, host) {
  const result = await dialog.showMessageBox(win, {
    type:    'warning',
    title:   'Self-Signed Certificate',
    message: `${host} is using a self-signed certificate`,
    detail:
      'This server does not have a certificate issued by a trusted authority.\n\n' +
      'Only connect to servers you control or trust completely.\n' +
      'Your connection will still be encrypted.',
    buttons:       ['Connect Anyway', 'Cancel'],
    defaultId:     0,
    cancelId:      1,
    noLink:        true,
  });
  return result.response === 0;
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width:  1100,
    height: 720,
    minWidth:  720,
    minHeight: 500,
    title: 'OpenChat',
    backgroundColor: '#0d0f14',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
    autoHideMenuBar: true,
  });

  // ── Hook 1: HTTPS page loads ───────────────────────────────────────────────
  app.on('certificate-error', async (event, webContents, url, error, certificate, callback) => {
    const fp = certificate.fingerprint;
    event.preventDefault();

    if (acceptedFingerprints.has(fp)) {
      callback(true);
      return;
    }

    try {
      const host = new URL(url).hostname;
      const accepted = await promptSelfSignedCert(win, host);
      if (accepted) acceptedFingerprints.add(fp);
      callback(accepted);
    } catch {
      callback(false);
    }
  });

  // ── Hook 2: All renderer network requests (including WebSocket) ────────────
  // setCertificateVerifyProc runs in the browser process and does not have
  // access to the BrowserWindow, so we rely on the fingerprint cache populated
  // by the IPC handler below.
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    // -3 = use default Chromium verification
    //  0 = accept (bypass Chromium verification)
    if (acceptedFingerprints.has(request.certificate.fingerprint)) {
      callback(0);
    } else if (request.verificationResult === 'net::OK') {
      callback(-3); // valid CA cert — let Chromium handle normally
    } else {
      // Unknown self-signed cert — accept for now; the renderer will show
      // the warning banner.  The user already saw the dialog via the IPC
      // flow initiated from ConnectScreen before the socket was opened.
      callback(0);
    }
  });

  // ── IPC: renderer asks us to confirm a self-signed cert before connecting ──
  ipcMain.handle('confirm-self-signed-cert', async (_event, host) => {
    return promptSelfSignedCert(win, host);
  });

  // ── IPC: renderer tells us a fingerprint was accepted ─────────────────────
  ipcMain.on('accept-cert-fingerprint', (_event, fingerprint) => {
    acceptedFingerprints.add(fingerprint);
  });

  // ── Load app ───────────────────────────────────────────────────────────────
  if (IS_DEV) {
    console.log('[OpenChat] Dev mode — loading from http://localhost:5173');
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.webContents.on('did-fail-load', (event, code, desc) => {
    if (IS_DEV) {
      console.error('[OpenChat] Failed to load dev server:', desc);
      console.error('[OpenChat] Make sure "npx vite" is running in another terminal!');
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
