import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import { Notification } from '../database/entities/notification.entity';
import { DeliveryAttempt } from '../database/entities/delivery-attempt.entity';
import { User } from '../database/entities/user.entity';
import {
  Channel,
  Priority,
  NotificationStatus,
  DeliveryStatus,
} from '../common/enums';
import { RetryService } from './retry.service';
import { PushService } from '../channels/push/push.service';
import { EmailService } from '../channels/email/email.service';
import { SmsService } from '../channels/sms/sms.service';
import { ChannelControlService } from '../channels/channel-control.service';
import { ConnectionManagerService } from '../websocket/connection-manager.service';
import { UsersService } from '../users/users.service';

const HOLDING_QUEUE = 'nx_offline_push_holding';
const FALLBACK_QUEUE = 'nx_offline_push_fallback';

export interface OfflinePushPayload {
  notificationId: string;
  userId: string;
  priority: Priority;
  remainingChannels: Channel[];
  ttlMs: number;
  enqueuedAt: number;
}

@Injectable()
export class OfflineQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OfflineQueueService.name);
  private connection: any;
  private channel: any;
  private readonly backupTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(DeliveryAttempt)
    private readonly attemptRepo: Repository<DeliveryAttempt>,
    private readonly config: ConfigService,
    private readonly retryService: RetryService,
    private readonly pushService: PushService,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    private readonly channelControl: ChannelControlService,
    private readonly connectionManager: ConnectionManagerService,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit() {
    await this.connectRabbitMQ();

    // Listen for WebSocket reconnection events to deliver pending offline notifications
    this.connectionManager.on('user-online', (userId: string) => {
      if (userId === 'admin-dashboard-monitor') return;
      this.deliverPendingForUser(userId).catch((err) => {
        this.logger.error(
          `Error flushing pending notifications for user ${userId}: ${err.message}`,
        );
      });
    });
  }

  async onModuleDestroy() {
    for (const timer of this.backupTimers.values()) {
      clearTimeout(timer);
    }
    this.backupTimers.clear();

    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  private async connectRabbitMQ() {
    const url = this.config.get<string>('rabbitmq.url') || 'amqp://guest:guest@localhost:5672';
    try {
      this.connection = await amqplib.connect(url);
      this.channel = await this.connection.createChannel();

      // 1. Declare dead-letter destination queue for expired TTL messages
      await this.channel.assertQueue(FALLBACK_QUEUE, {
        durable: true,
      });

      // 2. Declare holding queue with Dead Letter Exchange pointing to FALLBACK_QUEUE
      await this.channel.assertQueue(HOLDING_QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': FALLBACK_QUEUE,
        },
      });

      await this.channel.prefetch(1);
      this.logger.log(
        `Offline holding queue (${HOLDING_QUEUE}) and fallback queue (${FALLBACK_QUEUE}) initialized`,
      );

      // 3. Start consuming expired messages from the fallback queue
      this.channel.consume(FALLBACK_QUEUE, async (msg: any) => {
        if (!msg) return;

        try {
          const payload: OfflinePushPayload = JSON.parse(msg.content.toString());
          await this.handleTtlExpired(payload);
          this.channel.ack(msg);
        } catch (err) {
          this.logger.error(`Error processing fallback queue message: ${err.message}`, err.stack);
          this.channel.nack(msg, false, false);
        }
      });

      this.connection.on('error', (err: any) => {
        this.logger.error('RabbitMQ connection error in OfflineQueueService', err.message);
      });
      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed in OfflineQueueService, reconnecting in 5s...');
        setTimeout(() => this.connectRabbitMQ(), 5000);
      });
    } catch (err) {
      this.logger.error(
        'Failed to connect to RabbitMQ in OfflineQueueService, retrying in 5s...',
        err.message,
      );
      setTimeout(() => this.connectRabbitMQ(), 5000);
    }
  }

  /**
   * Enqueue a notification for an offline user.
   * Stores status PENDING in DB, publishes to RabbitMQ TTL holding queue,
   * and sets an in-memory safety timer.
   */
  async enqueueOfflinePush(
    notification: Notification,
    user: User,
    priority: Priority,
    remainingChannels: Channel[],
  ): Promise<void> {
    const ttlMs = this.channelControl.getPushOfflineWait(priority);
    const expiresAt = new Date(Date.now() + ttlMs);

    this.logger.log(
      `[OFFLINE QUEUE] Enqueuing notification ${notification.id} for user ${user.id} [TTL: ${ttlMs / 1000}s, expires: ${expiresAt.toISOString()}]`,
    );

    // 1. Update notification in DB with status PENDING and expiresAt
    await this.notificationRepo.update(notification.id, {
      status: NotificationStatus.PENDING,
      expiresAt,
    });

    // 2. Record PENDING attempt
    await this.retryService.recordAttempt(
      notification.id,
      Channel.PUSH,
      1,
      DeliveryStatus.PENDING,
      `User device offline on WebSocket — queued in offline holding queue with TTL of ${ttlMs / 1000}s`,
    );

    // 3. Publish to RabbitMQ holding queue with message expiration TTL
    const payload: OfflinePushPayload = {
      notificationId: notification.id,
      userId: user.id,
      priority,
      remainingChannels,
      ttlMs,
      enqueuedAt: Date.now(),
    };

    if (this.channel) {
      try {
        this.channel.sendToQueue(
          HOLDING_QUEUE,
          Buffer.from(JSON.stringify(payload)),
          {
            persistent: true,
            expiration: ttlMs.toString(),
          },
        );
        this.logger.log(
          `[OFFLINE QUEUE] Message published to ${HOLDING_QUEUE} with expiration ${ttlMs}ms`,
        );
      } catch (err) {
        this.logger.error(`Failed to publish to ${HOLDING_QUEUE}: ${err.message}`);
      }
    }

    // 4. Set backup timer in case RabbitMQ is delayed
    const timer = setTimeout(async () => {
      this.backupTimers.delete(notification.id);
      await this.handleTtlExpired(payload);
    }, ttlMs + 500);

    this.backupTimers.set(notification.id, timer);

    // 5. Broadcast status update
    this.broadcastStatusChange(notification.id, NotificationStatus.PENDING);
  }

  /**
   * Check and deliver all pending offline notifications for a user who just came online.
   */
  async deliverPendingForUser(userId: string): Promise<number> {
    this.logger.log(`[OFFLINE QUEUE] User ${userId} came online — checking pending messages...`);

    const pendingNotifications = await this.notificationRepo.find({
      where: {
        userId,
        status: NotificationStatus.PENDING,
      },
      order: { createdAt: 'ASC' },
      relations: ['user'],
    });

    if (pendingNotifications.length === 0) {
      this.logger.log(`[OFFLINE QUEUE] No pending notifications for user ${userId}`);
      return 0;
    }

    this.logger.log(
      `[OFFLINE QUEUE] Found ${pendingNotifications.length} pending notification(s) for user ${userId}`,
    );

    let deliveredCount = 0;
    const now = new Date();

    for (const notification of pendingNotifications) {
      // Check TTL: if expiresAt is set and now > expiresAt, skip
      if (notification.expiresAt && now > notification.expiresAt) {
        this.logger.log(
          `[OFFLINE QUEUE] Notification ${notification.id} expired at ${notification.expiresAt.toISOString()}, skipping delivery on reconnect`,
        );
        continue;
      }

      // Check if user is still online
      if (!this.connectionManager.isOnline(userId)) {
        this.logger.warn(`User ${userId} disconnected during pending flush`);
        break;
      }

      try {
        const user = notification.user || (await this.usersService.findByIdDirect(userId));
        const result = await this.pushService.send(notification, user);

        if (result.success) {
          // Clear any backup timer
          const timer = this.backupTimers.get(notification.id);
          if (timer) {
            clearTimeout(timer);
            this.backupTimers.delete(notification.id);
          }

          // Update DB status to DELIVERED
          await this.notificationRepo.update(notification.id, {
            status: NotificationStatus.DELIVERED,
          });

          // Record successful attempt
          await this.retryService.recordAttempt(
            notification.id,
            Channel.PUSH,
            1,
            DeliveryStatus.SUCCESS,
            'Delivered from offline queue upon user reconnection',
          );

          deliveredCount++;
          this.logger.log(
            `[OFFLINE QUEUE] Successfully delivered pending notification ${notification.id} to user ${userId} upon reconnect!`,
          );

          this.broadcastStatusChange(notification.id, NotificationStatus.DELIVERED);
        } else {
          this.logger.warn(
            `[OFFLINE QUEUE] Failed to deliver pending push ${notification.id}: ${result.error}`,
          );
        }
      } catch (err) {
        this.logger.error(
          `[OFFLINE QUEUE] Error delivering pending notification ${notification.id}: ${err.message}`,
        );
      }
    }

    return deliveredCount;
  }

  /**
   * Handle TTL expiration: triggered when a message is dead-lettered to FALLBACK_QUEUE
   * or by the safety timer.
   */
  async handleTtlExpired(payload: OfflinePushPayload): Promise<void> {
    const { notificationId, userId, priority, remainingChannels, ttlMs } = payload;

    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId },
      relations: ['user'],
    });

    if (!notification) {
      return;
    }

    // If already delivered (e.g. user came online during TTL), nothing to do!
    if (notification.status !== NotificationStatus.PENDING) {
      this.logger.log(
        `[OFFLINE QUEUE] Notification ${notificationId} is already ${notification.status} (user was online), skipping fallback.`,
      );
      return;
    }

    this.logger.warn(
      `[OFFLINE QUEUE] TTL of ${ttlMs / 1000}s EXPIRED for notification ${notificationId} while user was offline`,
    );

    // Record Push failure due to TTL expiration
    await this.retryService.recordAttempt(
      notificationId,
      Channel.PUSH,
      1,
      DeliveryStatus.FAILED,
      `User device offline on WebSocket (timeout after ${ttlMs / 1000}s TTL)`,
    );

    // If no fallback channels remaining (e.g. LOW priority or only Push enabled)
    if (!remainingChannels || remainingChannels.length === 0) {
      this.logger.warn(
        `[OFFLINE QUEUE] No fallback channels remaining for notification ${notificationId} — marking FAILED`,
      );
      await this.notificationRepo.update(notificationId, {
        status: NotificationStatus.FAILED,
      });
      this.broadcastStatusChange(notificationId, NotificationStatus.FAILED);
      return;
    }

    // Execute fallback through remaining channels (Email -> SMS)
    const user = notification.user || (await this.usersService.findByIdDirect(userId));
    let delivered = false;

    for (const channel of remainingChannels) {
      const provider = channel === Channel.EMAIL ? this.emailService : this.smsService;
      this.logger.log(
        `[OFFLINE QUEUE] Fallback: Trying channel [${channel}] for notification ${notificationId}...`,
      );

      const result = await this.retryService.attemptWithRetries(
        notification,
        user,
        channel,
        provider,
      );

      if (result.success) {
        delivered = true;
        this.logger.log(
          `[OFFLINE QUEUE] Fallback to [${channel}] succeeded for notification ${notificationId}!`,
        );
        break;
      }
    }

    const finalStatus = delivered ? NotificationStatus.DELIVERED : NotificationStatus.FAILED;
    await this.notificationRepo.update(notificationId, { status: finalStatus });
    this.broadcastStatusChange(notificationId, finalStatus);
  }

  private broadcastStatusChange(notificationId: string, status: NotificationStatus) {
    try {
      this.channelControl.recordDeliveredMessage({
        notificationId,
        userId: 'system',
        channel: Channel.PUSH,
        recipient: 'System Broadcast',
        title: `Status Update: ${status.toUpperCase()}`,
        body: `Notification ${notificationId} updated to ${status}`,
        priority: Priority.HIGH,
      });
    } catch (e) {
      // Ignore broadcast errors
    }
  }
}
