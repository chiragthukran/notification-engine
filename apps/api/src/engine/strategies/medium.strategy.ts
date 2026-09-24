import { Injectable, Logger } from '@nestjs/common';
import { Channel, PUSH_OFFLINE_WAIT, Priority } from '../../common/enums';
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

/**
 * MEDIUM priority strategy:
 *
 * Only Push and Email are allowed — SMS is NEVER used.
 * Fallback: Push → retry 3x → Email → retry 3x → Failed
 * Push offline: wait 72 hours, then fallback to Email.
 * If both Push and Email disabled → SKIPPED (not failed).
 */
@Injectable()
export class MediumStrategy implements DeliveryStrategy {
  private readonly logger = new Logger(MediumStrategy.name);

  constructor(
    private readonly retryService: RetryService,
    private readonly pushService: PushService,
    private readonly emailService: EmailService,
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

      // Push offline handling: wait 72 hours
      if (channel === Channel.PUSH) {
        const isOnline = this.pushService.isUserOnline(user.id);
        if (!isOnline) {
          this.logger.log(
            `[MEDIUM] User ${user.id} offline for Push — waiting up to 72 hours`,
          );

          const delivered = await this.pushService.waitForUserOnline(
            notification,
            user,
            PUSH_OFFLINE_WAIT[Priority.MEDIUM],
          );

          if (delivered) {
            channelResults.push({
              channel: Channel.PUSH,
              success: true,
              attempts: 1,
            });
            return {
              notificationId: notification.id,
              delivered: true,
              skipped: false,
              pending: false,
              channelResults,
            };
          }

          this.logger.log(
            `[MEDIUM] Push wait expired for ${notification.id}, falling back to Email`,
          );
          channelResults.push({
            channel: Channel.PUSH,
            success: false,
            attempts: 0,
            error: 'User offline, wait expired',
          });
          continue;
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
