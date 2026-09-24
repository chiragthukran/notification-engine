import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from '../database/entities/api-key.entity';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepo: Repository<ApiKey>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const key = request.headers['x-api-key'];

    if (!key) {
      throw new UnauthorizedException('Missing x-api-key header');
    }

    const apiKey = await this.apiKeyRepo.findOne({
      where: { key, active: true },
      relations: ['tenant'],
    });

    if (!apiKey) {
      throw new UnauthorizedException('Invalid or inactive API key');
    }

    // Attach tenant to request for downstream use
    request.tenant = apiKey.tenant;
    request.tenantId = apiKey.tenant.id;

    return true;
  }
}
