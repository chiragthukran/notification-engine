import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Notification } from '../../database/entities/notification.entity';
import { User } from '../../database/entities/user.entity';
import { ChannelProvider } from '../../engine/interfaces';
import { ChannelControlService } from '../channel-control.service';
import { Channel } from '../../common/enums';

/**
 * SMS channel provider using Twilio (or simulated mock mode).
 *
 * Checks ChannelControlService to support live on/off toggles
 * and records delivered mock SMS messages for the User Dashboard inbox.
 */
@Injectable()
export class SmsService implements ChannelProvider {
  private readonly logger = new Logger(SmsService.name);
  private twilioClient: any;

  constructor(
    private readonly config: ConfigService,
    private readonly channelControl: ChannelControlService,
  ) {
    this.initTwilio();
  }

  private async initTwilio() {
    try {
      const twilio = await import('twilio');
      const accountSid = this.config.get<string>('twilio.accountSid');
      const authToken = this.config.get<string>('twilio.authToken');

      if (accountSid && authToken) {
        this.twilioClient = twilio.default(accountSid, authToken);
        this.logger.log('Twilio client initialized');
      } else {
        this.logger.warn('Twilio credentials not provided');
      }
    } catch (err) {
      this.logger.error('Failed to initialize Twilio client', err.message);
    }
  }

  async send(
    notification: Notification,
    user: User,
  ): Promise<{ success: boolean; error?: string }> {
    // 1. Check if SMS channel is toggled ON or OFF in simulator
    if (!this.channelControl.isChannelEnabled(Channel.SMS)) {
      this.logger.warn(
        `[SMS SERVICE DISABLED] Simulated failure for notification ${notification.id} to ${user.phone}`,
      );
      return {
        success: false,
        error: 'SMS service unavailable: Service toggled OFF by admin',
      };
    }

    if (!user.phone) {
      return { success: false, error: 'User has no phone number' };
    }

    if (this.channelControl.getStatus().mockMode) {
      return this.sendMock(notification, user);
    }

    return this.sendReal(notification, user);
  }

  private async sendMock(
    notification: Notification,
    user: User,
  ): Promise<{ success: boolean; error?: string }> {
    this.logger.log(
      `[MOCK SMS] To: ${user.phone} | Message: [${notification.title}] ${notification.body}`,
    );

    // Record mock message for User Dashboard SMS inbox
    this.channelControl.recordDeliveredMessage({
      notificationId: notification.id,
      userId: user.id,
      channel: Channel.SMS,
      recipient: user.phone,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      priority: notification.priority,
    });

    // Simulate ~150ms network delay
    await new Promise((resolve) => setTimeout(resolve, 150));

    return { success: true };
  }

  private async sendReal(
    notification: Notification,
    user: User,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.twilioClient) {
      return { success: false, error: 'Twilio client not initialized' };
    }

    try {
      const fromNumber = this.config.get<string>('twilio.phoneNumber');

      await this.twilioClient.messages.create({
        body: `[${notification.title}] ${notification.body}`,
        from: fromNumber,
        to: user.phone,
      });

      this.logger.log(
        `SMS sent to ${user.phone} — notification ${notification.id}`,
      );

      return { success: true };
    } catch (err) {
      this.logger.error(`SMS failed to ${user.phone}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}
