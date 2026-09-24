'use client';

interface ToastItem {
  id: string;
  title: string;
  body: string;
  priority: string;
  channel: string;
}

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastNotificationContainer({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className="toast-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{t.channel === 'push' ? '🔔' : t.channel === 'email' ? '📧' : '💬'}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {t.title}
              </span>
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              ×
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 8 }}>
            {t.body}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className={`badge ${t.priority}`}>{t.priority}</span>
            <span className={`badge ${t.channel}`}>{t.channel}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>Just now</span>
          </div>
        </div>
      ))}
    </div>
  );
}
