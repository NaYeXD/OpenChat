/**
 * ConnectScreen.jsx — Connect / login screen (Phase 3)
 *
 * New in Phase 3:
 *  - "Remember this server" checkbox — saves IP & port to localStorage
 *  - Pre-fills IP/port from localStorage on mount
 *  - Shows a wss:// encrypted badge so users know it is secure
 *  - Clears remembered server via a small "forget" link
 */

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'openchat_remembered_server';

function loadRemembered() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveRemembered(serverIp, port) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ serverIp, port }));
  } catch {}
}

function forgetRemembered() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export default function ConnectScreen({ onConnect, error, isConnecting }) {
  const remembered = loadRemembered();

  const [serverIp,  setServerIp]  = useState(remembered?.serverIp ?? '');
  const [port,      setPort]      = useState(remembered?.port      ?? '4000');
  const [password,  setPassword]  = useState('');
  const [remember,  setRemember]  = useState(!!remembered);
  const [hasMemory, setHasMemory] = useState(!!remembered);

  function handleSubmit(e) {
    e.preventDefault();
    if (!serverIp.trim() || isConnecting) return;

    if (remember) {
      saveRemembered(serverIp.trim(), port.trim() || '4000');
    } else {
      forgetRemembered();
    }

    onConnect({
      serverIp: serverIp.trim(),
      port:     port.trim() || '4000',
      password,
    });
  }

  function handleForget() {
    forgetRemembered();
    setServerIp('');
    setPort('4000');
    setRemember(false);
    setHasMemory(false);
  }

  return (
    <div className="connect-root">
      <div className="connect-grid" aria-hidden="true" />

      <div className="connect-card">
        {/* Header */}
        <div className="connect-header">
          <div className="connect-logo">
            <span className="logo-signal">
              <span /><span /><span />
            </span>
          </div>
          <h1 className="connect-title">OpenChat</h1>
          <p className="connect-sub">Open-source · Self-hosted · Free</p>
        </div>

        {/* Secure badge */}
        <div className="connect-secure-badge">
          <span className="secure-icon">🔒</span>
          <span className="secure-text">Encrypted connection (wss://)</span>
        </div>

        {/* Form */}
        <form className="connect-form" onSubmit={handleSubmit} autoComplete="off">
          <div className="field">
            <label className="field-label" htmlFor="serverIp">
              <span className="field-prefix">01</span> Server Address
            </label>
            <input
              id="serverIp"
              className="field-input"
              type="text"
              placeholder="192.168.1.100"
              value={serverIp}
              onChange={e => setServerIp(e.target.value)}
              required
              autoFocus
              disabled={isConnecting}
              spellCheck={false}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="port">
              <span className="field-prefix">02</span> Port
            </label>
            <input
              id="port"
              className="field-input"
              type="number"
              placeholder="4000"
              value={port}
              onChange={e => setPort(e.target.value)}
              min="1"
              max="65535"
              disabled={isConnecting}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="password">
              <span className="field-prefix">03</span> Password
            </label>
            <input
              id="password"
              className="field-input"
              type="password"
              placeholder="Server password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={isConnecting}
            />
          </div>

          {/* Remember checkbox */}
          <div className="field-remember">
            <label className="remember-label">
              <input
                type="checkbox"
                className="remember-checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                disabled={isConnecting}
              />
              <span className="remember-text">Remember this server</span>
            </label>
            {hasMemory && (
              <button
                type="button"
                className="forget-btn"
                onClick={handleForget}
                title="Clear saved server"
              >
                forget
              </button>
            )}
          </div>

          {error && (
            <div className="connect-error" role="alert">
              <span className="error-icon">!</span>
              <span style={{ whiteSpace: 'pre-line' }}>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className={`connect-btn ${isConnecting ? 'is-loading' : ''}`}
            disabled={isConnecting || !serverIp.trim()}
          >
            {isConnecting ? (
              <><span className="spinner" /> Connecting…</>
            ) : (
              '🔒 Connect Securely'
            )}
          </button>
        </form>

        <p className="connect-footer">
          Need a server?&nbsp;
          <span className="footer-hint">Run <code>npm start</code> in <code>server/</code>.</span>
        </p>
      </div>
    </div>
  );
}