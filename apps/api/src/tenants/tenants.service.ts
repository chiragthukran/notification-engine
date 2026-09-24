import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../database/entities/tenant.entity';
import { ApiKey } from '../database/entities/api-key.entity';
import { User } from '../database/entities/user.entity';
import { UserPreference } from '../database/entities/user-preference.entity';
import { DEFAULT_CHANNEL_ORDER, Channel } from '../common/enums';
import * as crypto from 'crypto';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(ApiKey)
    private readonly apiKeyRepo: Repository<ApiKey>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserPreference)
    private readonly prefRepo: Repository<UserPreference>,
  ) {}

  async create(name: string, description?: string) {
    const tenant = this.tenantRepo.create({ name, description });
    await this.tenantRepo.save(tenant);

    // Generate an API key for the tenant
    const rawKey = `nx_${crypto.randomBytes(24).toString('hex')}`;
    const apiKey = this.apiKeyRepo.create({
      tenantId: tenant.id,
      key: rawKey,
      active: true,
    });
    await this.apiKeyRepo.save(apiKey);

    return { tenant, apiKey: rawKey };
  }

  async findById(id: string) {
    return this.tenantRepo.findOne({ where: { id } });
  }

  async findAll() {
    return this.tenantRepo.find({ order: { createdAt: 'DESC' } });
  }

  /**
   * Returns tenants with their active API keys and associated demo users
   * to populate the Tenant and User dashboard dropdowns cleanly.
   */
  async getOverview() {
    const tenants = await this.tenantRepo.find({ order: { createdAt: 'ASC' } });
    const result = [];

    for (const tenant of tenants) {
      const activeKey = await this.apiKeyRepo.findOne({
        where: { tenantId: tenant.id, active: true },
        order: { createdAt: 'DESC' },
      });

      const users = await this.userRepo.find({
        where: { tenantId: tenant.id },
        relations: ['preference'],
        order: { createdAt: 'ASC' },
      });

      result.push({
        id: tenant.id,
        name: tenant.name,
        description: tenant.description,
        createdAt: tenant.createdAt,
        apiKey: activeKey?.key || null,
        users,
      });
    }

    return result;
  }

  /**
   * Seeds demo data if empty, ensuring at least one tenant with 3 diverse test users.
   */
  async seedDemoData() {
    let tenant = await this.tenantRepo.findOne({
      where: { name: 'Acme Corp' },
    });

    let rawKey: string;

    if (!tenant) {
      const res = await this.create('Acme Corp', 'Primary E-Commerce Platform');
      tenant = res.tenant;
      rawKey = res.apiKey;
    } else {
      let keyRecord = await this.apiKeyRepo.findOne({
        where: { tenantId: tenant.id, active: true },
      });
      if (!keyRecord) {
        rawKey = `nx_${crypto.randomBytes(24).toString('hex')}`;
        keyRecord = this.apiKeyRepo.create({
          tenantId: tenant.id,
          key: rawKey,
          active: true,
        });
        await this.apiKeyRepo.save(keyRecord);
      } else {
        rawKey = keyRecord.key;
      }
    }

    // Seed 3 test users if they don't already exist
    const demoUsers = [
      {
        externalId: 'alice-01',
        email: 'alice@example.com',
        phone: '+1-555-0101',
        name: 'Alice Johnson (All Channels)',
        push: true,
        emailPref: true,
        smsPref: true,
        order: [Channel.PUSH, Channel.EMAIL, Channel.SMS],
      },
      {
        externalId: 'bob-02',
        email: 'bob@example.com',
        phone: '+1-555-0202',
        name: 'Bob Smith (Email & SMS only)',
        push: false,
        emailPref: true,
        smsPref: true,
        order: [Channel.EMAIL, Channel.SMS, Channel.PUSH],
      },
      {
        externalId: 'charlie-03',
        email: 'charlie@example.com',
        phone: '+1-555-0303',
        name: 'Charlie Davis (Push only)',
        push: true,
        emailPref: false,
        smsPref: false,
        order: [Channel.PUSH, Channel.EMAIL, Channel.SMS],
      },
    ];

    for (const u of demoUsers) {
      let user = await this.userRepo.findOne({
        where: { tenantId: tenant.id, externalId: u.externalId },
      });

      if (!user) {
        user = this.userRepo.create({
          tenantId: tenant.id,
          externalId: u.externalId,
          email: u.email,
          phone: u.phone,
        });
        await this.userRepo.save(user);

        const pref = this.prefRepo.create({
          userId: user.id,
          pushEnabled: u.push,
          emailEnabled: u.emailPref,
          smsEnabled: u.smsPref,
          channelOrder: u.order,
        });
        await this.prefRepo.save(pref);
      }
    }

    return this.getOverview();
  }
}
