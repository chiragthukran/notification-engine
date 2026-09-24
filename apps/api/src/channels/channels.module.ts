import { Module, forwardRef } from '@nestjs/common';
import { PushService } from './push/push.service';
import { EmailService } from './email/email.service';
import { SmsService } from './sms/sms.service';
import { ChannelControlService } from './channel-control.service';
import { ChannelControlController } from './channel-control.controller';
import { WebsocketModule } from '../websocket/websocket.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [forwardRef(() => WebsocketModule), ConfigModule],
  controllers: [ChannelControlController],
  providers: [
    ChannelControlService,
    PushService,
    EmailService,
    SmsService,
  ],
  exports: [
    ChannelControlService,
    PushService,
    EmailService,
    SmsService,
  ],
})
export class ChannelsModule {}
