import { Module, forwardRef } from '@nestjs/common';
import { QueueProducer } from './queue.producer';
import { QueueConsumer } from './queue.consumer';
import { EngineModule } from '../engine/engine.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    forwardRef(() => EngineModule),
    forwardRef(() => NotificationsModule),
  ],
  providers: [QueueProducer, QueueConsumer],
  exports: [QueueProducer],
})
export class QueueModule {}
