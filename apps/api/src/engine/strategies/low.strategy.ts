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
 * LOW priority strategy:
 *
 * Select the first eligible channel ONLY.
 * Try it → retry 3 times → Failed.
 * NO fallback to another channel.
 * Push offline: wait 72 hours → Failed (no fallback).
 */
@Injectable()
export class LowStrategy implements DeliveryStrategy {
  private readonly logger = new Logger(LowStrategy.name);

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
    if (eligibleChannels.length === 0) {
      return {
        notificationId: notification.id,
        delivered: false,
        skipped: true,
        pending: false,
        channelResults: [],
      };
    }

    // Only use the FIRST eligible channel — no fallback
    const channel = eligibleChannels[0];
    this.logger.log(
      `[LOW] Processing ${notification.id} — single channel: ${channel}`,
    );

    const provider = this.getProvider(channel);

    // Push offline handling: wait 72 hours, then fail (no fallback)
    if (channel === Channel.PUSH) {
      const isOnline = this.pushService.isUserOnline(user.id);
      if (!isOnline) {
        this.logger.log(
          `[LOW] User ${user.id} offline for Push — waiting up to 72 hours`,
        );

        const delivered = await this.pushService.waitForUserOnline(
          notification,
          user,
          PUSH_OFFLINE_WAIT[Priority.LOW],
        );

        if (delivered) {
          return {
            notificationId: notification.id,
            delivered: true,
            skipped: false,
            pending: false,
            channelResults: [
              { channel: Channel.PUSH, success: true, attempts: 1 },
            ],
          };
        }

        // Wait expired — fail, no fallback
        return {
          notificationId: notification.id,
          delivered: false,
          skipped: false,
          pending: false,
          channelResults: [
            {
              channel: Channel.PUSH,
              success: false,
              attempts: 0,
              error: 'User offline, wait expired — no fallback for Low priority',
            },
          ],
        };
      }
    }

    const result = await this.retryService.attemptWithRetries(
      notification,
      user,
      channel,
      provider,
    );

    return {
      notificationId: notification.id,
      delivered: result.success,
      skipped: false,
      pending: false,
      channelResults: [result],
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
