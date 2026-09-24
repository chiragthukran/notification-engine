import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import { Notification } from '../database/entities/notification.entity';
import { PRIORITY_QUEUE_MAP } from '../common/enums';

const QUEUE_NAME = 'nx_notifications';
const MAX_PRIORITY = 5;

@Injectable()
export class QueueProducer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueProducer.name);
  private connection: any;
  private channel: any;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch (e) {
      // Ignore close errors
    }
  }

  private async connect() {
    const url = this.config.get<string>('rabbitmq.url');
    try {
      this.connection = await amqplib.connect(url);
      this.channel = await this.connection.createChannel();

      // Declare the priority queue
      await this.channel.assertQueue(QUEUE_NAME, {
        durable: true,
        arguments: {
          'x-max-priority': MAX_PRIORITY,
        },
      });

      this.logger.log('RabbitMQ producer connected');

      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error', err.message);
      });
      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed, reconnecting in 5s...');
        setTimeout(() => this.connect(), 5000);
      });
    } catch (err) {
      this.logger.error('Failed to connect to RabbitMQ, retrying in 5s...', err.message);
      setTimeout(() => this.connect(), 5000);
    }
  }

  async publish(notification: Notification) {
    if (!this.channel) {
      this.logger.error('RabbitMQ channel not available, cannot publish');
      return;
    }

    const priority = PRIORITY_QUEUE_MAP[notification.priority] || 1;
    const payload = JSON.stringify({
      notificationId: notification.id,
      tenantId: notification.tenantId,
      userId: notification.userId,
      priority: notification.priority,
    });

    this.channel.sendToQueue(QUEUE_NAME, Buffer.from(payload), {
      persistent: true,
      priority,
    });

    this.logger.log(
      `Published notification ${notification.id} with priority ${priority}`,
    );
  }
}
