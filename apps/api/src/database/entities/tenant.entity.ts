import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { ApiKey } from './api-key.entity';
import { User } from './user.entity';
import { Notification } from './notification.entity';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => ApiKey, (apiKey) => apiKey.tenant)
  apiKeys: ApiKey[];

  @OneToMany(() => User, (user) => user.tenant)
  users: User[];

  @OneToMany(() => Notification, (notification) => notification.tenant)
  notifications: Notification[];
}
