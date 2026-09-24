import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Notification } from '../../database/entities/notification.entity';
import { User } from '../../database/entities/user.entity';
import { ChannelProvider } from '../../engine/interfaces';
import { ConnectionManagerService } from '../../websocket/connection-manager.service';
import { ChannelControlService } from '../channel-control.service';
import { Channel, Priority } from '../../common/enums';

interface PendingPush {
  notification: Notification;
  user: User;
  priorityType: string;
  resolve: (delivered: boolean) => void;
  timeout: NodeJS.Timeout | null;
}

/**
 * Push notification channel provider.
 *
 * Delivers notifications via WebSocket to connected users.
 * Supports ChannelControl toggles and configurable wait timeouts.
 */
@Injectable()
export class PushService implements ChannelProvider {
  private readonly logger = new Logger(PushService.name);

  /**
   * Pending push notifications keyed by `userId:notificationId`.
   * Stored when user is offline and waiting for reconnection.
   */
  private readonly pendingPushes = new Map<string, PendingPush>();

  /**
   * Index of all pending pushes by userId for quick lookup on reconnection.
   */
  private readonly pendingByUser = new Map<string, Set<string>>();

  constructor(
    private readonly connectionManager: ConnectionManagerService,
    private readonly channelControl: ChannelControlService,
  ) {
    // Listen for user-online events to flush pending pushes
    this.connectionManager.on('user-online', (userId: string) => {
      this.flushPendingForUser(userId);
    });
  }

  /**
   * Check if a user is currently connected via WebSocket.
   */
  isUserOnline(userId: string): boolean {
    return this.connectionManager.isOnline(userId);
  }

  /**
   * Check if Push channel is enabled by admin/simulator toggle.
   */
  isPushChannelEnabled(): boolean {
    return this.channelControl.isChannelEnabled(Channel.PUSH);
  }

  /**
   * Returns wait timeout for offline push, taking into account fastFallback test mode.
   */
  getOfflineWait(priority: Priority): number {
    return this.channelControl.getPushOfflineWait(priority);
  }

  /**
   * Send a push notification to a user.
   * Checks channel toggle first, then WebSocket connection.
   */
  async send(
    notification: Notification,
    user: User,
  ): Promise<{ success: boolean; error?: string }> {
    // 1. Check if Push channel is toggled ON or OFF in simulator
    if (!this.channelControl.isChannelEnabled(Channel.PUSH)) {
      this.logger.warn(
        `[PUSH SERVICE DISABLED] Simulated failure for notification ${notification.id} to user ${user.id}`,
      );
      return {
        success: false,
        error: 'Push service unavailable: Service toggled OFF by admin',
      };
    }

    const socket = this.connectionManager.getSocket(user.id);

    if (!socket) {
      return { success: false, error: 'User not connected' };
    }

    try {
      socket.emit('notification', {
        id: notification.id,
        title: notification.title,
        body: notification.body,
        priority: notification.priority,
        data: notification.data,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `Push notification sent to user ${user.id} — notification ${notification.id}`,
      );

      // Record delivered push message
      this.channelControl.recordDeliveredMessage({
        notificationId: notification.id,
        userId: user.id,
        channel: Channel.PUSH,
        recipient: 'Push Device',
        title: notification.title,
        body: notification.body,
        data: notification.data,
        priority: notification.priority,
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Store a pending push notification for when the user comes online.
   * Used by the Important strategy (doesn't block other channels).
   */
  async storePending(
    notification: Notification,
    user: User,
    priorityType: string,
  ): Promise<void> {
    const key = `${user.id}:${notification.id}`;
    const pending: PendingPush = {
      notification,
      user,
      priorityType,
      resolve: () => {},
      timeout: null,
    };
    this.pendingPushes.set(key, pending);

    if (!this.pendingByUser.has(user.id)) {
      this.pendingByUser.set(user.id, new Set());
    }
    this.pendingByUser.get(user.id).add(key);

    this.logger.log(
      `Stored pending push for user ${user.id} — notification ${notification.id}`,
    );
  }

  /**
   * Wait for a user to come online and deliver a push notification.
   * Returns true if delivered, false if timeout expired.
   */
  async waitForUserOnline(
    notification: Notification,
    user: User,
    timeoutMs: number,
  ): Promise<boolean> {
    // If push service itself is disabled, fail immediately without waiting
    if (!this.channelControl.isChannelEnabled(Channel.PUSH)) {
      this.logger.log(`Push service disabled, not waiting for user online`);
      return false;
    }

    return new Promise<boolean>((resolve) => {
      const key = `${user.id}:${notification.id}`;

      // Set timeout for expiry
      const timeout = setTimeout(() => {
        const pending = this.pendingPushes.get(key);
        if (pending) {
          this.removePending(key, user.id);
          this.logger.log(
            `Push wait expired for notification ${notification.id} after ${timeoutMs}ms`,
          );
          resolve(false);
        }
      }, timeoutMs);

      const pending: PendingPush = {
        notification,
        user,
        priorityType: 'wait',
        resolve,
        timeout,
      };

      this.pendingPushes.set(key, pending);

      if (!this.pendingByUser.has(user.id)) {
        this.pendingByUser.set(user.id, new Set());
      }
      this.pendingByUser.get(user.id).add(key);

      this.logger.log(
        `Waiting ${timeoutMs}ms for user ${user.id} to come online (notification ${notification.id})`,
      );
    });
  }

  /**
   * Flush all pending push notifications for a user who just came online.
   */
  private async flushPendingForUser(userId: string): Promise<void> {
    const keys = this.pendingByUser.get(userId);
    if (!keys || keys.size === 0) return;

    this.logger.log(
      `User ${userId} came online — flushing ${keys.size} pending push(es)`,
    );

    for (const key of Array.from(keys)) {
      const pending = this.pendingPushes.get(key);
      if (!pending) continue;

      // Try to deliver
      const result = await this.send(pending.notification, pending.user);

      if (result.success) {
        this.logger.log(
          `Pending push delivered: notification ${pending.notification.id}`,
        );
        if (pending.timeout) clearTimeout(pending.timeout);
        pending.resolve(true);
      } else {
        this.logger.warn(
          `Failed to deliver pending push: notification ${pending.notification.id}`,
        );
        if (pending.timeout) clearTimeout(pending.timeout);
        pending.resolve(false);
      }

      this.removePending(key, userId);
    }
  }

  private removePending(key: string, userId: string): void {
    this.pendingPushes.delete(key);
    const userKeys = this.pendingByUser.get(userId);
    if (userKeys) {
      userKeys.delete(key);
      if (userKeys.size === 0) {
        this.pendingByUser.delete(userId);
      }
    }
  }
}
