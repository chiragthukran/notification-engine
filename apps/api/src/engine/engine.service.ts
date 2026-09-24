import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../database/entities/notification.entity';
import { User } from '../database/entities/user.entity';
import { Priority, NotificationStatus } from '../common/enums';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ImportantStrategy } from './strategies/important.strategy';
import { HighStrategy } from './strategies/high.strategy';
import { MediumStrategy } from './strategies/medium.strategy';
import { LowStrategy } from './strategies/low.strategy';
import { DeliveryStrategy } from './interfaces';

/**
 * Core notification engine orchestrator.
 *
 * Receives a notification ID, loads the notification and user preferences,
 * delegates to the appropriate priority strategy, and updates the final status.
 */
@Injectable()
export class EngineService {
  private readonly logger = new Logger(EngineService.name);
  private readonly strategies: Record<Priority, DeliveryStrategy>;

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly importantStrategy: ImportantStrategy,
    private readonly highStrategy: HighStrategy,
    private readonly mediumStrategy: MediumStrategy,
    private readonly lowStrategy: LowStrategy,
  ) {
    this.strategies = {
      [Priority.IMPORTANT]: this.importantStrategy,
      [Priority.HIGH]: this.highStrategy,
      [Priority.MEDIUM]: this.mediumStrategy,
      [Priority.LOW]: this.lowStrategy,
    };
  }

  /**
   * Process a notification by its ID.
   * This is called by the queue consumer after dequeuing a message.
   */
  async process(notificationId: string): Promise<void> {
    this.logger.log(`Engine processing notification ${notificationId}`);

    // Load the notification
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId },
    });

    if (!notification) {
      this.logger.error(`Notification ${notificationId} not found`);
      return;
    }

    // Load user with preferences
    let user: User;
    try {
      user = await this.usersService.findById(
        notification.userId,
        notification.tenantId,
      );
    } catch (err) {
      this.logger.error(
        `User ${notification.userId} not found for notification ${notificationId}`,
      );
      await this.notificationsService.updateStatus(
        notificationId,
        NotificationStatus.FAILED,
      );
      return;
    }

    if (!user.preference) {
      this.logger.error(
        `User ${user.id} has no preferences, cannot determine channels`,
      );
      await this.notificationsService.updateStatus(
        notificationId,
        NotificationStatus.FAILED,
      );
      return;
    }

    // Get eligible channels based on user preferences
    const eligibleChannels = this.usersService.getEligibleChannels(
      user.preference,
    );

    this.logger.log(
      `Notification ${notificationId} [${notification.priority}] — eligible channels: ${eligibleChannels.join(', ') || 'NONE'}`,
    );

    // Get the strategy for this priority
    const strategy = this.strategies[notification.priority];
    if (!strategy) {
      this.logger.error(`No strategy for priority: ${notification.priority}`);
      await this.notificationsService.updateStatus(
        notificationId,
        NotificationStatus.FAILED,
      );
      return;
    }

    // Execute the delivery strategy
    const result = await strategy.execute(
      notification,
      user,
      user.preference,
      eligibleChannels,
    );

    // Update final status
    let finalStatus: NotificationStatus;
    if (result.delivered) {
      finalStatus = NotificationStatus.DELIVERED;
    } else if (result.skipped) {
      finalStatus = NotificationStatus.SKIPPED;
    } else if (result.pending) {
      finalStatus = NotificationStatus.PENDING;
    } else {
      finalStatus = NotificationStatus.FAILED;
    }

    await this.notificationsService.updateStatus(notificationId, finalStatus);

    this.logger.log(
      `Notification ${notificationId} final status: ${finalStatus}`,
    );
  }
}
