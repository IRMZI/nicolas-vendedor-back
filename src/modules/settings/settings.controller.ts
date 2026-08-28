import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SettingsService } from './settings.service';
import { zodPipe } from '@/common/pipes/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { getClientIp, getUserAgent } from '@/common/utils/request.util';
import { updateSettingsSchema, type UpdateSettingsDto } from './dto/settings.schemas';

@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get() {
    return this.settingsService.get();
  }

  @Put()
  update(
    @Body(zodPipe(updateSettingsSchema)) dto: UpdateSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.settingsService.update(dto, {
      userId: user.id,
      userName: user.name,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }
}
