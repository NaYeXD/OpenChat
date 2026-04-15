/**
 * electron/preload.js — Preload script
 *
 * Exposes a minimal, safe API to the renderer via contextBridge.
 * The native WebSocket API is already available in Electron's renderer,
 * so we only need to expose platform metadata here for Phase 1.
 *
 * In later phases (TLS, file system access), more APIs will be added here.
 */

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** The OS platform — useful for platform-specific UI tweaks */
  platform: process.platform,
  /** App version from package.json */
  version: process.env.npm_package_version || '1.0.0',
});