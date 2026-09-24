import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../database/entities/tenant.entity';
import { ApiKey } from '../database/entities/api-key.entity';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(ApiKey)
    private readonly apiKeyRepo: Repository<ApiKey>,
  ) {}

  async create(name: string, description?: string) {
    const tenant = this.tenantRepo.create({ name, description });
    await this.tenantRepo.save(tenant);

    // Generate a random API key for the tenant
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
}
