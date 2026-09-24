import { Injectable, NotFoundException, ConflictException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { UserPreference } from '../database/entities/user-preference.entity';
import { Notification } from '../database/entities/notification.entity';
import { Channel, DEFAULT_CHANNEL_ORDER } from '../common/enums';
import { ChannelControlService } from '../channels/channel-control.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserPreference)
    private readonly prefRepo: Repository<UserPreference>,
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    @Inject(forwardRef(() => ChannelControlService))
    private readonly channelControl: ChannelControlService,
  ) {}

  async create(
    tenantId: string,
    data: {
      externalId: string;
      email?: string;
      phone?: string;
    },
  ) {
    const existing = await this.userRepo.findOne({
      where: { tenantId, externalId: data.externalId },
    });
    if (existing) {
      throw new ConflictException(
        `User with externalId "${data.externalId}" already exists for this tenant`,
      );
    }

    const user = this.userRepo.create({
      tenantId,
      externalId: data.externalId,
      email: data.email,
      phone: data.phone,
    });
    await this.userRepo.save(user);

    const preference = this.prefRepo.create({
      userId: user.id,
      pushEnabled: true,
      emailEnabled: true,
      smsEnabled: true,
      channelOrder: DEFAULT_CHANNEL_ORDER,
    });
    await this.prefRepo.save(preference);

    return this.findById(user.id, tenantId);
  }

  async findById(id: string, tenantId: string) {
    const user = await this.userRepo.findOne({
      where: { id, tenantId },
      relations: ['preference'],
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByIdDirect(id: string) {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['preference'],
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByExternalId(externalId: string, tenantId: string) {
    return this.userRepo.findOne({
      where: { externalId, tenantId },
      relations: ['preference'],
    });
  }

  async findAll(tenantId: string) {
    return this.userRepo.find({
      where: { tenantId },
      relations: ['preference'],
      order: { createdAt: 'DESC' },
    });
  }

  async findPublicAll() {
    return this.userRepo.find({
      relations: ['preference'],
      order: { createdAt: 'ASC' },
    });
  }

  async updatePreferences(
    userId: string,
    tenantId: string,
    data: {
      pushEnabled?: boolean;
      emailEnabled?: boolean;
      smsEnabled?: boolean;
      channelOrder?: Channel[];
    },
  ) {
    const user = await this.findById(userId, tenantId);
    return this.applyPreferences(user, data);
  }

  async updatePreferencesDirect(
    userId: string,
    data: {
      pushEnabled?: boolean;
      emailEnabled?: boolean;
      smsEnabled?: boolean;
      channelOrder?: Channel[];
    },
  ) {
    const user = await this.findByIdDirect(userId);
    return this.applyPreferences(user, data);
  }

  private async applyPreferences(
    user: User,
    data: {
      pushEnabled?: boolean;
      emailEnabled?: boolean;
      smsEnabled?: boolean;
      channelOrder?: Channel[];
    },
  ) {
    let preference = user.preference;

    if (!preference) {
      preference = this.prefRepo.create({ userId: user.id });
    }

    if (data.pushEnabled !== undefined) preference.pushEnabled = data.pushEnabled;
    if (data.emailEnabled !== undefined) preference.emailEnabled = data.emailEnabled;
    if (data.smsEnabled !== undefined) preference.smsEnabled = data.smsEnabled;
    if (data.channelOrder) preference.channelOrder = data.channelOrder;

    await this.prefRepo.save(preference);
    return this.findByIdDirect(user.id);
  }

  getEligibleChannels(preference: UserPreference): Channel[] {
    const channelEnabledMap: Record<Channel, boolean> = {
      [Channel.PUSH]: preference.pushEnabled,
      [Channel.EMAIL]: preference.emailEnabled,
      [Channel.SMS]: preference.smsEnabled,
    };

    return (preference.channelOrder || DEFAULT_CHANNEL_ORDER).filter(
      (ch) => channelEnabledMap[ch],
    );
  }

  async getUserInbox(userId: string) {
    const user = await this.findByIdDirect(userId);

    const notifications = await this.notifRepo.find({
      where: { userId },
      relations: ['deliveryAttempts'],
      order: { createdAt: 'DESC' },
      take: 50,
    });

    const mockMessages = this.channelControl.getMessages(userId);

    return {
      user,
      notifications,
      mockMessages,
    };
  }
}
