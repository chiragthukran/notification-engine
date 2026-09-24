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
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Public endpoint to list all demo users for the User Dashboard simulator.
   */
  @Get('public-list')
  async findPublicAll() {
    return this.usersService.findPublicAll();
  }

  /**
   * Public endpoint to get a user's full inbox (notifications + mock emails/SMS/push).
   */
  @Get(':id/inbox')
  async getUserInbox(@Param('id') id: string) {
    return this.usersService.getUserInbox(id);
  }

  /**
   * Public endpoint for user dashboard to update notification preferences.
   */
  @Put(':id/public-preferences')
  async updatePublicPreferences(
    @Param('id') id: string,
    @Body()
    body: {
      pushEnabled?: boolean;
      emailEnabled?: boolean;
      smsEnabled?: boolean;
      channelOrder?: Channel[];
    },
  ) {
    return this.usersService.updatePreferencesDirect(id, body);
  }

  // --- Tenant-authenticated endpoints ---

  @Post()
  @UseGuards(ApiKeyGuard)
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
  @UseGuards(ApiKeyGuard)
  async findAll(@TenantId() tenantId: string) {
    return this.usersService.findAll(tenantId);
  }

  @Get(':id')
  @UseGuards(ApiKeyGuard)
  async findById(
    @Param('id') id: string,
    @TenantId() tenantId: string,
  ) {
    return this.usersService.findById(id, tenantId);
  }

  @Put(':id/preferences')
  @UseGuards(ApiKeyGuard)
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
