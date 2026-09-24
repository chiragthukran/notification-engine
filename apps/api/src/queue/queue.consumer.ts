import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import { EngineService } from '../engine/engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationStatus } from '../common/enums';

const QUEUE_NAME = 'nx_notifications';
const MAX_PRIORITY = 5;

@Injectable()
export class QueueConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueConsumer.name);
  private connection: any;
  private channel: any;

  constructor(
    private readonly config: ConfigService,
    private readonly engineService: EngineService,
    private readonly notificationsService: NotificationsService,
  ) {}

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

      // Declare queue (idempotent) — same settings as producer
      await this.channel.assertQueue(QUEUE_NAME, {
        durable: true,
        arguments: {
          'x-max-priority': MAX_PRIORITY,
        },
      });

      // Prefetch 1: ensures priority ordering is respected by only
      // processing one message at a time per consumer
      await this.channel.prefetch(1);

      this.logger.log('RabbitMQ consumer connected, waiting for messages...');

      this.channel.consume(QUEUE_NAME, async (msg) => {
        if (!msg) return;

        try {
          const payload = JSON.parse(msg.content.toString());
          this.logger.log(
            `Processing notification ${payload.notificationId} [${payload.priority}]`,
          );

          // Update status to processing
          await this.notificationsService.updateStatus(
            payload.notificationId,
            NotificationStatus.PROCESSING,
          );

          // Delegate to the engine for routing & delivery
          await this.engineService.process(payload.notificationId);

          // Acknowledge the message
          this.channel.ack(msg);
        } catch (err) {
          this.logger.error(
            `Error processing message: ${err.message}`,
            err.stack,
          );
          // Negative acknowledge — do not requeue to avoid infinite loops
          this.channel.nack(msg, false, false);
        }
      });

      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error', err.message);
      });
      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed, reconnecting in 5s...');
        setTimeout(() => this.connect(), 5000);
      });
    } catch (err) {
      this.logger.error(
        'Failed to connect to RabbitMQ, retrying in 5s...',
        err.message,
      );
      setTimeout(() => this.connect(), 5000);
    }
  }
}
