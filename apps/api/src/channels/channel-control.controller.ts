import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
} from '@nestjs/common';
import {
  ChannelControlService,
  ChannelControlStatus,
  MockMessage,
} from './channel-control.service';
import { Channel } from '../common/enums';

@Controller('channels')
export class ChannelControlController {
  constructor(private readonly channelControl: ChannelControlService) {}

  @Get('status')
  getStatus(): ChannelControlStatus {
    return this.channelControl.getStatus();
  }

  @Post('toggle')
  toggle(
    @Body() body: { channel: Channel; enabled?: boolean },
  ): ChannelControlStatus {
    return this.channelControl.toggleChannel(body.channel, body.enabled);
  }

  @Post('fast-fallback')
  setFastFallback(
    @Body() body: { enabled: boolean; waitSeconds?: number },
  ): ChannelControlStatus {
    return this.channelControl.setFastFallback(body.enabled, body.waitSeconds);
  }

  @Post('mock-mode')
  toggleMockMode(
    @Body() body: { enabled: boolean },
  ): ChannelControlStatus {
    return this.channelControl.toggleMockMode(body.enabled);
  }

  @Post('reset')
  reset(): ChannelControlStatus {
    return this.channelControl.resetAll();
  }

  @Get('messages')
  getMessages(
    @Query('userId') userId?: string,
    @Query('channel') channel?: Channel,
  ): MockMessage[] {
    return this.channelControl.getMessages(userId, channel);
  }

  @Delete('messages')
  clearMessages(@Query('userId') userId?: string): { success: boolean } {
    this.channelControl.clearMessages(userId);
    return { success: true };
  }
}
