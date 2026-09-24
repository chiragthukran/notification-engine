import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { QueueModule } from './queue/queue.module';
import { EngineModule } from './engine/engine.module';
import { ChannelsModule } from './channels/channels.module';
import { WebsocketModule } from './websocket/websocket.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    // Global configuration from .env
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Core infrastructure
    DatabaseModule,
    AuthModule,

    // Feature modules
    TenantsModule,
    UsersModule,
    NotificationsModule,

    // Notification processing pipeline
    QueueModule,
    EngineModule,
    ChannelsModule,
    WebsocketModule,

    // Dashboard API
    DashboardModule,
  ],
})
export class AppModule {}
