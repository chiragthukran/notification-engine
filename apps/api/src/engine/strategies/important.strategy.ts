import { Injectable, Logger } from '@nestjs/common';
import { Channel } from '../../common/enums';
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
import { Priority, DeliveryStatus } from '../../common/enums';

/**
 * IMPORTANT priority strategy:
 *
 * Sends notification independently through ALL enabled channels in parallel.
 * Each channel retries independently (max 3 retries).
 * If Push fails because user is offline → Push stays pending in Offline Queue; does NOT block Email/SMS.
 * Overall notification = delivered if at least one channel succeeds.
 */
@Injectable()
export class ImportantStrategy implements DeliveryStrategy {
  private readonly logger = new Logger(ImportantStrategy.name);

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
      `[IMPORTANT] Processing ${notification.id} on channels: ${eligibleChannels.join(', ')}`,
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

    // Fire all channels in parallel
    const promises = eligibleChannels.map((channel) =>
      this.deliverOnChannel(notification, user, channel),
    );

    const channelResults = await Promise.all(promises);

    const anySuccess = channelResults.some((r) => r.success);
    const anyPending = channelResults.some((r) => r.pending);

    return {
      notificationId: notification.id,
      delivered: anySuccess,
      skipped: false,
      pending: !anySuccess && anyPending,
      channelResults,
    };
  }

  private async deliverOnChannel(
    notification: Notification,
    user: User,
    channel: Channel,
  ): Promise<ChannelDeliveryResult> {
    const provider = this.getProvider(channel);

    // For Push: check if user is offline — if offline, route to Offline Queue
    // but do NOT block other channels
    if (channel === Channel.PUSH) {
      if (!this.pushService.isPushChannelEnabled()) {
        await this.retryService.recordAttempt(
          notification.id,
          Channel.PUSH,
          1,
          DeliveryStatus.FAILED,
          'Push service unavailable: Service toggled OFF by admin',
        );
        return {
          channel: Channel.PUSH,
          success: false,
          attempts: 1,
          error: 'Push service toggled OFF by admin',
        };
      }

      const isOnline = this.pushService.isUserOnline(user.id);
      if (!isOnline) {
        this.logger.log(
          `[IMPORTANT] User ${user.id} offline for Push — routing to Offline Queue`,
        );
        await this.offlineQueueService.enqueueOfflinePush(
          notification,
          user,
          Priority.IMPORTANT,
          [],
        );
        return { channel: Channel.PUSH, success: false, attempts: 0, pending: true };
      }
    }

    // Attempt delivery with retries
    return this.retryService.attemptWithRetries(notification, user, channel, provider);
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
