import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /**
   * Register a new tenant. Returns the tenant and its API key.
   */
  @Post()
  async create(@Body() body: { name: string; description?: string }) {
    const result = await this.tenantsService.create(body.name, body.description);
    return {
      message: 'Tenant created successfully. Save your API key.',
      tenant: result.tenant,
      apiKey: result.apiKey,
    };
  }

  /**
   * Seed demo tenant and users for testing fallback and multi-channel delivery.
   */
  @Post('seed-demo')
  async seedDemo() {
    return this.tenantsService.seedDemoData();
  }

  /**
   * Returns overview of tenants with active API keys and users
   * for the dashboard testing UI.
   */
  @Get('overview')
  async getOverview() {
    return this.tenantsService.getOverview();
  }

  @Get()
  async findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const tenant = await this.tenantsService.findById(id);
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }
}
