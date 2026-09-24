import { Channel, Priority } from '../common/enums';
import { Notification } from '../database/entities/notification.entity';
import { UserPreference } from '../database/entities/user-preference.entity';
import { User } from '../database/entities/user.entity';

/** Result of a single channel delivery attempt cycle (including retries) */
export interface ChannelDeliveryResult {
  channel: Channel;
  success: boolean;
  attempts: number;
  error?: string;
  /** If true, delivery is pending (e.g. user offline for push) */
  pending?: boolean;
}

/** Result of the full notification delivery process */
export interface DeliveryResult {
  notificationId: string;
  delivered: boolean;
  skipped: boolean;
  pending: boolean;
  channelResults: ChannelDeliveryResult[];
}

/** Interface that each priority strategy must implement */
export interface DeliveryStrategy {
  execute(
    notification: Notification,
    user: User,
    preference: UserPreference,
    eligibleChannels: Channel[],
  ): Promise<DeliveryResult>;
}

/** Interface for channel providers (push, email, sms) */
export interface ChannelProvider {
  send(
    notification: Notification,
    user: User,
  ): Promise<{ success: boolean; error?: string }>;
}
