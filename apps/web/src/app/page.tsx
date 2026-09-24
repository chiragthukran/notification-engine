'use client';

import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api/dashboard';

interface DashboardStats {
  total: number;
  statusCounts: Record<string, number>;
  priorityCounts: Record<string, number>;
  channelCounts: Record<string, number>;
  retryStats: {
    totalAttempts: number;
    successCount: number;
    failedCount: number;
    retriesCount: number;
    fallbackCount: number;
    successRate: number;
  };
  recentNotifications: any[];
  hourlyActivity: any[];
  websocket: {
    onlineUsers: number;
  };
}

const REFRESH_INTERVAL = 10_000; // 10 seconds

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      setStats(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="app">
        <Header onlineUsers={0} lastUpdated={null} />
        <main className="main">
          <div className="loading">
            <div className="loading-spinner" />
            <div className="loading-text">Connecting to NX engine...</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        onlineUsers={stats?.websocket?.onlineUsers || 0}
        lastUpdated={lastUpdated}
      />
      <main className="main">
        {error && (
          <div className="error-banner">
            ⚠️ {error} — Dashboard will retry automatically
          </div>
        )}

        {stats && (
          <>
            {/* Stats Cards */}
            <div className="stats-grid fade-in">
              <StatCard label="Total" value={stats.total} variant="total" />
              <StatCard label="Queued" value={stats.statusCounts.queued} variant="queued" />
              <StatCard label="Processing" value={stats.statusCounts.processing} variant="processing" />
              <StatCard label="Delivered" value={stats.statusCounts.delivered} variant="delivered" />
              <StatCard label="Failed" value={stats.statusCounts.failed} variant="failed" />
              <StatCard label="Pending" value={stats.statusCounts.pending} variant="pending" />
              <StatCard label="Skipped" value={stats.statusCounts.skipped} variant="skipped" />
            </div>

            {/* Charts Grid */}
            <div className="dashboard-grid">
              {/* Priority Breakdown */}
              <div className="panel fade-in fade-in-delay-1">
                <div className="panel-title">
                  <span className="icon">⚡</span>
                  Priority Breakdown
                </div>
                <BarChart
                  data={[
                    { label: 'Important', value: stats.priorityCounts.important, variant: 'important' },
                    { label: 'High', value: stats.priorityCounts.high, variant: 'high' },
                    { label: 'Medium', value: stats.priorityCounts.medium, variant: 'medium' },
                    { label: 'Low', value: stats.priorityCounts.low, variant: 'low' },
                  ]}
                />
              </div>

              {/* Channel Distribution */}
              <div className="panel fade-in fade-in-delay-2">
                <div className="panel-title">
                  <span className="icon">📡</span>
                  Channel Distribution
                </div>
                <BarChart
                  data={[
                    { label: 'Push', value: stats.channelCounts.push, variant: 'push' },
                    { label: 'Email', value: stats.channelCounts.email, variant: 'email' },
                    { label: 'SMS', value: stats.channelCounts.sms, variant: 'sms' },
                  ]}
                />
              </div>

              {/* Retry & Fallback Activity */}
              <div className="panel fade-in fade-in-delay-3">
                <div className="panel-title">
                  <span className="icon">🔄</span>
                  Retry & Fallback Activity
                </div>
                <RetryStats stats={stats.retryStats} />
              </div>

              {/* Delivery Success Rate */}
              <div className="panel fade-in fade-in-delay-4">
                <div className="panel-title">
                  <span className="icon">🎯</span>
                  Delivery Performance
                </div>
                <DeliveryPerformance stats={stats.retryStats} statusCounts={stats.statusCounts} total={stats.total} />
              </div>

              {/* Recent Notifications */}
              <div className="panel table-panel fade-in">
                <div className="panel-title">
                  <span className="icon">📋</span>
                  Recent Notifications
                </div>
                <NotificationsTable notifications={stats.recentNotifications} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════ */

function Header({ onlineUsers, lastUpdated }: { onlineUsers: number; lastUpdated: Date | null }) {
  return (
    <header className="header">
      <div className="header-left">
        <div>
          <div className="logo">NX</div>
          <div className="logo-sub">Notification Engine</div>
        </div>
      </div>
      <div className="header-right">
        <div className="ws-badge">
          🔌 {onlineUsers} online
        </div>
        <div className="live-badge">
          <div className="live-dot" />
          LIVE
        </div>
        {lastUpdated && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>
    </header>
  );
}

function StatCard({ label, value, variant }: { label: string; value: number; variant: string }) {
  return (
    <div className={`stat-card ${variant}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{(value || 0).toLocaleString()}</div>
    </div>
  );
}

function BarChart({ data }: { data: { label: string; value: number; variant: string }[] }) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="bar-chart">
      {data.map((item) => (
        <div className="bar-row" key={item.label}>
          <div className="bar-label">{item.label}</div>
          <div className="bar-track">
            <div
              className={`bar-fill ${item.variant}`}
              style={{ width: `${(item.value / maxValue) * 100}%` }}
            />
          </div>
          <div className="bar-count">{item.value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

function RetryStats({ stats }: { stats: DashboardStats['retryStats'] }) {
  return (
    <div>
      <div className="retry-grid">
        <div className="retry-stat">
          <div className="retry-stat-value">{stats.totalAttempts.toLocaleString()}</div>
          <div className="retry-stat-label">Total Attempts</div>
        </div>
        <div className="retry-stat">
          <div className="retry-stat-value">{stats.retriesCount.toLocaleString()}</div>
          <div className="retry-stat-label">Retries</div>
        </div>
        <div className="retry-stat">
          <div className="retry-stat-value">{stats.fallbackCount.toLocaleString()}</div>
          <div className="retry-stat-label">Fallbacks</div>
        </div>
      </div>
      <div className="success-rate" style={{ marginTop: 20 }}>
        <div>
          <div className="success-rate-label">Attempt Success Rate</div>
        </div>
        <div className="success-rate-value">{stats.successRate}%</div>
      </div>
      <div className="success-rate-bar">
        <div className="success-rate-fill" style={{ width: `${stats.successRate}%` }} />
      </div>
    </div>
  );
}

function DeliveryPerformance({
  stats,
  statusCounts,
  total,
}: {
  stats: DashboardStats['retryStats'];
  statusCounts: Record<string, number>;
  total: number;
}) {
  const deliveryRate = total > 0 ? Math.round((statusCounts.delivered / total) * 100) : 0;

  return (
    <div>
      <div className="retry-grid">
        <div className="retry-stat">
          <div className="retry-stat-value" style={{ color: 'var(--accent-emerald)' }}>
            {statusCounts.delivered?.toLocaleString() || 0}
          </div>
          <div className="retry-stat-label">Delivered</div>
        </div>
        <div className="retry-stat">
          <div className="retry-stat-value" style={{ color: 'var(--accent-rose)' }}>
            {statusCounts.failed?.toLocaleString() || 0}
          </div>
          <div className="retry-stat-label">Failed</div>
        </div>
        <div className="retry-stat">
          <div className="retry-stat-value" style={{ color: 'var(--accent-cyan)' }}>
            {statusCounts.pending?.toLocaleString() || 0}
          </div>
          <div className="retry-stat-label">Pending</div>
        </div>
      </div>
      <div className="success-rate" style={{ marginTop: 20 }}>
        <div>
          <div className="success-rate-label">Delivery Rate</div>
        </div>
        <div className="success-rate-value">{deliveryRate}%</div>
      </div>
      <div className="success-rate-bar">
        <div className="success-rate-fill" style={{ width: `${deliveryRate}%` }} />
      </div>
    </div>
  );
}

function NotificationsTable({ notifications }: { notifications: any[] }) {
  if (!notifications || notifications.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📭</div>
        <div className="empty-state-text">
          No notifications yet. Send one via the API to see it here.
        </div>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Channels</th>
            <th>User</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {notifications.slice(0, 30).map((n) => (
            <tr key={n.id}>
              <td>
                <span className="notification-id">
                  {n.id.substring(0, 8)}...
                </span>
              </td>
              <td>
                <span className="notification-title">{n.title}</span>
              </td>
              <td>
                <span className={`badge ${n.priority}`}>
                  <span className="badge-dot" />
                  {n.priority}
                </span>
              </td>
              <td>
                <span className={`badge ${n.status}`}>
                  <span className="badge-dot" />
                  {n.status}
                </span>
              </td>
              <td>
                {n.deliveryAttempts && n.deliveryAttempts.length > 0 ? (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {[...new Set(n.deliveryAttempts.map((a: any) => a.channel))].map(
                      (ch: string) => (
                        <span key={ch} className={`badge ${ch}`}>
                          {ch}
                        </span>
                      ),
                    )}
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </td>
              <td>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {n.user?.externalId || n.userId?.substring(0, 8)}
                </span>
              </td>
              <td>
                <span className="timestamp">
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
