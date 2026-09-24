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
import { SmsService } from '../../channels/sms/sms.service';

/**
 * HIGH priority strategy:
 *
 * Uses the user's eligible channel order (default: Push > Email > SMS).
 * Tries each channel in order with up to 3 retries per channel.
 * If a channel succeeds, stop and mark as delivered.
 * If Push and user is offline: wait 3 minutes. If they come online, deliver.
 * If they don't, fallback to next channel.
 */
@Injectable()
export class HighStrategy implements DeliveryStrategy {
  private readonly logger = new Logger(HighStrategy.name);

  constructor(
    private readonly retryService: RetryService,
    private readonly pushService: PushService,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
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

      // Push offline handling: wait 3 minutes
      if (channel === Channel.PUSH) {
        const isOnline = this.pushService.isUserOnline(user.id);
        if (!isOnline) {
          this.logger.log(
            `[HIGH] User ${user.id} offline for Push — waiting ${PUSH_OFFLINE_WAIT[Priority.HIGH] / 1000}s`,
          );

          const delivered = await this.pushService.waitForUserOnline(
            notification,
            user,
            PUSH_OFFLINE_WAIT[Priority.HIGH],
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

          // User didn't come online — fallback to next channel
          this.logger.log(`[HIGH] Push wait expired for ${notification.id}, falling back`);
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
