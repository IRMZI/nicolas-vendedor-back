import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import {
  HomeSectionsService,
  updateHomeSectionSchema,
  type UpdateHomeSectionDto,
} from './home-sections.service';
import { zodPipe } from '@/common/pipes/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { getClientIp, getUserAgent } from '@/common/utils/request.util';

const reorderSchema = z.object({
  items: z.array(z.object({ key: z.string().min(1), position: z.number().int().min(0) })).min(1),
});

@Controller('admin/home-sections')
export class HomeSectionsController {
  constructor(private readonly homeSectionsService: HomeSectionsService) {}

  @Get()
  list() {
    return this.homeSectionsService.list();
  }

  @Put(':key')
  update(
    @Param('key') key: string,
    @Body(zodPipe(updateHomeSectionSchema)) dto: UpdateHomeSectionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.homeSectionsService.update(key, dto, this.ctx(req, user));
  }

  @Post('reorder')
  reorder(
    @Body(zodPipe(reorderSchema)) dto: z.infer<typeof reorderSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.homeSectionsService.reorder(dto.items, this.ctx(req, user));
  }

  private ctx(req: Request, user: AuthenticatedUser) {
    return { userId: user.id, userName: user.name, ip: getClientIp(req), userAgent: getUserAgent(req) };
  }
}
