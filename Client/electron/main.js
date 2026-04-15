/**
 * electron/main.js — Electron main process for OpenChat Client
 */

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs   = require('fs');

// Dev mode if NODE_ENV is set, OR if dist hasn't been built yet.
// This means plain `npx electron .` works during development without
// needing to set any environment variables manually.
const DIST_INDEX = path.join(__dirname, '../dist/index.html');
const IS_DEV = process.env.NODE_ENV === 'development' || !fs.existsSync(DIST_INDEX);

// ── Security: disable remote module, use contextIsolation ────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 500,
    title: 'OpenChat',
    backgroundColor: '#0d0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload to use contextBridge
    },
    // Remove default menu bar for a cleaner look
    autoHideMenuBar: true,
  });

  if (IS_DEV) {
    // Load from Vite dev server
    console.log('[OpenChat] Dev mode — loading from http://localhost:5173');
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Load built files
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show a helpful error if the dev server isn't running
  win.webContents.on('did-fail-load', (event, code, desc) => {
    if (IS_DEV) {
      console.error('[OpenChat] Failed to load dev server:', desc);
      console.error('[OpenChat] Make sure "npx vite" is running in another terminal!');
    }
  });

  // Open external links in the OS browser, not in Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // On macOS, apps stay "running" until Cmd+Q
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});