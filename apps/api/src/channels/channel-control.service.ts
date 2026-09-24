import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Channel, Priority, PUSH_OFFLINE_WAIT } from '../common/enums';
import { NxWebSocketGateway } from '../websocket/websocket.gateway';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';

export interface ChannelControlStatus {
  push: boolean;
  email: boolean;
  sms: boolean;
  fastFallback: boolean;
  offlineWaitSeconds: number;
  mockMode: boolean;
}

export interface MockMessage {
  id: string;
  notificationId: string;
  userId: string;
  channel: Channel;
  recipient: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority: Priority;
  timestamp: string;
}

@Injectable()
export class ChannelControlService {
  private readonly logger = new Logger(ChannelControlService.name);

  private pushEnabled = true;
  private emailEnabled = true;
  private smsEnabled = true;
  private fastFallback = true;
  private offlineWaitSeconds = 15; // 15 seconds for comfortable offline reconnection testing
  private mockMode = true;

  private readonly messages: MockMessage[] = [];
  private readonly MAX_MESSAGES = 500;

  constructor(
    @Inject(forwardRef(() => NxWebSocketGateway))
    private readonly gateway: NxWebSocketGateway,
    private readonly config: ConfigService,
  ) {
    this.mockMode = this.config.get<boolean>('mockChannels');
  }

  getStatus(): ChannelControlStatus {
    return {
      push: this.pushEnabled,
      email: this.emailEnabled,
      sms: this.smsEnabled,
      fastFallback: this.fastFallback,
      offlineWaitSeconds: this.offlineWaitSeconds,
      mockMode: this.mockMode,
    };
  }

  isChannelEnabled(channel: Channel): boolean {
    switch (channel) {
      case Channel.PUSH:
        return this.pushEnabled;
      case Channel.EMAIL:
        return this.emailEnabled;
      case Channel.SMS:
        return this.smsEnabled;
      default:
        return true;
    }
  }

  toggleChannel(channel: Channel, enabled?: boolean): ChannelControlStatus {
    const newState = (prev: boolean) => (enabled !== undefined ? enabled : !prev);

    switch (channel) {
      case Channel.PUSH:
        this.pushEnabled = newState(this.pushEnabled);
        break;
      case Channel.EMAIL:
        this.emailEnabled = newState(this.emailEnabled);
        break;
      case Channel.SMS:
        this.smsEnabled = newState(this.smsEnabled);
        break;
    }

    const status = this.getStatus();
    this.logger.log(
      `Channel toggle updated: PUSH=${this.pushEnabled}, EMAIL=${this.emailEnabled}, SMS=${this.smsEnabled}`,
    );

    this.broadcastStatusChange(status);
    return status;
  }

  setFastFallback(enabled: boolean, waitSeconds?: number): ChannelControlStatus {
    this.fastFallback = enabled;
    if (waitSeconds !== undefined && waitSeconds > 0) {
      this.offlineWaitSeconds = waitSeconds;
    }
    const status = this.getStatus();
    this.broadcastStatusChange(status);
    return status;
  }

  toggleMockMode(enabled: boolean): ChannelControlStatus {
    this.mockMode = enabled;
    this.logger.log(`Environment changed to ${enabled ? 'TESTING (Mock)' : 'PRODUCTION (Real)'}`);
    const status = this.getStatus();
    this.broadcastStatusChange(status);
    return status;
  }

  resetAll(): ChannelControlStatus {
    this.pushEnabled = true;
    this.emailEnabled = true;
    this.smsEnabled = true;
    this.fastFallback = true;
    this.offlineWaitSeconds = 5;
    this.mockMode = true;
    const status = this.getStatus();
    this.broadcastStatusChange(status);
    return status;
  }

  getPushOfflineWait(priority: Priority): number {
    if (this.fastFallback) {
      return this.offlineWaitSeconds * 1000;
    }
    return PUSH_OFFLINE_WAIT[priority] || 5000;
  }

  recordDeliveredMessage(
    data: Omit<MockMessage, 'id' | 'timestamp'>,
  ): MockMessage {
    const message: MockMessage = {
      ...data,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    };

    this.messages.unshift(message);
    if (this.messages.length > this.MAX_MESSAGES) {
      this.messages.pop();
    }

    // Real-time broadcast to connected clients
    try {
      if (this.gateway?.server) {
        // Emit to user's personal room
        this.gateway.server.to(`user:${message.userId}`).emit('user:message', message);
        // Also emit globally for dashboard live feed
        this.gateway.server.emit('dashboard:new-message', message);
      }
    } catch (err) {
      this.logger.warn(`Failed to broadcast message via WebSocket: ${err.message}`);
    }

    return message;
  }

  getMessages(userId?: string, channel?: Channel): MockMessage[] {
    return this.messages.filter((msg) => {
      if (userId && msg.userId !== userId) return false;
      if (channel && msg.channel !== channel) return false;
      return true;
    });
  }

  clearMessages(userId?: string): void {
    if (userId) {
      const remaining = this.messages.filter((msg) => msg.userId !== userId);
      this.messages.length = 0;
      this.messages.push(...remaining);
    } else {
      this.messages.length = 0;
    }
  }

  private broadcastStatusChange(status: ChannelControlStatus) {
    try {
      if (this.gateway?.server) {
        this.gateway.server.emit('channels:status-changed', status);
      }
    } catch (err) {
      this.logger.warn(`Failed to emit status change: ${err.message}`);
    }
  }
}
