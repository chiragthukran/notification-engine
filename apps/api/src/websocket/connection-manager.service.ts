import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Socket } from 'socket.io';

/**
 * Tracks WebSocket connections and user online/offline status.
 *
 * Emits 'user-online' and 'user-offline' events that other services
 * (e.g. PushService) can listen to.
 */
@Injectable()
export class ConnectionManagerService extends EventEmitter {
  private readonly logger = new Logger(ConnectionManagerService.name);

  /** Map of userId → Socket */
  private readonly connections = new Map<string, Socket>();

  /** Map of socketId → userId (for reverse lookup on disconnect) */
  private readonly socketToUser = new Map<string, string>();

  constructor() {
    super();
    // Increase max listeners since multiple services may listen
    this.setMaxListeners(50);
  }

  /**
   * Register a user's WebSocket connection.
   */
  registerConnection(userId: string, socket: Socket): void {
    // If user already has a connection, disconnect the old one
    const existing = this.connections.get(userId);
    if (existing) {
      this.logger.log(`User ${userId} reconnected, closing old socket`);
      existing.disconnect(true);
      this.socketToUser.delete(existing.id);
    }

    this.connections.set(userId, socket);
    this.socketToUser.set(socket.id, userId);

    this.logger.log(
      `User ${userId} connected (socket: ${socket.id}) — ${this.connections.size} total connections`,
    );

    // Emit event for PushService to flush pending notifications
    this.emit('user-online', userId);
  }

  /**
   * Remove a user's WebSocket connection.
   */
  removeConnection(socketId: string): void {
    const userId = this.socketToUser.get(socketId);
    if (!userId) return;

    this.connections.delete(userId);
    this.socketToUser.delete(socketId);

    this.logger.log(
      `User ${userId} disconnected — ${this.connections.size} total connections`,
    );

    this.emit('user-offline', userId);
  }

  isOnline(userId: string): boolean {
    return this.connections.has(userId);
  }

  getSocket(userId: string): Socket | undefined {
    return this.connections.get(userId);
  }

  getOnlineCount(): number {
    return this.connections.size;
  }

  getOnlineUsers(): string[] {
    return Array.from(this.connections.keys());
  }
}
