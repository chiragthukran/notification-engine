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
 * LOW priority strategy:
 *
 * Select the first eligible channel ONLY.
 * Try it → retry 3 times → Failed.
 * NO fallback to another channel.
 * Push offline: places message into Offline Queue with TTL.
 * When user comes online, message is delivered. If TTL expires, marked Failed (no fallback).
 */
@Injectable()
export class LowStrategy implements DeliveryStrategy {
  private readonly logger = new Logger(LowStrategy.name);

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

    // Push offline handling
    if (channel === Channel.PUSH) {
      if (!this.pushService.isPushChannelEnabled()) {
        this.logger.warn(`[LOW] Push channel disabled by admin toggle`);
        await this.retryService.recordAttempt(
          notification.id,
          Channel.PUSH,
          1,
          DeliveryStatus.FAILED,
          'Push service unavailable: Service toggled OFF by admin',
        );
        return {
          notificationId: notification.id,
          delivered: false,
          skipped: false,
          pending: false,
          channelResults: [
            {
              channel: Channel.PUSH,
              success: false,
              attempts: 1,
              error: 'Push service toggled OFF by admin',
            },
          ],
        };
      }

      const isOnline = this.pushService.isUserOnline(user.id);
      if (!isOnline) {
        this.logger.log(
          `[LOW] User ${user.id} offline for Push — routing to Offline Queue with TTL`,
        );

        await this.offlineQueueService.enqueueOfflinePush(
          notification,
          user,
          Priority.LOW,
          [], // No fallback for Low priority
        );

        return {
          notificationId: notification.id,
          delivered: false,
          skipped: false,
          pending: true,
          channelResults: [
            { channel: Channel.PUSH, success: false, attempts: 0, pending: true },
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
