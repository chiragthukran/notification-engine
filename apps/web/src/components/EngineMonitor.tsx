'use client';

import { useState } from 'react';
import { DashboardStats, Notification } from '../types';

interface Props {
  stats: DashboardStats;
}

export function EngineMonitor({ stats }: Props) {
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const {
    total,
    statusCounts,
    priorityCounts,
    channelCounts,
    retryStats,
    recentNotifications,
  } = stats;

  const maxPriority = Math.max(...Object.values(priorityCounts), 1);
  const maxChannel = Math.max(...Object.values(channelCounts), 1);

  const filteredNotifications = recentNotifications.filter((n) => {
    if (filterPriority !== 'all' && n.priority !== filterPriority) return false;
    if (filterStatus !== 'all' && n.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="fade-in">
      {/* Top Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card total">
          <div className="stat-label">Total Notifications</div>
          <div className="stat-value">{total}</div>
        </div>

        <div className="stat-card delivered">
          <div className="stat-label">Delivered</div>
          <div className="stat-value">{statusCounts.delivered || 0}</div>
        </div>

        <div className="stat-card processing">
          <div className="stat-label">Processing</div>
          <div className="stat-value">{statusCounts.processing || 0}</div>
        </div>

        <div className="stat-card queued">
          <div className="stat-label">Queued</div>
          <div className="stat-value">{statusCounts.queued || 0}</div>
        </div>

        <div className="stat-card failed">
          <div className="stat-label">Failed</div>
          <div className="stat-value">{statusCounts.failed || 0}</div>
        </div>

        <div className="stat-card pending">
          <div className="stat-label">Pending (Offline)</div>
          <div className="stat-value">{statusCounts.pending || 0}</div>
        </div>
      </div>

      {/* Grid: Charts + Retry & Fallbacks */}
      <div className="dashboard-grid">
        {/* Priority Distribution */}
        <div className="panel">
          <div className="panel-title">
            <span className="icon">🎯</span>
            <span>Priority Queue Distribution</span>
          </div>
          <div className="bar-chart">
            {(['important', 'high', 'medium', 'low'] as const).map((p) => {
              const count = priorityCounts[p] || 0;
              const pct = Math.round((count / maxPriority) * 100);
              return (
                <div key={p} className="bar-row">
                  <div className="bar-label">{p}</div>
                  <div className="bar-track">
                    <div className={`bar-fill ${p}`} style={{ width: `${Math.max(pct, 4)}%` }} />
                  </div>
                  <div className="bar-count">{count}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Channel Deliveries */}
        <div className="panel">
          <div className="panel-title">
            <span className="icon">📡</span>
            <span>Channel Delivery Volume</span>
          </div>
          <div className="bar-chart">
            {(['push', 'email', 'sms'] as const).map((ch) => {
              const count = channelCounts[ch] || 0;
              const pct = Math.round((count / maxChannel) * 100);
              return (
                <div key={ch} className="bar-row">
                  <div className="bar-label">{ch}</div>
                  <div className="bar-track">
                    <div className={`bar-fill ${ch}`} style={{ width: `${Math.max(pct, 4)}%` }} />
                  </div>
                  <div className="bar-count">{count}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Retry & Fallback Performance */}
        <div className="panel">
          <div className="panel-title">
            <span className="icon">🔄</span>
            <span>Delivery &amp; Fallback Performance</span>
          </div>
          <div className="retry-grid">
            <div className="retry-stat">
              <div className="retry-stat-value">{retryStats.totalAttempts}</div>
              <div className="retry-stat-label">Total Attempts</div>
            </div>
            <div className="retry-stat">
              <div className="retry-stat-value" style={{ color: 'var(--accent-sage)' }}>
                {retryStats.successCount}
              </div>
              <div className="retry-stat-label">Successful</div>
            </div>
            <div className="retry-stat">
              <div className="retry-stat-value" style={{ color: 'var(--accent-ochre)' }}>
                {retryStats.fallbackCount}
              </div>
              <div className="retry-stat-label">Fallbacks Used</div>
            </div>
          </div>

          <div className="success-rate">
            <div className="success-rate-label">Overall Delivery Success Rate</div>
            <div className="success-rate-value">{retryStats.successRate}%</div>
          </div>
          <div className="success-rate-bar">
            <div className="success-rate-fill" style={{ width: `${retryStats.successRate}%` }} />
          </div>
        </div>

        {/* Architecture & Fallback Reference */}
        <div className="panel">
          <div className="panel-title">
            <span className="icon">📐</span>
            <span>Fallback Engine Rules</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ padding: '9px 12px', background: 'var(--accent-terracotta-bg)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-terracotta)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Important (P4):</strong> Parallel broadcast across all channels. Push offline stays pending without blocking Email/SMS.
            </div>
            <div style={{ padding: '9px 12px', background: 'var(--accent-ochre-bg)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-ochre)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>High (P3):</strong> Fallback chain: Push ➔ retry 3x ➔ Email ➔ retry 3x ➔ SMS. Offline push waits in holding queue with TTL.
            </div>
            <div style={{ padding: '9px 12px', background: 'var(--accent-slate-bg)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-slate)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Medium (P2):</strong> Push ➔ Email only. SMS is strictly forbidden.
            </div>
            <div style={{ padding: '9px 12px', background: 'var(--accent-stone-bg)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-stone)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Low (P1):</strong> Single channel only (no cross-channel fallback).
            </div>
          </div>
        </div>

        {/* Notifications Table */}
        <div className="panel table-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div className="panel-title" style={{ margin: 0 }}>
              <span className="icon">📋</span>
              <span>Recent Dispatches &amp; Channel Execution Traces</span>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <select
                className="form-select"
                style={{ padding: '6px 12px', fontSize: 12, width: 'auto' }}
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
              >
                <option value="all">All Priorities</option>
                <option value="important">Important</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              <select
                className="form-select"
                style={{ padding: '6px 12px', fontSize: 12, width: 'auto' }}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="delivered">Delivered</option>
                <option value="processing">Processing</option>
                <option value="queued">Queued</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Title &amp; Body</th>
                  <th>Recipient</th>
                  <th>Delivery &amp; Fallback Trail</th>
                  <th>Dispatched At</th>
                </tr>
              </thead>
              <tbody>
                {filteredNotifications.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                      No notifications matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredNotifications.map((n) => {
                    const attempts = n.deliveryAttempts || [];
                    return (
                      <tr key={n.id}>
                        <td>
                          <span className={`badge ${n.status}`}>
                            <span className="badge-dot" />
                            {n.status}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${n.priority}`}>{n.priority}</span>
                        </td>
                        <td>
                          <div className="notification-title">{n.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {n.body}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                            {n.user?.externalId || n.userId.slice(0, 8)}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {n.user?.email}
                          </div>
                        </td>
                        <td>
                          {attempts.length === 0 ? (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Queued in RabbitMQ</span>
                          ) : (
                            <div className="fallback-chain-container">
                              {attempts.map((att, idx) => (
                                <div key={att.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <div
                                    className={`attempt-pill ${att.status}`}
                                    title={att.errorMessage || `Attempt #${att.attemptNumber} - ${att.status}`}
                                  >
                                    <span>
                                      {att.channel === 'push' ? '🔔' : att.channel === 'email' ? '📧' : '💬'}{' '}
                                      {att.channel} (#{att.attemptNumber})
                                    </span>
                                    <span>{att.status === 'success' ? '✓' : att.status === 'failed' ? '✗' : '⏳'}</span>
                                  </div>
                                  {idx < attempts.length - 1 && <span className="attempt-arrow">➔</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="timestamp">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
