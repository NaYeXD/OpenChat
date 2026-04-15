/**
 * ConnectScreen.jsx — Initial connection / login screen
 */

import { useState } from 'react';

export default function ConnectScreen({ onConnect, error, isConnecting }) {
  const [serverIp, setServerIp]   = useState('');
  const [port, setPort]           = useState('4000');
  const [password, setPassword]   = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!serverIp.trim() || isConnecting) return;
    onConnect({
      serverIp: serverIp.trim(),
      port: port.trim() || '4000',
      password,
    });
  }

  return (
    <div className="connect-root">
      {/* Animated grid background */}
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

          {error && (
            <div className="connect-error" role="alert">
              <span className="error-icon">!</span>
              {error}
            </div>
          )}

          <button
            type="submit"
            className={`connect-btn ${isConnecting ? 'is-loading' : ''}`}
            disabled={isConnecting || !serverIp.trim()}
          >
            {isConnecting ? (
              <>
                <span className="spinner" />
                Connecting…
              </>
            ) : (
              'Connect to Server'
            )}
          </button>
        </form>

        <p className="connect-footer">
          Need a server?&nbsp;
          <span className="footer-hint">Run <code>node server.js</code> on your homelab.</span>
        </p>
      </div>
    </div>
  );
}