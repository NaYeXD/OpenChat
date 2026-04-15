/**
 * VoiceControls.jsx — Voice channel controls + device selector (Phase 2)
 */

import DeviceSelector from './DeviceSelector.jsx';

export default function VoiceControls({ voice }) {
  const {
    inVoice, isMuted, voiceUsers,
    joinVoice, leaveVoice, toggleMute,
    inputDevices, outputDevices,
    selectedInputId, selectedOutputId,
    setSelectedInputId, setSelectedOutputId,
  } = voice;

  return (
    <div className="vc-root">
      {/* Header */}
      <div className="vc-header">
        <span className="vc-label">Voice Channel</span>
        {inVoice && (
          <span className="vc-live-badge">
            <span className="vc-live-dot" />
            LIVE
          </span>
        )}
      </div>

      {/* In-call status */}
      {inVoice && (
        <div className="vc-users-in-call">
          <span className="vc-mic-icon">🎙</span>
          <span className="vc-in-call-count">
            {voiceUsers.length + 1} in call
            {isMuted && <span className="vc-muted-note"> · muted</span>}
          </span>
        </div>
      )}

      {/* Join / Mute / Leave buttons */}
      <div className="vc-controls">
        {!inVoice ? (
          <button className="vc-btn vc-btn--join" onClick={joinVoice}>
            <span className="vc-btn-icon">🎙</span>
            Join Voice
          </button>
        ) : (
          <>
            <button
              className={`vc-btn vc-btn--mute ${isMuted ? 'is-muted' : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              <span className="vc-btn-icon">{isMuted ? '🔇' : '🎤'}</span>
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button
              className="vc-btn vc-btn--leave"
              onClick={leaveVoice}
              title="Leave voice channel"
            >
              <span className="vc-btn-icon">📵</span>
              Leave
            </button>
          </>
        )}
      </div>

      {/* Device selector (always visible so you can configure before joining) */}
      <DeviceSelector
        inputDevices={inputDevices}
        outputDevices={outputDevices}
        selectedInputId={selectedInputId}
        selectedOutputId={selectedOutputId}
        onInputChange={setSelectedInputId}
        onOutputChange={setSelectedOutputId}
      />
    </div>
  );
}