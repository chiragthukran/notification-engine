import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Tenant } from './entities/tenant.entity';
import { ApiKey } from './entities/api-key.entity';
import { User } from './entities/user.entity';
import { UserPreference } from './entities/user-preference.entity';
import { Notification } from './entities/notification.entity';
import { DeliveryAttempt } from './entities/delivery-attempt.entity';

export const ALL_ENTITIES = [
  Tenant,
  ApiKey,
  User,
  UserPreference,
  Notification,
  DeliveryAttempt,
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get('database.port'),
        username: config.get('database.username'),
        password: config.get('database.password'),
        database: config.get('database.database'),
        entities: ALL_ENTITIES,
        synchronize: true, // Auto-create tables in dev — disable in production
        logging: false,
      }),
    }),
    TypeOrmModule.forFeature(ALL_ENTITIES),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
