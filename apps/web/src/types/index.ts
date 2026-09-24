export type Priority = 'important' | 'high' | 'medium' | 'low';
export type NotificationStatus = 'queued' | 'processing' | 'delivered' | 'failed' | 'pending' | 'skipped';
export type Channel = 'push' | 'email' | 'sms';
export type DeliveryStatus = 'success' | 'failed' | 'pending';

export interface ChannelControlStatus {
  push: boolean;
  email: boolean;
  sms: boolean;
  fastFallback: boolean;
  offlineWaitSeconds: number;
  mockMode: boolean;
}

export interface DeliveryAttempt {
  id: string;
  notificationId: string;
  channel: Channel;
  attemptNumber: number;
  status: DeliveryStatus;
  errorMessage?: string | null;
  attemptedAt: string;
}

export interface UserPreference {
  id: string;
  userId: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  channelOrder: Channel[];
}

export interface User {
  id: string;
  tenantId: string;
  externalId: string;
  email?: string;
  phone?: string;
  createdAt: string;
  preference?: UserPreference;
}

export interface Tenant {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  apiKey?: string | null;
  users?: User[];
}

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  priority: Priority;
  title: string;
  body: string;
  data?: Record<string, any> | null;
  status: NotificationStatus;
  createdAt: string;
  updatedAt: string;
  deliveryAttempts?: DeliveryAttempt[];
  user?: User;
}

export interface MockMessage {
  id: string;
  notificationId: string;
  userId: string;
  channel: Channel;
  recipient: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority: Priority;
  timestamp: string;
}

export interface DashboardStats {
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
  recentNotifications: Notification[];
  hourlyActivity: { hour: string; count: number }[];
  websocket: {
    onlineUsers: number;
  };
}
