'use client';

import { useState } from 'react';
import { ChannelControlStatus, Channel, User } from '../types';

interface Props {
  status: ChannelControlStatus | null;
  onStatusChange: (newStatus: ChannelControlStatus) => void;
  users: User[];
  activeSimulatedUserId: string;
  isDeviceOnline: boolean;
  onUserDeviceChange: (userId: string) => void;
  onToggleDeviceOnline: (online: boolean) => void;
}

export function ChannelSimulatorBar({
  status,
  onStatusChange,
  users,
  activeSimulatedUserId,
  isDeviceOnline,
  onUserDeviceChange,
  onToggleDeviceOnline,
}: Props) {
  const [loading, setLoading] = useState(false);

  if (!status) return null;

  const handleToggle = async (channel: Channel, currentState: boolean) => {
    try {
      setLoading(true);
      const res = await fetch('/api/channels/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, enabled: !currentState }),
      });
      if (res.ok) {
        const updated = await res.json();
        onStatusChange(updated);
      }
    } catch (err) {
      console.error('Failed to toggle channel', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFastFallback = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/channels/fast-fallback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !status.fastFallback }),
      });
      if (res.ok) {
        const updated = await res.json();
        onStatusChange(updated);
      }
    } catch (err) {
      console.error('Failed to toggle fast fallback', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSetTimeoutSeconds = async (seconds: number) => {
    try {
      setLoading(true);
      const res = await fetch('/api/channels/fast-fallback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true, waitSeconds: seconds }),
      });
      if (res.ok) {
        const updated = await res.json();
        onStatusChange(updated);
      }
    } catch (err) {
      console.error('Failed to set timeout seconds', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/channels/reset', { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        onStatusChange(updated);
      }
    } catch (err) {
      console.error('Failed to reset channels', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateOutage = async () => {
    try {
      setLoading(true);
      // Disable Push and Email, keeping SMS active to test complete fallback
      await fetch('/api/channels/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'push', enabled: false }),
      });
      const res = await fetch('/api/channels/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'email', enabled: false }),
      });
      if (res.ok) {
        const updated = await res.json();
        onStatusChange(updated);
      }
    } catch (err) {
      console.error('Failed to simulate outage', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOnlyPush = async () => {
    try {
      setLoading(true);
      // Enable Push, disable Email and SMS
      await fetch('/api/channels/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'push', enabled: true }),
      });
      await fetch('/api/channels/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'email', enabled: false }),
      });
      const res = await fetch('/api/channels/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'sms', enabled: false }),
      });
      if (res.ok) {
        const updated = await res.json();
        onStatusChange(updated);
      }
    } catch (err) {
      console.error('Failed to set only push', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMockMode = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/channels/mock-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !status.mockMode }),
      });
      if (res.ok) {
        const updated = await res.json();
        onStatusChange(updated);
      }
    } catch (err) {
      console.error('Failed to toggle mock mode', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="simulator-bar">
      <div className="simulator-header">
        <div>
          <div className="simulator-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 14 }}>🛠️ Channel Simulation &amp; Test Controller</span>
            <button
              className={`btn-pill ${status.mockMode ? 'fast-mode active' : 'danger'}`}
              onClick={handleToggleMockMode}
              disabled={loading}
              title="Toggle between Testing (Mock) and Production (Real API) environments"
              style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 20 }}
            >
              {status.mockMode ? '🧪 TESTING MODE' : '🚀 PROD MODE'}
            </button>
          </div>
          <div className="simulator-desc">
            Simulate provider outages, test sequential fallback chains, and switch environments.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn-pill"
            onClick={handleOnlyPush}
            title="Enables Push and disables Email and SMS"
          >
            🎯 Only Push
          </button>
          <button
            className="btn-pill danger"
            onClick={handleSimulateOutage}
            title="Disables Push & Email to trigger SMS fallback"
          >
            💥 Outage: P+E Down
          </button>
          <button
            className="btn-pill"
            onClick={handleReset}
            title="Restores all channels to healthy online state"
          >
            🔄 Reset Normal
          </button>
        </div>
      </div>

      <div className="simulator-groups">
        {/* Section 1: Provider Outage Toggles */}
        <div className="sim-group">
          <span className="sim-group-label">Providers</span>
          <div className="simulator-toggles">
            {/* Push */}
            <div className={`channel-toggle-card ${!status.push ? 'disabled' : ''}`}>
              <div className="channel-name">
                <span>Push</span>
                <span className={`channel-status-pill ${status.push ? 'online' : 'offline'}`}>
                  {status.push ? 'ONLINE' : 'DOWN'}
                </span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={status.push}
                  disabled={loading}
                  onChange={() => handleToggle('push', status.push)}
                />
                <span className="slider" />
              </label>
            </div>

            {/* Email */}
            <div className={`channel-toggle-card ${!status.email ? 'disabled' : ''}`}>
              <div className="channel-name">
                <span>Email</span>
                <span className={`channel-status-pill ${status.email ? 'online' : 'offline'}`}>
                  {status.email ? 'ONLINE' : 'DOWN'}
                </span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={status.email}
                  disabled={loading}
                  onChange={() => handleToggle('email', status.email)}
                />
                <span className="slider" />
              </label>
            </div>

            {/* SMS */}
            <div className={`channel-toggle-card ${!status.sms ? 'disabled' : ''}`}>
              <div className="channel-name">
                <span>SMS</span>
                <span className={`channel-status-pill ${status.sms ? 'online' : 'offline'}`}>
                  {status.sms ? 'ONLINE' : 'DOWN'}
                </span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={status.sms}
                  disabled={loading}
                  onChange={() => handleToggle('sms', status.sms)}
                />
                <span className="slider" />
              </label>
            </div>
          </div>
        </div>

        {/* Section 2: Active User Device Toggle */}
        <div className="sim-group">
          <span className="sim-group-label">Recipient Client</span>
          <div className="channel-toggle-card">
            <div className="channel-name">
              <span>📱</span>
              <select
                style={{
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: 12,
                  outline: 'none',
                  cursor: 'pointer',
                  maxWidth: 120,
                }}
                value={activeSimulatedUserId}
                onChange={(e) => onUserDeviceChange(e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id} style={{ background: '#1c1d22', color: '#f2f0eb' }}>
                    {u.externalId}
                  </option>
                ))}
              </select>
              <span className={`channel-status-pill ${isDeviceOnline ? 'online' : 'offline'}`}>
                {isDeviceOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={isDeviceOnline}
                onChange={(e) => onToggleDeviceOnline(e.target.checked)}
              />
              <span className="slider" />
            </label>
          </div>
        </div>

        {/* Section 3: Offline Queue TTL Config */}
        <div className="sim-group" style={{ justifyContent: 'flex-end' }}>
          <span className="sim-group-label">Offline TTL</span>
          <div
            className="btn-pill fast-mode active"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px' }}
          >
            <select
              value={status.offlineWaitSeconds}
              onChange={(e) => handleSetTimeoutSeconds(Number(e.target.value))}
              style={{
                background: 'transparent',
                color: 'var(--accent-ochre)',
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value={5} style={{ background: '#1c1d22', color: '#f2f0eb' }}>5s (Fast test)</option>
              <option value={15} style={{ background: '#1c1d22', color: '#f2f0eb' }}>15s (Standard)</option>
              <option value={30} style={{ background: '#1c1d22', color: '#f2f0eb' }}>30s (Extended)</option>
              <option value={60} style={{ background: '#1c1d22', color: '#f2f0eb' }}>60s (1 min)</option>
              <option value={180} style={{ background: '#1c1d22', color: '#f2f0eb' }}>180s (3 min prod)</option>
            </select>
          </div>

          <button
            className={`btn-pill ${status.fastFallback ? 'fast-mode active' : ''}`}
            onClick={handleFastFallback}
            title="Toggle fast fallback vs production wait"
          >
            <span>⚡ Mode: {status.fastFallback ? 'TEST' : 'PROD'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
