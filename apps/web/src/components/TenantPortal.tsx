'use client';

import { useState, useEffect } from 'react';
import { Tenant, User, Priority, Notification } from '../types';

interface Props {
  tenants: Tenant[];
  users: User[];
  onNotificationSent: () => void;
  recentNotifications: Notification[];
  activeSimulatedUserId?: string;
  onSelectRecipient?: (userId: string) => void;
}

export function TenantPortal({
  tenants,
  users,
  onNotificationSent,
  recentNotifications,
  activeSimulatedUserId,
  onSelectRecipient,
}: Props) {
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>(activeSimulatedUserId || '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Priority>('high');
  const [metadataJson, setMetadataJson] = useState('{"source": "tenant_dashboard"}');
  const [sending, setSending] = useState(false);
  const [sendSuccessMessage, setSendSuccessMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Initialize selected tenant and user
  useEffect(() => {
    if (tenants.length > 0 && !selectedTenantId) {
      setSelectedTenantId(tenants[0].id);
    }
  }, [tenants, selectedTenantId]);

  const currentTenant = tenants.find((t) => t.id === selectedTenantId) || tenants[0];
  const tenantUsers = users.filter((u) => u.tenantId === currentTenant?.id);

  // Initialize or update selected user when tenant changes
  useEffect(() => {
    if (tenantUsers.length > 0) {
      if (!selectedUserId || !tenantUsers.find((u) => u.id === selectedUserId)) {
        setSelectedUserId(tenantUsers[0].id);
        onSelectRecipient?.(tenantUsers[0].id);
      }
    } else {
      setSelectedUserId('');
      onSelectRecipient?.('');
    }
  }, [tenantUsers, selectedUserId, onSelectRecipient]);

  const currentUser = tenantUsers.find((u) => u.id === selectedUserId) || tenantUsers[0];

  const handleCopyKey = () => {
    if (currentTenant?.apiKey) {
      navigator.clipboard.writeText(currentTenant.apiKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const applyPreset = (presetPriority: Priority, presetTitle: string, presetBody: string) => {
    setPriority(presetPriority);
    setTitle(presetTitle);
    setBody(presetBody);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant?.apiKey || !selectedUserId || !title || !body) return;

    try {
      setSending(true);
      setSendSuccessMessage(null);

      let parsedData: any = null;
      try {
        if (metadataJson.trim()) {
          parsedData = JSON.parse(metadataJson);
        }
      } catch (err) {
        alert('Invalid JSON in metadata field');
        setSending(false);
        return;
      }

      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': currentTenant.apiKey,
        },
        body: JSON.stringify({
          userId: selectedUserId,
          priority,
          title,
          body,
          data: parsedData,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to dispatch notification');
      }

      const data = await res.json();
      setSendSuccessMessage(`✅ Queued successfully! ID: ${data.notification?.id?.slice(0, 8)}...`);
      onNotificationSent();

      // Clear alert message after 4s
      setTimeout(() => setSendSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(`Error sending notification: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="tenant-grid fade-in">
      {/* Left Column: Notification Dispatch Studio */}
      <div className="panel">
        <div className="panel-title">
          <span className="icon">🚀</span>
          <span>Tenant Dispatch Studio</span>
        </div>

        {/* Tenant Workspace Selector & Key */}
        <div className="form-group">
          <label className="form-label">Active Tenant Workspace</label>
          <select
            className="form-select"
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.description || 'Tenant'})
              </option>
            ))}
          </select>
        </div>

        {currentTenant?.apiKey && (
          <div className="tenant-key-box">
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                TENANT API KEY (x-api-key)
              </div>
              <div className="tenant-key-text">{currentTenant.apiKey}</div>
            </div>
            <button className="btn-pill" onClick={handleCopyKey}>
              {copiedKey ? '✓ Copied' : 'Copy Key'}
            </button>
          </div>
        )}

        {/* Quick Test Presets */}
        <div style={{ marginBottom: 16 }}>
          <div className="form-label">🧪 Quick Test Scenarios</div>
          <div className="presets-container">
            <button
              type="button"
              className="preset-btn"
              onClick={() =>
                applyPreset(
                  'high',
                  'Order #8921 Shipped',
                  'Your package is in transit! Tests Push -> Email -> SMS Fallback chain.',
                )
              }
            >
              <span className="preset-title">⚡ High Priority Order</span>
              <span className="preset-subtitle">Sequential: Push ➔ Email ➔ SMS</span>
            </button>

            <button
              type="button"
              className="preset-btn"
              onClick={() =>
                applyPreset(
                  'important',
                  '🚨 Security Alert: Unusual Login',
                  'Critical security event detected. Dispatches to ALL channels in parallel.',
                )
              }
            >
              <span className="preset-title">🚨 Important Alert</span>
              <span className="preset-subtitle">Parallel: Push ∥ Email ∥ SMS</span>
            </button>

            <button
              type="button"
              className="preset-btn"
              onClick={() =>
                applyPreset(
                  'medium',
                  'Weekly Performance Digest',
                  'Your weekly performance summary is ready. Push ➔ Email only (no SMS).',
                )
              }
            >
              <span className="preset-title">📰 Medium Digest</span>
              <span className="preset-subtitle">Push ➔ Email (SMS forbidden)</span>
            </button>

            <button
              type="button"
              className="preset-btn"
              onClick={() =>
                applyPreset(
                  'low',
                  '💡 Pro Tip: Optimize Workflows',
                  'Low priority tip. Uses first eligible channel only, zero fallbacks.',
                )
              }
            >
              <span className="preset-title">💡 Low Priority Tip</span>
              <span className="preset-subtitle">Single channel (no fallback)</span>
            </button>
          </div>
        </div>

        {/* Send Notification Form */}
        <form onSubmit={handleSend}>
          <div className="form-group">
            <label className="form-label">Recipient User</label>
            <select
              className="form-select"
              value={selectedUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                onSelectRecipient?.(e.target.value);
              }}
            >
              {tenantUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.externalId} — {u.email} ({u.phone})
                </option>
              ))}
            </select>
            {currentUser && (
              <div style={{ marginTop: 8, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <div>
                  Channels:{' '}
                  <span style={{ color: currentUser.preference?.pushEnabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    Push {currentUser.preference?.pushEnabled ? '✓' : '✗'}
                  </span>{' '}
                  ·{' '}
                  <span style={{ color: currentUser.preference?.emailEnabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    Email {currentUser.preference?.emailEnabled ? '✓' : '✗'}
                  </span>{' '}
                  ·{' '}
                  <span style={{ color: currentUser.preference?.smsEnabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    SMS {currentUser.preference?.smsEnabled ? '✓' : '✗'}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700 }}>
                  {activeSimulatedUserId === currentUser.id ? (
                    <span style={{ color: 'var(--accent-sage)' }}>● User Device Connected to WebSocket</span>
                  ) : (
                    <button
                      type="button"
                      className="btn-pill"
                      style={{ padding: '3px 8px', fontSize: 11 }}
                      onClick={() => onSelectRecipient?.(currentUser.id)}
                    >
                      Connect this user's socket
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Priority</label>
            <select
              className="form-select"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              <option value="important">Important (RabbitMQ Priority 4 - Parallel All Channels)</option>
              <option value="high">High (RabbitMQ Priority 3 - Fallback Chain: Push ➔ Email ➔ SMS)</option>
              <option value="medium">Medium (RabbitMQ Priority 2 - Push ➔ Email only, no SMS)</option>
              <option value="low">Low (RabbitMQ Priority 1 - Single channel, no fallback)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Notification Title</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Your verification code is 4821"
              value={title}
              required
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Message Body</label>
            <textarea
              className="form-textarea"
              placeholder="e.g. Do not share this code with anyone."
              value={body}
              required
              rows={3}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Custom Payload Data (JSON)</label>
            <input
              type="text"
              className="form-input"
              style={{ fontFamily: 'monospace', fontSize: 13 }}
              value={metadataJson}
              onChange={(e) => setMetadataJson(e.target.value)}
            />
          </div>

          {sendSuccessMessage && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-sage-bg)',
                color: 'var(--accent-sage)',
                border: '1px solid var(--accent-sage-border)',
                marginBottom: 16,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {sendSuccessMessage}
            </div>
          )}

          <button type="submit" className="btn-send" disabled={sending}>
            {sending ? 'Queueing in RabbitMQ...' : 'Dispatch Notification via NX Engine'}
          </button>
        </form>
      </div>

      {/* Right Column: Live Sent Feed & Fallback Tracing */}
      <div className="panel">
        <div className="panel-title">
          <span className="icon">📋</span>
          <span>Live Tenant Dispatch Log &amp; Fallback Journey</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {recentNotifications.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📬</div>
              <div className="empty-state-text">No notifications dispatched yet.</div>
            </div>
          ) : (
            recentNotifications.slice(0, 10).map((n) => {
              const attempts = n.deliveryAttempts || [];
              return (
                <div
                  key={n.id}
                  style={{
                    background: 'var(--bg-inset)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: 14,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                      {n.title}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span className={`badge ${n.priority}`}>{n.priority}</span>
                      <span className={`badge ${n.status}`}>{n.status}</span>
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                    {n.body}
                  </div>

                  {/* Fallback chain visualizer */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                      Delivery &amp; Fallback Trace:
                    </div>
                    {attempts.length === 0 ? (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Waiting in RabbitMQ queue...
                      </span>
                    ) : (
                      <div className="fallback-chain-container">
                        {attempts.map((att, idx) => (
                          <div key={att.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <div className={`attempt-pill ${att.status}`}>
                              <span>
                                {att.channel === 'push' ? '🔔' : att.channel === 'email' ? '📧' : '💬'}{' '}
                                {att.channel.toUpperCase()} (Try #{att.attemptNumber})
                              </span>
                              <span>
                                {att.status === 'success' ? '✓' : att.status === 'failed' ? '✗' : '⏳'}
                              </span>
                            </div>
                            {idx < attempts.length - 1 && <span className="attempt-arrow">➔</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
