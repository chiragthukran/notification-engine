export enum Priority {
  IMPORTANT = 'important',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum NotificationStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  PENDING = 'pending',
  SKIPPED = 'skipped',
}

export enum Channel {
  PUSH = 'push',
  EMAIL = 'email',
  SMS = 'sms',
}

export enum DeliveryStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  PENDING = 'pending',
}

/** Maps priority to RabbitMQ numeric priority (higher = processed first) */
export const PRIORITY_QUEUE_MAP: Record<Priority, number> = {
  [Priority.IMPORTANT]: 4,
  [Priority.HIGH]: 3,
  [Priority.MEDIUM]: 2,
  [Priority.LOW]: 1,
};

/** Default channel order for user preferences */
export const DEFAULT_CHANNEL_ORDER: Channel[] = [
  Channel.PUSH,
  Channel.EMAIL,
  Channel.SMS,
];

/** Max retries per channel (3 retries + 1 initial = 4 total attempts) */
export const MAX_RETRIES = 3;

/** Push offline wait times in milliseconds */
export const PUSH_OFFLINE_WAIT = {
  [Priority.IMPORTANT]: 3 * 60 * 1000,       // 3 minutes (same as high for the push part)
  [Priority.HIGH]: 3 * 60 * 1000,             // 3 minutes
  [Priority.MEDIUM]: 72 * 60 * 60 * 1000,     // 72 hours
  [Priority.LOW]: 72 * 60 * 60 * 1000,        // 72 hours
};
