import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Notification } from '../../database/entities/notification.entity';
import { User } from '../../database/entities/user.entity';
import { ChannelProvider } from '../../engine/interfaces';

/**
 * SMS channel provider using Twilio.
 *
 * When MOCK_CHANNELS=true, simulates SMS delivery with logging.
 * When MOCK_CHANNELS=false, sends via Twilio SDK.
 */
@Injectable()
export class SmsService implements ChannelProvider {
  private readonly logger = new Logger(SmsService.name);
  private readonly isMock: boolean;
  private twilioClient: any;

  constructor(private readonly config: ConfigService) {
    this.isMock = config.get<boolean>('mockChannels');

    if (!this.isMock) {
      this.initTwilio();
    }
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
    if (!user.phone) {
      return { success: false, error: 'User has no phone number' };
    }

    if (this.isMock) {
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

    // Simulate ~300ms network delay
    await new Promise((resolve) => setTimeout(resolve, 300));

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
