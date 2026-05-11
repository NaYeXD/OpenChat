/**
 * ConnectScreen.jsx — Login / Register screen (Phase 4)
 *
 * Two modes toggled by a tab: Login | Register
 * Fields: Server IP, Port, Username, Password (+ Confirm Password on Register)
 * Remember this server: saves IP, port, username to localStorage (NOT password)
 */

import { useState } from 'react';

const STORAGE_KEY = 'openchat_remembered_server';

function loadRemembered() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
  catch { return null; }
}
function saveRemembered(d)  { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} }
function forgetRemembered() { try { localStorage.removeItem(STORAGE_KEY); } catch {} }

export default function ConnectScreen({ onConnect, error, isConnecting }) {
  const remembered = loadRemembered();

  const [mode,     setMode]     = useState('login');  // 'login' | 'register'
  const [serverIp, setServerIp] = useState(remembered?.serverIp ?? '');
  const [port,     setPort]     = useState(remembered?.port      ?? '4000');
  const [username, setUsername] = useState(remembered?.username  ?? '');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [remember, setRemember] = useState(!!remembered);
  const [hasMemory, setHasMemory] = useState(!!remembered);
  const [localError, setLocalError] = useState('');

  function switchMode(m) {
    setMode(m);
    setLocalError('');
    setPassword('');
    setConfirm('');
  }

  function handleSubmit(e) {
    e.preventDefault();
    setLocalError('');

    if (mode === 'register') {
      if (username.trim().length < 2) { setLocalError('Username must be at least 2 characters.'); return; }
      if (!/^[a-zA-Z0-9_\-]+$/.test(username.trim())) { setLocalError('Username may only contain letters, numbers, _ and -.'); return; }
      if (password.length < 4) { setLocalError('Password must be at least 4 characters.'); return; }
      if (password !== confirm)  { setLocalError('Passwords do not match.'); return; }
    }

    if (remember) {
      saveRemembered({ serverIp: serverIp.trim(), port: port.trim() || '4000', username: username.trim() });
    } else {
      forgetRemembered();
    }

    onConnect({
      serverIp: serverIp.trim(),
      port:     port.trim() || '4000',
      username: username.trim(),
      password,
      mode,
    });
  }

  function handleForget() {
    forgetRemembered();
    setServerIp(''); setPort('4000'); setUsername('');
    setRemember(false); setHasMemory(false);
  }

  const displayError = localError || error;

  return (
    <div className="connect-root">
      <div className="connect-grid" aria-hidden="true" />

      <div className="connect-card">
        {/* Logo */}
        <div className="connect-header">
          <div className="connect-logo">
            <span className="logo-signal"><span /><span /><span /></span>
          </div>
          <h1 className="connect-title">OpenChat</h1>
          <p className="connect-sub">Open-source · Self-hosted · Free</p>
        </div>

        {/* Secure badge */}
        <div className="connect-secure-badge">
          <span className="secure-icon">🔒</span>
          <span className="secure-text">Encrypted connection (wss://)</span>
        </div>

        {/* Mode tabs */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'is-active' : ''}`}
            onClick={() => switchMode('login')}
            disabled={isConnecting}
          >
            Login
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'register' ? 'is-active' : ''}`}
            onClick={() => switchMode('register')}
            disabled={isConnecting}
          >
            Register
          </button>
        </div>

        <form className="connect-form" onSubmit={handleSubmit} autoComplete="off">
          {/* Server fields */}
          <div className="field-row">
            <div className="field" style={{ flex: 2 }}>
              <label className="field-label" htmlFor="serverIp">
                <span className="field-prefix">01</span> Server Address
              </label>
              <input
                id="serverIp" className="field-input" type="text"
                placeholder="192.168.1.100" value={serverIp}
                onChange={e => setServerIp(e.target.value)}
                required autoFocus disabled={isConnecting} spellCheck={false}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="field-label" htmlFor="port">
                <span className="field-prefix">02</span> Port
              </label>
              <input
                id="port" className="field-input" type="number"
                placeholder="4000" value={port}
                onChange={e => setPort(e.target.value)}
                min="1" max="65535" disabled={isConnecting}
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="username">
              <span className="field-prefix">03</span> Username
            </label>
            <input
              id="username" className="field-input" type="text"
              placeholder="your_username" value={username}
              onChange={e => setUsername(e.target.value)}
              required disabled={isConnecting} spellCheck={false}
              autoComplete="username"
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="password">
              <span className="field-prefix">04</span> Password
            </label>
            <input
              id="password" className="field-input" type="password"
              placeholder="••••••••" value={password}
              onChange={e => setPassword(e.target.value)}
              required disabled={isConnecting}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {mode === 'register' && (
            <div className="field">
              <label className="field-label" htmlFor="confirm">
                <span className="field-prefix">05</span> Confirm Password
              </label>
              <input
                id="confirm" className="field-input" type="password"
                placeholder="••••••••" value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required disabled={isConnecting}
                autoComplete="new-password"
              />
            </div>
          )}

          {/* Remember */}
          <div className="field-remember">
            <label className="remember-label">
              <input
                type="checkbox" className="remember-checkbox"
                checked={remember} onChange={e => setRemember(e.target.checked)}
                disabled={isConnecting}
              />
              <span className="remember-text">Remember this server</span>
            </label>
            {hasMemory && (
              <button type="button" className="forget-btn" onClick={handleForget}>
                forget
              </button>
            )}
          </div>

          {displayError && (
            <div className="connect-error" role="alert">
              <span className="error-icon">!</span>
              <span style={{ whiteSpace: 'pre-line' }}>{displayError}</span>
            </div>
          )}

          <button
            type="submit"
            className={`connect-btn ${isConnecting ? 'is-loading' : ''}`}
            disabled={isConnecting || !serverIp.trim() || !username.trim()}
          >
            {isConnecting
              ? <><span className="spinner" /> {mode === 'register' ? 'Creating account…' : 'Logging in…'}</>
              : mode === 'register' ? '🔒 Create Account & Connect' : '🔒 Login & Connect'
            }
          </button>
        </form>

        <p className="connect-footer">
          {mode === 'login'
            ? <>No account? <button className="footer-link" onClick={() => switchMode('register')}>Register here</button></>
            : <>Have an account? <button className="footer-link" onClick={() => switchMode('login')}>Login here</button></>
          }
        </p>
      </div>
    </div>
  );
}