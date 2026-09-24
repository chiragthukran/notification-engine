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
   * No auth required — this is the registration endpoint.
   */
  @Post()
  async create(@Body() body: { name: string; description?: string }) {
    const result = await this.tenantsService.create(body.name, body.description);
    return {
      message: 'Tenant created successfully. Save your API key — it will not be shown again.',
      tenant: result.tenant,
      apiKey: result.apiKey,
    };
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
