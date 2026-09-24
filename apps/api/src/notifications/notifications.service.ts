import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../database/entities/notification.entity';
import { NotificationStatus, Priority } from '../common/enums';
import { QueueProducer } from '../queue/queue.producer';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly queueProducer: QueueProducer,
  ) {}

  /**
   * Create a notification, persist it, and enqueue it for async processing.
   */
  async create(tenantId: string, dto: CreateNotificationDto) {
    const notification = this.notificationRepo.create({
      tenantId,
      userId: dto.userId,
      priority: dto.priority,
      title: dto.title,
      body: dto.body,
      data: dto.data,
      status: NotificationStatus.QUEUED,
    });

    await this.notificationRepo.save(notification);
    this.logger.log(`Notification ${notification.id} created [${dto.priority}]`);

    // Enqueue for async processing
    await this.queueProducer.publish(notification);
    this.logger.log(`Notification ${notification.id} enqueued`);

    return notification;
  }

  async findById(id: string, tenantId?: string) {
    const where: any = { id };
    if (tenantId) where.tenantId = tenantId;

    const notification = await this.notificationRepo.findOne({
      where,
      relations: ['deliveryAttempts', 'user'],
    });
    if (!notification) throw new NotFoundException('Notification not found');
    return notification;
  }

  async findAll(
    tenantId: string,
    filters?: {
      status?: NotificationStatus;
      priority?: Priority;
      limit?: number;
    },
  ) {
    const qb = this.notificationRepo
      .createQueryBuilder('n')
      .where('n.tenant_id = :tenantId', { tenantId })
      .leftJoinAndSelect('n.deliveryAttempts', 'da')
      .leftJoinAndSelect('n.user', 'u')
      .orderBy('n.created_at', 'DESC');

    if (filters?.status) {
      qb.andWhere('n.status = :status', { status: filters.status });
    }
    if (filters?.priority) {
      qb.andWhere('n.priority = :priority', { priority: filters.priority });
    }
    qb.take(filters?.limit || 100);

    return qb.getMany();
  }

  async updateStatus(id: string, status: NotificationStatus) {
    await this.notificationRepo.update(id, { status });
  }
}
