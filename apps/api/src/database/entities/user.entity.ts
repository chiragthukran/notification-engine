import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { UserPreference } from './user-preference.entity';
import { Notification } from './notification.entity';

@Entity('users')
@Index(['tenantId', 'externalId'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Tenant's own identifier for this user */
  @Column({ name: 'external_id', type: 'varchar', length: 255 })
  externalId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Tenant, (tenant) => tenant.users, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @OneToOne(() => UserPreference, (pref) => pref.user, { cascade: true })
  preference: UserPreference;

  @OneToMany(() => Notification, (notification) => notification.user)
  notifications: Notification[];
}
