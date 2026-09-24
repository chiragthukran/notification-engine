import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ConnectionManagerService } from './connection-manager.service';

/**
 * WebSocket gateway for real-time push notifications.
 *
 * Clients connect with a userId in the auth handshake:
 *   io("http://localhost:3001", { auth: { userId: "..." } })
 *
 * On connect, the user is registered as online.
 * On disconnect, the user is removed from online tracking.
 */
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NxWebSocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NxWebSocketGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly connectionManager: ConnectionManagerService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: Socket) {
    const userId =
      (client.handshake.auth?.userId as string) ||
      (client.handshake.query?.userId as string);

    if (!userId) {
      this.logger.warn(
        `WebSocket connection rejected — no userId provided (socket: ${client.id})`,
      );
      client.emit('error', { message: 'userId required in auth handshake' });
      client.disconnect(true);
      return;
    }

    // Join a user-specific room for targeted messaging
    client.join(`user:${userId}`);
    this.connectionManager.registerConnection(userId, client);
  }

  handleDisconnect(client: Socket) {
    this.connectionManager.removeConnection(client.id);
  }
}
