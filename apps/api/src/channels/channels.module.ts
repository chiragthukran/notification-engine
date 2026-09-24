import { Module } from '@nestjs/common';
import { PushService } from './push/push.service';
import { EmailService } from './email/email.service';
import { SmsService } from './sms/sms.service';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebsocketModule],
  providers: [PushService, EmailService, SmsService],
  exports: [PushService, EmailService, SmsService],
})
export class ChannelsModule {}
