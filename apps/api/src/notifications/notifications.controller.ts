import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TenantId } from '../auth/tenant.decorator';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationStatus, Priority } from '../common/enums';

@Controller('notifications')
@UseGuards(ApiKeyGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateNotificationDto,
  ) {
    const notification = await this.notificationsService.create(tenantId, dto);
    return {
      message: 'Notification queued for delivery',
      notification,
    };
  }

  @Get()
  async findAll(
    @TenantId() tenantId: string,
    @Query('status') status?: NotificationStatus,
    @Query('priority') priority?: Priority,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.findAll(tenantId, {
      status,
      priority,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @TenantId() tenantId: string,
  ) {
    return this.notificationsService.findById(id, tenantId);
  }
}
