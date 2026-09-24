import { Module } from '@nestjs/common';
import { NxWebSocketGateway } from './websocket.gateway';
import { ConnectionManagerService } from './connection-manager.service';

@Module({
  providers: [NxWebSocketGateway, ConnectionManagerService],
  exports: [NxWebSocketGateway, ConnectionManagerService],
})
export class WebsocketModule {}
