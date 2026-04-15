/**
 * DeviceSelector.jsx — Audio input/output device picker
 *
 * All array props default to [] so the component never crashes
 * when the parent hasn't populated devices yet.
 */

import { useState } from 'react';

const SINK_ID_SUPPORTED = typeof HTMLMediaElement.prototype.setSinkId === 'function';

export default function DeviceSelector({
  inputDevices     = [],
  outputDevices    = [],
  selectedInputId  = 'default',
  selectedOutputId = 'default',
  onInputChange,
  onOutputChange,
}) {
  const [expanded, setExpanded] = useState(false);

  function label(device, index, kind) {
    if (device.label) return device.label;
    return kind === 'input' ? `Microphone ${index + 1}` : `Speaker ${index + 1}`;
  }

  return (
    <div className="ds-root">
      <button
        className={`ds-toggle ${expanded ? 'is-open' : ''}`}
        onClick={() => setExpanded(v => !v)}
        title="Audio device settings"
      >
        <span className="ds-toggle-icon">⚙</span>
        <span className="ds-toggle-label">Audio Devices</span>
        <span className="ds-toggle-caret">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="ds-panel">

          {/* ── Microphone (input) ───────────────────────────────────────── */}
          <div className="ds-field">
            <label className="ds-label">
              <span className="ds-label-icon">🎙</span> Microphone
            </label>
            {inputDevices.length === 0 ? (
              <p className="ds-hint">Join voice once to unlock device names.</p>
            ) : (
              <select
                className="ds-select"
                value={selectedInputId}
                onChange={e => onInputChange?.(e.target.value)}
              >
                <option value="default">Default Microphone</option>
                {inputDevices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {label(d, i, 'input')}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* ── Speaker / headset (output) ───────────────────────────────── */}
          {SINK_ID_SUPPORTED ? (
            <div className="ds-field">
              <label className="ds-label">
                <span className="ds-label-icon">🔊</span> Speaker / Headset
              </label>
              {outputDevices.length === 0 ? (
                <p className="ds-hint">Join voice once to unlock device names.</p>
              ) : (
                <select
                  className="ds-select"
                  value={selectedOutputId}
                  onChange={e => onOutputChange?.(e.target.value)}
                >
                  <option value="default">Default Speaker</option>
                  {outputDevices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {label(d, i, 'output')}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <p className="ds-hint">
              Output device selection is not available in this environment.
            </p>
          )}

        </div>
      )}
    </div>
  );
}