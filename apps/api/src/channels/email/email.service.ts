import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Notification } from '../../database/entities/notification.entity';
import { User } from '../../database/entities/user.entity';
import { ChannelProvider } from '../../engine/interfaces';

/**
 * Email channel provider using AWS SES.
 *
 * When MOCK_CHANNELS=true, simulates email delivery with logging.
 * When MOCK_CHANNELS=false, sends via AWS SES SDK.
 */
@Injectable()
export class EmailService implements ChannelProvider {
  private readonly logger = new Logger(EmailService.name);
  private readonly isMock: boolean;
  private sesClient: any;

  constructor(private readonly config: ConfigService) {
    this.isMock = config.get<boolean>('mockChannels');

    if (!this.isMock) {
      this.initSES();
    }
  }

  private async initSES() {
    try {
      const { SESClient } = await import('@aws-sdk/client-ses');
      this.sesClient = new SESClient({
        region: this.config.get<string>('aws.region'),
        credentials: {
          accessKeyId: this.config.get<string>('aws.accessKeyId'),
          secretAccessKey: this.config.get<string>('aws.secretAccessKey'),
        },
      });
      this.logger.log('AWS SES client initialized');
    } catch (err) {
      this.logger.error('Failed to initialize AWS SES client', err.message);
    }
  }

  async send(
    notification: Notification,
    user: User,
  ): Promise<{ success: boolean; error?: string }> {
    if (!user.email) {
      return { success: false, error: 'User has no email address' };
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
      `[MOCK EMAIL] To: ${user.email} | Subject: ${notification.title} | Body: ${notification.body}`,
    );

    // Simulate ~200ms network delay
    await new Promise((resolve) => setTimeout(resolve, 200));

    return { success: true };
  }

  private async sendReal(
    notification: Notification,
    user: User,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.sesClient) {
      return { success: false, error: 'SES client not initialized' };
    }

    try {
      const { SendEmailCommand } = await import('@aws-sdk/client-ses');
      const fromEmail = this.config.get<string>('aws.sesFromEmail');

      const command = new SendEmailCommand({
        Source: fromEmail,
        Destination: {
          ToAddresses: [user.email],
        },
        Message: {
          Subject: { Data: notification.title },
          Body: {
            Text: { Data: notification.body },
            Html: {
              Data: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2>${notification.title}</h2>
                  <p>${notification.body}</p>
                  <hr/>
                  <small style="color: #888;">Sent via NX Notification Engine</small>
                </div>
              `,
            },
          },
        },
      });

      await this.sesClient.send(command);
      this.logger.log(`Email sent to ${user.email} — notification ${notification.id}`);
      return { success: true };
    } catch (err) {
      this.logger.error(`Email failed to ${user.email}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}
