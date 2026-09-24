'use client';

import { useState, useEffect, useRef } from 'react';
import { User, MockMessage, Notification } from '../types';
import io, { Socket } from 'socket.io-client';

interface Props {
  users: User[];
  activeUserId?: string;
  onActiveUserChange?: (userId: string) => void;
  isDeviceOnline?: boolean;
  onToggleDeviceOnline?: (online: boolean) => void;
  onPreferencesUpdated: () => void;
  onToast: (toast: { title: string; body: string; priority: string; channel: string }) => void;
}

export function UserPortal({
  users,
  activeUserId,
  onActiveUserChange,
  isDeviceOnline = true,
  onToggleDeviceOnline,
  onPreferencesUpdated,
  onToast,
}: Props) {
  const [selectedUserId, setSelectedUserId] = useState<string>(activeUserId || '');
  const [activeTab, setActiveTab] = useState<'push' | 'email' | 'sms' | 'prefs'>('push');

  useEffect(() => {
    if (activeUserId && activeUserId !== selectedUserId) {
      setSelectedUserId(activeUserId);
    }
  }, [activeUserId, selectedUserId]);

  const [inboxNotifications, setInboxNotifications] = useState<Notification[]>([]);
  const [mockMessages, setMockMessages] = useState<MockMessage[]>([]);
  const [loading, setLoading] = useState(false);

  // Preference form state
  const [pushPref, setPushPref] = useState(true);
  const [emailPref, setEmailPref] = useState(true);
  const [smsPref, setSmsPref] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Email reader selection
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (users.length > 0 && !selectedUserId) {
      setSelectedUserId(users[0].id);
    }
  }, [users, selectedUserId]);

  const currentUser = users.find((u) => u.id === selectedUserId) || users[0];

  // Sync preference state when user changes
  useEffect(() => {
    if (currentUser?.preference) {
      setPushPref(currentUser.preference.pushEnabled);
      setEmailPref(currentUser.preference.emailEnabled);
      setSmsPref(currentUser.preference.smsEnabled);
    }
  }, [currentUser]);

  // Fetch user inbox
  const fetchInbox = async (userId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/users/${userId}/inbox`);
      if (res.ok) {
        const data = await res.json();
        setInboxNotifications(data.notifications || []);
        setMockMessages(data.mockMessages || []);
      }
    } catch (err) {
      console.error('Failed to load user inbox', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedUserId) {
      fetchInbox(selectedUserId);
    }
  }, [selectedUserId]);

  // WebSocket Connection Management
  useEffect(() => {
    if (!selectedUserId) return;

    if (isDeviceOnline) {
      // Connect to WebSocket gateway
      const socket = io('http://localhost:3001', {
        auth: { userId: selectedUserId },
        transports: ['websocket'],
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        console.log(`[WebSocket] User ${selectedUserId} connected`);
      });

      socket.on('notification', (payload: any) => {
        console.log('[WebSocket] Real-time Push Notification received:', payload);
        onToast({
          title: payload.title,
          body: payload.body,
          priority: payload.priority,
          channel: 'push',
        });
        fetchInbox(selectedUserId);
      });

      socket.on('user:message', (payload: MockMessage) => {
        console.log('[WebSocket] User Mock Message received:', payload);
        onToast({
          title: payload.title,
          body: payload.body,
          priority: payload.priority,
          channel: payload.channel,
        });
        fetchInbox(selectedUserId);
      });

      return () => {
        socket.disconnect();
      };
    } else {
      // If simulated offline, disconnect socket
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    }
  }, [selectedUserId, isDeviceOnline]);

  const handleSavePreferences = async () => {
    if (!selectedUserId) return;
    try {
      setSavingPrefs(true);
      const res = await fetch(`/api/users/${selectedUserId}/public-preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pushEnabled: pushPref,
          emailEnabled: emailPref,
          smsEnabled: smsPref,
        }),
      });
      if (res.ok) {
        alert('Preferences updated successfully!');
        onPreferencesUpdated();
      }
    } catch (err) {
      alert('Failed to update preferences');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleClearInbox = async () => {
    if (!selectedUserId) return;
    try {
      await fetch(`/api/channels/messages?userId=${selectedUserId}`, {
        method: 'DELETE',
      });
      fetchInbox(selectedUserId);
    } catch (err) {
      console.error(err);
    }
  };

  const emailMessages = mockMessages.filter((m) => m.channel === 'email');
  const smsMessages = mockMessages.filter((m) => m.channel === 'sms');
  const pushMessages = mockMessages.filter((m) => m.channel === 'push');

  const selectedEmail =
    emailMessages.find((m) => m.id === selectedEmailId) || emailMessages[0];

  return (
    <div className="user-view-container fade-in">
      {/* Left Column: User Device Controls & Profile */}
      <div className="user-profile-panel">
        <div className="user-status-card">
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Active User Device</label>
            <select
              className="form-select"
              value={selectedUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                onActiveUserChange?.(e.target.value);
              }}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.externalId} — {u.email}
                </option>
              ))}
            </select>
          </div>

          {currentUser && (
            <div>
              <div className="user-avatar-row">
                <div className="user-avatar">
                  {currentUser.externalId.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
                    {currentUser.externalId}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {currentUser.email}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {currentUser.phone}
                  </div>
                </div>
              </div>

              {/* Online / Offline Device Toggle */}
              <div className="device-connection-badge">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: isDeviceOnline ? 'var(--accent-sage)' : 'var(--accent-terracotta)',
                      boxShadow: isDeviceOnline ? '0 0 8px var(--accent-sage-border)' : 'none',
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {isDeviceOnline ? 'Device Online (WebSocket Connected)' : 'Device Offline (Disconnected)'}
                  </span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={isDeviceOnline}
                    onChange={(e) => onToggleDeviceOnline?.(e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>

              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                💡 <strong>Offline Queue + TTL:</strong> When Offline, notifications wait in RabbitMQ holding queue (<code>PENDING</code>). Toggle back <strong>Online</strong> within the TTL window to watch messages deliver instantly!
              </div>
            </div>
          )}
        </div>

        {/* Quick Preference Editor */}
        <div className="user-status-card">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span>Channel Preferences</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>User Settings</span>
          </div>

          <div className="pref-row">
            <span style={{ fontSize: 13 }}>🔔 Push Notifications</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={pushPref}
                onChange={(e) => setPushPref(e.target.checked)}
              />
              <span className="slider" />
            </label>
          </div>

          <div className="pref-row">
            <span style={{ fontSize: 13 }}>📧 Email Notifications</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={emailPref}
                onChange={(e) => setEmailPref(e.target.checked)}
              />
              <span className="slider" />
            </label>
          </div>

          <div className="pref-row">
            <span style={{ fontSize: 13 }}>💬 SMS Text Messages</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={smsPref}
                onChange={(e) => setSmsPref(e.target.checked)}
              />
              <span className="slider" />
            </label>
          </div>

          <button
            className="btn-send"
            style={{ marginTop: 14, padding: 10, fontSize: 13 }}
            onClick={handleSavePreferences}
            disabled={savingPrefs}
          >
            {savingPrefs ? 'Saving...' : '💾 Save Channel Preferences'}
          </button>
        </div>

        <button className="btn-pill danger" style={{ justifyContent: 'center' }} onClick={handleClearInbox}>
          🗑️ Clear User Inboxes
        </button>
      </div>

      {/* Right Column: Multi-Channel Inbox Suite */}
      <div className="inbox-container">
        <div className="inbox-header">
          <div className="inbox-nav-tabs">
            <button
              className={`inbox-nav-tab ${activeTab === 'push' ? 'active' : ''}`}
              onClick={() => setActiveTab('push')}
            >
              <span>🔔 Push Alerts</span>
              <span className="inbox-badge">{pushMessages.length}</span>
            </button>

            <button
              className={`inbox-nav-tab ${activeTab === 'email' ? 'active' : ''}`}
              onClick={() => setActiveTab('email')}
            >
              <span>📧 Mock Email</span>
              <span className="inbox-badge">{emailMessages.length}</span>
            </button>

            <button
              className={`inbox-nav-tab ${activeTab === 'sms' ? 'active' : ''}`}
              onClick={() => setActiveTab('sms')}
            >
              <span>💬 Mock SMS</span>
              <span className="inbox-badge">{smsMessages.length}</span>
            </button>
          </div>

          <button className="btn-pill" onClick={() => selectedUserId && fetchInbox(selectedUserId)}>
            🔄 Refresh Inbox
          </button>
        </div>

        {/* Tab 1: Push In-App Alerts */}
        {activeTab === 'push' && (
          <div className="push-feed">
            {pushMessages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔔</div>
                <div className="empty-state-text">
                  No push notifications arrived yet. Send one with Device Online!
                </div>
              </div>
            ) : (
              pushMessages.map((msg) => (
                <div key={msg.id} className="push-card fade-in">
                  <div className="push-card-header">
                    <span className="push-card-title">{msg.title}</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span className={`badge ${msg.priority}`}>{msg.priority}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  <div className="push-card-body">{msg.body}</div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Simulated Email Client */}
        {activeTab === 'email' && (
          <div className="email-client">
            <div className="email-list">
              {emailMessages.length === 0 ? (
                <div className="empty-state" style={{ padding: 40 }}>
                  <div className="empty-state-icon">📧</div>
                  <div className="empty-state-text">No emails in inbox</div>
                </div>
              ) : (
                emailMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`email-item ${selectedEmail?.id === msg.id ? 'active' : ''}`}
                    onClick={() => setSelectedEmailId(msg.id)}
                  >
                    <div className="email-item-from">noreply@nx.engine</div>
                    <div className="email-item-subject">{msg.title}</div>
                    <div className="email-item-preview">{msg.body}</div>
                  </div>
                ))
              )}
            </div>

            <div className="email-view">
              {selectedEmail ? (
                <>
                  <div className="email-view-header">
                    <div className="email-view-subject">{selectedEmail.title}</div>
                    <div className="email-meta-row">
                      <div>
                        <strong>From:</strong> NX Notification Service &lt;noreply@nx.engine&gt;
                      </div>
                      <div>{new Date(selectedEmail.timestamp).toLocaleString()}</div>
                    </div>
                    <div className="email-meta-row" style={{ marginTop: 4 }}>
                      <div>
                        <strong>To:</strong> {currentUser?.email}
                      </div>
                      <span className={`badge ${selectedEmail.priority}`}>
                        {selectedEmail.priority} priority
                      </span>
                    </div>
                  </div>

                    <div className="email-rendered-card">
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
                        {selectedEmail.title}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        {selectedEmail.body}
                      </div>
                      <hr style={{ margin: '18px 0', border: 'none', borderTop: '1px solid var(--border-subtle)' }} />
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Sent via NX Scalable Notification Engine</span>
                        <span>Delivered via Mock SES Channel</span>
                      </div>
                    </div>
                </>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">✉️</div>
                  <div className="empty-state-text">Select an email to view contents</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Simulated Smartphone SMS Screen */}
        {activeTab === 'sms' && (
          <div style={{ padding: 20 }}>
            <div className="sms-simulator">
              <div className="sms-phone-bar">
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                  9:41 AM
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  💬 +1 (800) NX-ALERT
                </span>
                <span style={{ fontSize: 11, color: 'var(--accent-sage)' }}>● 5G</span>
              </div>

              <div className="sms-messages-area">
                {smsMessages.length === 0 ? (
                  <div className="empty-state" style={{ marginTop: 100 }}>
                    <div className="empty-state-icon">📱</div>
                    <div className="empty-state-text">
                      No SMS received yet. Test fallback from Push/Email to see messages arrive!
                    </div>
                  </div>
                ) : (
                  smsMessages.map((msg) => (
                    <div key={msg.id} className="sms-bubble fade-in">
                      <div className="sms-bubble-title">[{msg.priority.toUpperCase()}] {msg.title}</div>
                      <div>{msg.body}</div>
                      <div className="sms-bubble-time">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
