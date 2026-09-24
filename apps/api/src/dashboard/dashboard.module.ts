import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { Notification } from '../database/entities/notification.entity';
import { DeliveryAttempt } from '../database/entities/delivery-attempt.entity';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, DeliveryAttempt]),
    WebsocketModule,
  ],
  controllers: [DashboardController],
})
export class DashboardModule {}
