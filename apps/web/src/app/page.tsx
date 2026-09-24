'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import { ChannelControlStatus, DashboardStats, Tenant, User } from '../types';
import { ChannelSimulatorBar } from '../components/ChannelSimulatorBar';
import { EngineMonitor } from '../components/EngineMonitor';
import { TenantPortal } from '../components/TenantPortal';
import { UserPortal } from '../components/UserPortal';
import { ToastNotificationContainer } from '../components/ToastNotification';

type ActiveView = 'engine' | 'tenant' | 'user';

export default function DashboardPage() {
  const [activeView, setActiveView] = useState<ActiveView>('engine');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [channelStatus, setChannelStatus] = useState<ChannelControlStatus | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Global Simulated User Device State
  const [activeSimulatedUserId, setActiveSimulatedUserId] = useState<string>('');
  const [isDeviceOnline, setIsDeviceOnline] = useState<boolean>(true);

  // Floating toasts
  const [toasts, setToasts] = useState<
    { id: string; title: string; body: string; priority: string; channel: string }[]
  >([]);

  const addToast = useCallback((t: { title: string; body: string; priority: string; channel: string }) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [{ ...t, id }, ...prev.slice(0, 4)]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 5000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  };

  // 1. Fetch Dashboard Stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/stats');
      if (!res.ok) throw new Error(`Stats API error: ${res.status}`);
      const data = await res.json();
      setStats(data);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    }
  }, []);

  // 2. Fetch Channel Simulator Status
  const fetchChannelStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/channels/status');
      if (res.ok) {
        const data = await res.json();
        setChannelStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch channel status', err);
    }
  }, []);

  // 3. Fetch Tenants & Users
  const fetchTenantsAndUsers = useCallback(async () => {
    try {
      let tenantRes = await fetch('/api/tenants/overview');
      if (tenantRes.ok) {
        let tData = await tenantRes.json();
        if (tData.length === 0) {
          const seedRes = await fetch('/api/tenants/seed-demo', { method: 'POST' });
          if (seedRes.ok) {
            tData = await seedRes.json();
          }
        }
        setTenants(tData);
      }

      const usersRes = await fetch('/api/users/public-list');
      if (usersRes.ok) {
        const uData = await usersRes.json();
        setUsers(uData);
        if (uData.length > 0 && !activeSimulatedUserId) {
          setActiveSimulatedUserId(uData[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch tenants or users', err);
    }
  }, [activeSimulatedUserId]);

  // Initial data load
  useEffect(() => {
    Promise.all([fetchStats(), fetchChannelStatus(), fetchTenantsAndUsers()]).finally(() =>
      setLoading(false),
    );

    const timer = setInterval(() => {
      fetchStats();
      fetchChannelStatus();
    }, 5000);

    return () => clearInterval(timer);
  }, [fetchStats, fetchChannelStatus, fetchTenantsAndUsers]);

  // Global WebSocket listener for channel status changes and real-time dashboard updates
  useEffect(() => {
    const adminSocket = io('http://localhost:3001', {
      auth: { userId: 'admin-dashboard-monitor' },
      transports: ['websocket'],
    });

    adminSocket.on('channels:status-changed', (newStatus: ChannelControlStatus) => {
      setChannelStatus(newStatus);
    });

    adminSocket.on('dashboard:new-message', (msg: any) => {
      fetchStats();
    });

    return () => {
      adminSocket.disconnect();
    };
  }, [fetchStats]);

  // Persistent Simulated User Device WebSocket Connection
  // This keeps the user connected regardless of which tab you are looking at!
  useEffect(() => {
    if (!activeSimulatedUserId || !isDeviceOnline) return;

    const userSocket = io('http://localhost:3001', {
      auth: { userId: activeSimulatedUserId },
      transports: ['websocket'],
    });

    userSocket.on('connect', () => {
      console.log(`[Simulated Device] Connected for user: ${activeSimulatedUserId}`);
      fetchStats();
    });

    userSocket.on('notification', (payload: any) => {
      console.log('[Simulated Device] Push Notification received:', payload);
      addToast({
        title: payload.title,
        body: payload.body,
        priority: payload.priority,
        channel: 'push',
      });
      fetchStats();
    });

    userSocket.on('user:message', (payload: any) => {
      console.log('[Simulated Device] Mock Message received:', payload);
      addToast({
        title: payload.title,
        body: payload.body,
        priority: payload.priority,
        channel: payload.channel,
      });
      fetchStats();
    });

    return () => {
      userSocket.disconnect();
    };
  }, [activeSimulatedUserId, isDeviceOnline, addToast, fetchStats]);

  const handleManualNotificationSent = () => {
    fetchStats();
    fetchTenantsAndUsers();
  };

  const activeUser = users.find((u) => u.id === activeSimulatedUserId) || users[0];

  if (loading) {
    return (
      <div className="app">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="logo">
              <span>NX</span>
              <span className="logo-tag">Engine</span>
            </div>
          </div>
        </aside>
        <div className="main-wrapper">
          <main className="main">
            <div className="loading">
              <div className="loading-spinner" />
              <div className="loading-text">Connecting to NX notification engine...</div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Toast Alert Notifications */}
      <ToastNotificationContainer toasts={toasts} onDismiss={removeToast} />

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <span>NX</span>
            <span className="logo-tag">Engine</span>
          </div>
        </div>
        <nav className="sidebar-menu">
          <button
            className={`sidebar-item ${activeView === 'engine' ? 'active' : ''}`}
            onClick={() => setActiveView('engine')}
          >
            <span>📊</span> Engine Monitor
          </button>

          <button
            className={`sidebar-item ${activeView === 'tenant' ? 'active' : ''}`}
            onClick={() => setActiveView('tenant')}
          >
            <span>🚀</span> Tenant Dispatcher
          </button>

          <button
            className={`sidebar-item ${activeView === 'user' ? 'active' : ''}`}
            onClick={() => setActiveView('user')}
          >
            <span>📱</span> User Device &amp; Inboxes
          </button>
        </nav>
      </aside>

      <div className="main-wrapper">
        {/* Main Navbar */}
        <header className="header">
          <div className="header-left">
            <div className="logo-sub">Multi-Tenant Notification Platform &amp; Fallback Testbed</div>
          </div>

          <div className="header-right">
            <div className="ws-badge">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-sage)', display: 'inline-block' }} />
              <span>{stats?.websocket?.onlineUsers || 0} online</span>
            </div>
            <div className="live-badge">
              <div className="live-dot" />
              <span>SYSTEM HEALTHY</span>
            </div>
            {lastUpdated && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              className="btn-pill"
              style={{ marginLeft: 8 }}
              onClick={() => {
                fetchStats();
                fetchChannelStatus();
                fetchTenantsAndUsers();
              }}
            >
              🔄 Refresh
            </button>
          </div>
        </header>

        <main className="main">
          {error && (
            <div className="error-banner">
              ⚠️ {error} — Reconnecting to NX Engine...
            </div>
          )}

        {/* Channel Health & Outage Simulator Bar (Includes Persistent Simulated User Device) */}
        <ChannelSimulatorBar
          status={channelStatus}
          onStatusChange={(updated) => setChannelStatus(updated)}
          users={users}
          activeSimulatedUserId={activeSimulatedUserId}
          isDeviceOnline={isDeviceOnline}
          onUserDeviceChange={(userId) => setActiveSimulatedUserId(userId)}
          onToggleDeviceOnline={(online) => setIsDeviceOnline(online)}
        />

        {/* VIEW 1: Engine Monitor */}
        {activeView === 'engine' && stats && <EngineMonitor stats={stats} />}

        {/* VIEW 2: Tenant Dispatcher */}
        {activeView === 'tenant' && (
          <TenantPortal
            tenants={tenants}
            users={users}
            onNotificationSent={handleManualNotificationSent}
            recentNotifications={stats?.recentNotifications || []}
            activeSimulatedUserId={activeSimulatedUserId}
            onSelectRecipient={(userId) => setActiveSimulatedUserId(userId)}
          />
        )}

        {/* VIEW 3: User Client & Inboxes */}
        {activeView === 'user' && (
          <UserPortal
            users={users}
            activeUserId={activeSimulatedUserId}
            onActiveUserChange={(userId) => setActiveSimulatedUserId(userId)}
            isDeviceOnline={isDeviceOnline}
            onToggleDeviceOnline={(online) => setIsDeviceOnline(online)}
            onPreferencesUpdated={fetchTenantsAndUsers}
            onToast={addToast}
          />
        )}


        </main>
      </div>
    </div>
  );
}
