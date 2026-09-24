import {
  Controller,
  Post,
  Get,
  Put,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TenantId } from '../auth/tenant.decorator';
import { Channel } from '../common/enums';

@Controller('users')
@UseGuards(ApiKeyGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(
    @TenantId() tenantId: string,
    @Body()
    body: {
      externalId: string;
      email?: string;
      phone?: string;
    },
  ) {
    return this.usersService.create(tenantId, body);
  }

  @Get()
  async findAll(@TenantId() tenantId: string) {
    return this.usersService.findAll(tenantId);
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @TenantId() tenantId: string,
  ) {
    return this.usersService.findById(id, tenantId);
  }

  @Put(':id/preferences')
  async updatePreferences(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body()
    body: {
      pushEnabled?: boolean;
      emailEnabled?: boolean;
      smsEnabled?: boolean;
      channelOrder?: Channel[];
    },
  ) {
    return this.usersService.updatePreferences(id, tenantId, body);
  }
}
