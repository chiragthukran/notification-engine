import { Injectable, Logger } from '@nestjs/common';
import { Channel, Priority, DeliveryStatus } from '../../common/enums';
import { Notification } from '../../database/entities/notification.entity';
import { UserPreference } from '../../database/entities/user-preference.entity';
import { User } from '../../database/entities/user.entity';
import {
  DeliveryStrategy,
  DeliveryResult,
  ChannelDeliveryResult,
} from '../interfaces';
import { RetryService } from '../retry.service';
import { PushService } from '../../channels/push/push.service';
import { EmailService } from '../../channels/email/email.service';
import { SmsService } from '../../channels/sms/sms.service';
import { OfflineQueueService } from '../offline-queue.service';

/**
 * HIGH priority strategy:
 *
 * Uses the user's eligible channel order (default: Push > Email > SMS).
 * Tries each channel in order with up to 3 retries per channel.
 * If a channel succeeds, stop and mark as delivered.
 * If Push and user is offline: places message into RabbitMQ Offline Queue with TTL.
 * When user comes online, message is delivered. If TTL expires, falls back to next channel.
 */
@Injectable()
export class HighStrategy implements DeliveryStrategy {
  private readonly logger = new Logger(HighStrategy.name);

  constructor(
    private readonly retryService: RetryService,
    private readonly pushService: PushService,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    private readonly offlineQueueService: OfflineQueueService,
  ) {}

  async execute(
    notification: Notification,
    user: User,
    preference: UserPreference,
    eligibleChannels: Channel[],
  ): Promise<DeliveryResult> {
    this.logger.log(
      `[HIGH] Processing ${notification.id} — fallback chain: ${eligibleChannels.join(' → ')}`,
    );

    if (eligibleChannels.length === 0) {
      return {
        notificationId: notification.id,
        delivered: false,
        skipped: true,
        pending: false,
        channelResults: [],
      };
    }

    const channelResults: ChannelDeliveryResult[] = [];

    for (const channel of eligibleChannels) {
      const provider = this.getProvider(channel);

      // Push offline handling
      if (channel === Channel.PUSH) {
        // If Push service is disabled by admin in simulator, fail immediately and fallback
        if (!this.pushService.isPushChannelEnabled()) {
          this.logger.warn(`[HIGH] Push channel disabled by admin toggle`);
          await this.retryService.recordAttempt(
            notification.id,
            Channel.PUSH,
            1,
            DeliveryStatus.FAILED,
            'Push service unavailable: Service toggled OFF by admin',
          );
          channelResults.push({
            channel: Channel.PUSH,
            success: false,
            attempts: 1,
            error: 'Push service toggled OFF by admin',
          });
          continue;
        }

        const isOnline = this.pushService.isUserOnline(user.id);
        if (!isOnline) {
          this.logger.log(
            `[HIGH] User ${user.id} offline for Push — routing to Offline Queue with TTL`,
          );

          const pushIdx = eligibleChannels.indexOf(Channel.PUSH);
          const remainingChannels =
            pushIdx >= 0 ? eligibleChannels.slice(pushIdx + 1) : [];

          await this.offlineQueueService.enqueueOfflinePush(
            notification,
            user,
            Priority.HIGH,
            remainingChannels,
          );

          channelResults.push({
            channel: Channel.PUSH,
            success: false,
            attempts: 0,
            pending: true,
          });

          return {
            notificationId: notification.id,
            delivered: false,
            skipped: false,
            pending: true,
            channelResults,
          };
        }
      }

      const result = await this.retryService.attemptWithRetries(
        notification,
        user,
        channel,
        provider,
      );
      channelResults.push(result);

      if (result.success) {
        return {
          notificationId: notification.id,
          delivered: true,
          skipped: false,
          pending: false,
          channelResults,
        };
      }

      this.logger.log(
        `[HIGH] Channel ${channel} failed for ${notification.id}, trying next...`,
      );
    }

    // All channels exhausted
    return {
      notificationId: notification.id,
      delivered: false,
      skipped: false,
      pending: false,
      channelResults,
    };
  }

  private getProvider(channel: Channel) {
    switch (channel) {
      case Channel.PUSH:
        return this.pushService;
      case Channel.EMAIL:
        return this.emailService;
      case Channel.SMS:
        return this.smsService;
    }
  }
}
