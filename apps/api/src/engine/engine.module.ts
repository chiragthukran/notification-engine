import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '../database/entities/notification.entity';
import { DeliveryAttempt } from '../database/entities/delivery-attempt.entity';
import { EngineService } from './engine.service';
import { RetryService } from './retry.service';
import { ImportantStrategy } from './strategies/important.strategy';
import { HighStrategy } from './strategies/high.strategy';
import { MediumStrategy } from './strategies/medium.strategy';
import { LowStrategy } from './strategies/low.strategy';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChannelsModule } from '../channels/channels.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, DeliveryAttempt]),
    UsersModule,
    forwardRef(() => NotificationsModule),
    ChannelsModule,
  ],
  providers: [
    EngineService,
    RetryService,
    ImportantStrategy,
    HighStrategy,
    MediumStrategy,
    LowStrategy,
  ],
  exports: [EngineService],
})
export class EngineModule {}
