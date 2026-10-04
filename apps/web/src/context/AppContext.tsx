'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import io, { Socket } from 'socket.io-client';
import {
  ChannelControlStatus,
  DashboardStats,
  Tenant,
  User,
} from '../types';

/* ─── Toast Types ─── */
export interface ToastItem {
  id: string;
  title: string;
  body: string;
  priority: string;
  channel: string;
}

/* ─── Context Shape ─── */
interface AppContextValue {
  stats: DashboardStats | null;
  channelStatus: ChannelControlStatus | null;
  setChannelStatus: (s: ChannelControlStatus) => void;
  tenants: Tenant[];
  users: User[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;

  // Simulated user device
  activeSimulatedUserId: string;
  setActiveSimulatedUserId: (id: string) => void;
  isDeviceOnline: boolean;
  setIsDeviceOnline: (online: boolean) => void;

  // Toasts
  toasts: ToastItem[];
  addToast: (t: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;

  // Refresh helpers
  fetchStats: () => Promise<void>;
  fetchChannelStatus: () => Promise<void>;
  fetchTenantsAndUsers: () => Promise<void>;
  refreshAll: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside <AppProvider>');
  return ctx;
}

/* ─── Provider ─── */
export function AppProvider({ children }: { children: ReactNode }) {
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
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback(
    (t: Omit<ToastItem, 'id'>) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [{ ...t, id }, ...prev.slice(0, 4)]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 5000);
    },
    [],
  );

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  };

  /* ── Data Fetchers ── */
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

  const refreshAll = useCallback(() => {
    fetchStats();
    fetchChannelStatus();
    fetchTenantsAndUsers();
  }, [fetchStats, fetchChannelStatus, fetchTenantsAndUsers]);

  /* ── Initial data load + polling ── */
  useEffect(() => {
    Promise.all([fetchStats(), fetchChannelStatus(), fetchTenantsAndUsers()]).finally(
      () => setLoading(false),
    );

    const timer = setInterval(() => {
      fetchStats();
      fetchChannelStatus();
    }, 5000);

    return () => clearInterval(timer);
  }, [fetchStats, fetchChannelStatus, fetchTenantsAndUsers]);

  /* ── Global Admin WebSocket (channel status + dashboard events) ── */
  useEffect(() => {
    const adminSocket = io('http://localhost:3001', {
      auth: { userId: 'admin-dashboard-monitor' },
      transports: ['websocket'],
    });

    adminSocket.on('channels:status-changed', (newStatus: ChannelControlStatus) => {
      setChannelStatus(newStatus);
    });

    adminSocket.on('dashboard:new-message', () => {
      fetchStats();
    });

    return () => {
      adminSocket.disconnect();
    };
  }, [fetchStats]);

  /* ── Persistent Simulated User Device WebSocket ── */
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
      // Skip push mock messages to avoid duplicate toasts (handled by 'notification' event)
      if (payload.channel === 'push') return;
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

  return (
    <AppContext.Provider
      value={{
        stats,
        channelStatus,
        setChannelStatus,
        tenants,
        users,
        loading,
        error,
        lastUpdated,
        activeSimulatedUserId,
        setActiveSimulatedUserId,
        isDeviceOnline,
        setIsDeviceOnline,
        toasts,
        addToast,
        removeToast,
        fetchStats,
        fetchChannelStatus,
        fetchTenantsAndUsers,
        refreshAll,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
