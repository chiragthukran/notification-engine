import { Module } from '@nestjs/common';
import { NxWebSocketGateway } from './websocket.gateway';
import { ConnectionManagerService } from './connection-manager.service';

@Module({
  providers: [NxWebSocketGateway, ConnectionManagerService],
  exports: [ConnectionManagerService],
})
export class WebsocketModule {}
