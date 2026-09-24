import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { UserPreference } from '../database/entities/user-preference.entity';
import { Channel, DEFAULT_CHANNEL_ORDER } from '../common/enums';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserPreference)
    private readonly prefRepo: Repository<UserPreference>,
  ) {}

  async create(
    tenantId: string,
    data: {
      externalId: string;
      email?: string;
      phone?: string;
    },
  ) {
    // Check for duplicate external_id within this tenant
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

    // Create default preferences (all channels enabled, default order)
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

  async findByExternalId(externalId: string, tenantId: string) {
    const user = await this.userRepo.findOne({
      where: { externalId, tenantId },
      relations: ['preference'],
    });
    return user;
  }

  async findAll(tenantId: string) {
    return this.userRepo.find({
      where: { tenantId },
      relations: ['preference'],
      order: { createdAt: 'DESC' },
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
    let preference = user.preference;

    if (!preference) {
      preference = this.prefRepo.create({ userId: user.id });
    }

    if (data.pushEnabled !== undefined) preference.pushEnabled = data.pushEnabled;
    if (data.emailEnabled !== undefined) preference.emailEnabled = data.emailEnabled;
    if (data.smsEnabled !== undefined) preference.smsEnabled = data.smsEnabled;
    if (data.channelOrder) preference.channelOrder = data.channelOrder;

    await this.prefRepo.save(preference);
    return this.findById(userId, tenantId);
  }

  /**
   * Returns the ordered list of enabled channels for a user,
   * respecting their preference settings.
   */
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
}
