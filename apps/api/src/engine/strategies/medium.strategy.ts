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
import { OfflineQueueService } from '../offline-queue.service';

/**
 * MEDIUM priority strategy:
 *
 * Only Push and Email are allowed — SMS is NEVER used.
 * Fallback: Push → retry 3x → Email → retry 3x → Failed
 * Push offline: places message into Offline Queue with TTL.
 * When user comes online, message is delivered. If TTL expires, falls back to Email.
 * If both Push and Email disabled → SKIPPED (not failed).
 */
@Injectable()
export class MediumStrategy implements DeliveryStrategy {
  private readonly logger = new Logger(MediumStrategy.name);

  constructor(
    private readonly retryService: RetryService,
    private readonly pushService: PushService,
    private readonly emailService: EmailService,
    private readonly offlineQueueService: OfflineQueueService,
  ) {}

  async execute(
    notification: Notification,
    user: User,
    preference: UserPreference,
    eligibleChannels: Channel[],
  ): Promise<DeliveryResult> {
    // Filter out SMS — never allowed for Medium
    const allowedChannels = eligibleChannels.filter(
      (ch) => ch !== Channel.SMS,
    );

    this.logger.log(
      `[MEDIUM] Processing ${notification.id} — eligible: ${allowedChannels.join(' → ') || 'NONE'}`,
    );

    if (allowedChannels.length === 0) {
      this.logger.warn(
        `[MEDIUM] No eligible channels for ${notification.id} — skipping`,
      );
      return {
        notificationId: notification.id,
        delivered: false,
        skipped: true,
        pending: false,
        channelResults: [],
      };
    }

    const channelResults: ChannelDeliveryResult[] = [];

    for (const channel of allowedChannels) {
      const provider = channel === Channel.PUSH ? this.pushService : this.emailService;

      // Push offline handling
      if (channel === Channel.PUSH) {
        if (!this.pushService.isPushChannelEnabled()) {
          this.logger.warn(`[MEDIUM] Push channel disabled by admin toggle`);
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
            `[MEDIUM] User ${user.id} offline for Push — routing to Offline Queue with TTL`,
          );

          const remainingChannels = allowedChannels.includes(Channel.EMAIL)
            ? [Channel.EMAIL]
            : [];

          await this.offlineQueueService.enqueueOfflinePush(
            notification,
            user,
            Priority.MEDIUM,
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
    }

    return {
      notificationId: notification.id,
      delivered: false,
      skipped: false,
      pending: false,
      channelResults,
    };
  }
}
