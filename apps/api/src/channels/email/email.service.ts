import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Notification } from '../../database/entities/notification.entity';
import { User } from '../../database/entities/user.entity';
import { ChannelProvider } from '../../engine/interfaces';
import { ChannelControlService } from '../channel-control.service';
import { Channel } from '../../common/enums';

/**
 * Email channel provider using AWS SES (or simulated mock mode).
 *
 * Checks ChannelControlService to support live on/off toggles
 * and records delivered mock messages for the User Dashboard inbox.
 */
@Injectable()
export class EmailService implements ChannelProvider {
  private readonly logger = new Logger(EmailService.name);
  private sesClient: any;

  constructor(
    private readonly config: ConfigService,
    private readonly channelControl: ChannelControlService,
  ) {
    this.initSES();
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
    // 1. Check if Email channel is toggled ON or OFF in simulator
    if (!this.channelControl.isChannelEnabled(Channel.EMAIL)) {
      this.logger.warn(
        `[EMAIL SERVICE DISABLED] Simulated failure for notification ${notification.id} to ${user.email}`,
      );
      return {
        success: false,
        error: 'Email service unavailable: Service toggled OFF by admin',
      };
    }

    if (!user.email) {
      return { success: false, error: 'User has no email address' };
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
      `[MOCK EMAIL] To: ${user.email} | Subject: ${notification.title} | Body: ${notification.body}`,
    );

    // Record delivered mock email message for the User Dashboard Email Inbox
    this.channelControl.recordDeliveredMessage({
      notificationId: notification.id,
      userId: user.id,
      channel: Channel.EMAIL,
      recipient: user.email,
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
