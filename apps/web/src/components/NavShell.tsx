'use client';

import { usePathname } from 'next/navigation';
import { useAppContext } from '../context/AppContext';
import { ToastNotificationContainer } from './ToastNotification';
import { ChannelSimulatorBar } from './ChannelSimulatorBar';

interface Props {
  children: React.ReactNode;
}

export function NavShell({ children }: Props) {
  const pathname = usePathname();
  const {
    stats,
    channelStatus,
    setChannelStatus,
    users,
    activeSimulatedUserId,
    setActiveSimulatedUserId,
    isDeviceOnline,
    setIsDeviceOnline,
    lastUpdated,
    loading,
    error,
    toasts,
    removeToast,
    refreshAll,
  } = useAppContext();

  const currentPageLabel =
    pathname === '/tenant'
      ? 'Tenant Portal'
      : pathname === '/user'
        ? 'User Device & Inboxes'
        : 'Engine Monitor';

  const currentPageIcon =
    pathname === '/tenant' ? '🚀' : pathname === '/user' ? '📱' : '📊';

  if (loading) {
    return (
      <div className="app-no-sidebar">
        <header className="header">
          <div className="header-left">
            <div className="logo">
              <span>NX</span>
              <span className="logo-tag">Engine</span>
            </div>
            <div className="header-divider" />
            <div className="header-page-label">
              <span>{currentPageIcon}</span>
              <span>{currentPageLabel}</span>
            </div>
          </div>
        </header>
        <main className="main">
          <div className="loading">
            <div className="loading-spinner" />
            <div className="loading-text">Connecting to NX notification engine...</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-no-sidebar">
      {/* Toast Alert Notifications — User dashboard only */}
      {pathname === '/user' && <ToastNotificationContainer toasts={toasts} onDismiss={removeToast} />}

      {/* Top Header — Logo + Page Label + Status */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span>NX</span>
            <span className="logo-tag">Engine</span>
          </div>
          <div className="header-divider" />
          <div className="header-page-label">
            <span>{currentPageIcon}</span>
            <span>{currentPageLabel}</span>
          </div>
        </div>

        <div className="header-right">
          <div className="ws-badge">
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--accent-sage)',
                display: 'inline-block',
              }}
            />
            <span>{stats?.websocket?.onlineUsers || 0} online</span>
          </div>
          <div className="live-badge">
            <div className="live-dot" />
            <span>SYSTEM HEALTHY</span>
          </div>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Updated{' '}
              {lastUpdated.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          <button className="btn-pill" style={{ marginLeft: 8 }} onClick={refreshAll}>
            🔄 Refresh
          </button>
        </div>
      </header>

      <main className="main">
        {error && (
          <div className="error-banner">⚠️ {error} — Reconnecting to NX Engine...</div>
        )}

        {/* Channel Health & Outage Simulator Bar — Engine dashboard only */}
        {pathname === '/' && (
          <ChannelSimulatorBar
            status={channelStatus}
            onStatusChange={(updated) => setChannelStatus(updated)}
            users={users}
            activeSimulatedUserId={activeSimulatedUserId}
            isDeviceOnline={isDeviceOnline}
            onUserDeviceChange={(userId) => setActiveSimulatedUserId(userId)}
            onToggleDeviceOnline={(online) => setIsDeviceOnline(online)}
          />
        )}

        {children}
      </main>
    </div>
  );
}
