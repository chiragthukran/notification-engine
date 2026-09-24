import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeliveryAttempt } from '../database/entities/delivery-attempt.entity';
import { Notification } from '../database/entities/notification.entity';
import { User } from '../database/entities/user.entity';
import { Channel, DeliveryStatus, MAX_RETRIES } from '../common/enums';
import { ChannelProvider, ChannelDeliveryResult } from './interfaces';

/** Retry delays with exponential backoff: 1s, 2s, 4s */
const RETRY_DELAYS = [1000, 2000, 4000];

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  constructor(
    @InjectRepository(DeliveryAttempt)
    private readonly attemptRepo: Repository<DeliveryAttempt>,
  ) {}

  /**
   * Attempt delivery on a channel with up to MAX_RETRIES retries.
   * Records each attempt in the database.
   *
   * Returns a summary of the attempt cycle.
   */
  async attemptWithRetries(
    notification: Notification,
    user: User,
    channel: Channel,
    provider: ChannelProvider,
  ): Promise<ChannelDeliveryResult> {
    const maxAttempts = MAX_RETRIES + 1; // 1 initial + 3 retries = 4 total
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.logger.log(
        `Channel [${channel}] attempt ${attempt}/${maxAttempts} for notification ${notification.id}`,
      );

      try {
        const result = await provider.send(notification, user);

        // Record the attempt
        await this.recordAttempt(
          notification.id,
          channel,
          attempt,
          result.success ? DeliveryStatus.SUCCESS : DeliveryStatus.FAILED,
          result.error,
        );

        if (result.success) {
          this.logger.log(
            `Channel [${channel}] succeeded on attempt ${attempt} for ${notification.id}`,
          );
          return { channel, success: true, attempts: attempt };
        }

        lastError = result.error || 'Unknown error';
      } catch (err) {
        lastError = err.message;
        await this.recordAttempt(
          notification.id,
          channel,
          attempt,
          DeliveryStatus.FAILED,
          lastError,
        );
      }

      // If we have more retries, wait with exponential backoff
      if (attempt < maxAttempts) {
        const delay = RETRY_DELAYS[attempt - 1] || 4000;
        this.logger.log(
          `Channel [${channel}] retry ${attempt}/${MAX_RETRIES} for ${notification.id}, waiting ${delay}ms`,
        );
        await this.sleep(delay);
      }
    }

    this.logger.warn(
      `Channel [${channel}] exhausted all ${maxAttempts} attempts for ${notification.id}`,
    );

    return {
      channel,
      success: false,
      attempts: maxAttempts,
      error: lastError,
    };
  }

  /**
   * Record a pending delivery attempt (for push offline scenarios).
   */
  async recordPendingAttempt(
    notificationId: string,
    channel: Channel,
  ) {
    await this.recordAttempt(notificationId, channel, 1, DeliveryStatus.PENDING, 'User offline — waiting for reconnection');
  }

  async recordAttempt(
    notificationId: string,
    channel: Channel,
    attemptNumber: number,
    status: DeliveryStatus,
    errorMessage?: string | null,
  ) {
    const attempt = this.attemptRepo.create({
      notificationId,
      channel,
      attemptNumber,
      status,
      errorMessage,
    });
    await this.attemptRepo.save(attempt);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
