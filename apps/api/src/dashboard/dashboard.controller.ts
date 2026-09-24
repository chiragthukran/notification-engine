import { Controller, Get, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../database/entities/notification.entity';
import { DeliveryAttempt } from '../database/entities/delivery-attempt.entity';
import {
  NotificationStatus,
  Priority,
  Channel,
  DeliveryStatus,
} from '../common/enums';
import { ConnectionManagerService } from '../websocket/connection-manager.service';

@Controller('dashboard')
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(DeliveryAttempt)
    private readonly attemptRepo: Repository<DeliveryAttempt>,
    private readonly connectionManager: ConnectionManagerService,
  ) {}

  /**
   * Returns comprehensive dashboard statistics.
   * All data comes from the real database state.
   */
  @Get('stats')
  async getStats() {
    const [
      total,
      statusCounts,
      priorityCounts,
      channelCounts,
      retryStats,
      recentNotifications,
      hourlyActivity,
    ] = await Promise.all([
      this.getTotal(),
      this.getStatusCounts(),
      this.getPriorityCounts(),
      this.getChannelCounts(),
      this.getRetryStats(),
      this.getRecentNotifications(),
      this.getHourlyActivity(),
    ]);

    return {
      total,
      statusCounts,
      priorityCounts,
      channelCounts,
      retryStats,
      recentNotifications,
      hourlyActivity,
      websocket: {
        onlineUsers: this.connectionManager.getOnlineCount(),
      },
    };
  }

  private async getTotal(): Promise<number> {
    return this.notificationRepo.count();
  }

  private async getStatusCounts(): Promise<Record<string, number>> {
    const result = await this.notificationRepo
      .createQueryBuilder('n')
      .select('n.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('n.status')
      .getRawMany();

    const counts: Record<string, number> = {
      queued: 0,
      processing: 0,
      delivered: 0,
      failed: 0,
      pending: 0,
      skipped: 0,
    };

    for (const row of result) {
      counts[row.status] = row.count;
    }

    return counts;
  }

  private async getPriorityCounts(): Promise<Record<string, number>> {
    const result = await this.notificationRepo
      .createQueryBuilder('n')
      .select('n.priority', 'priority')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('n.priority')
      .getRawMany();

    const counts: Record<string, number> = {
      important: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const row of result) {
      counts[row.priority] = row.count;
    }

    return counts;
  }

  private async getChannelCounts(): Promise<Record<string, number>> {
    const result = await this.attemptRepo
      .createQueryBuilder('da')
      .select('da.channel', 'channel')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('da.channel')
      .getRawMany();

    const counts: Record<string, number> = {
      push: 0,
      email: 0,
      sms: 0,
    };

    for (const row of result) {
      counts[row.channel] = row.count;
    }

    return counts;
  }

  private async getRetryStats() {
    const totalAttempts = await this.attemptRepo.count();

    const successCount = await this.attemptRepo.count({
      where: { status: DeliveryStatus.SUCCESS },
    });

    const failedCount = await this.attemptRepo.count({
      where: { status: DeliveryStatus.FAILED },
    });

    const retriesCount = await this.attemptRepo
      .createQueryBuilder('da')
      .where('da.attempt_number > 1')
      .getCount();

    // Count notifications that used fallback (multiple channels attempted)
    const fallbackResult = await this.attemptRepo
      .createQueryBuilder('da')
      .select('da.notification_id')
      .addSelect('COUNT(DISTINCT da.channel)::int', 'channelCount')
      .groupBy('da.notification_id')
      .having('COUNT(DISTINCT da.channel) > 1')
      .getRawMany();

    return {
      totalAttempts,
      successCount,
      failedCount,
      retriesCount,
      fallbackCount: fallbackResult.length,
      successRate:
        totalAttempts > 0
          ? Math.round((successCount / totalAttempts) * 100)
          : 0,
    };
  }

  private async getRecentNotifications() {
    return this.notificationRepo.find({
      order: { createdAt: 'DESC' },
      take: 50,
      relations: ['deliveryAttempts', 'user'],
    });
  }

  private async getHourlyActivity() {
    const result = await this.notificationRepo
      .createQueryBuilder('n')
      .select("DATE_TRUNC('hour', n.created_at)", 'hour')
      .addSelect('COUNT(*)::int', 'count')
      .where("n.created_at > NOW() - INTERVAL '24 hours'")
      .groupBy("DATE_TRUNC('hour', n.created_at)")
      .orderBy("DATE_TRUNC('hour', n.created_at)", 'ASC')
      .getRawMany();

    return result;
  }
}
