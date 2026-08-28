import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { BannersService } from './banners.service';
import { zodPipe } from '@/common/pipes/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { getClientIp, getUserAgent } from '@/common/utils/request.util';
import {
  createBannerSchema,
  listBannersSchema,
  updateBannerSchema,
  type CreateBannerDto,
  type ListBannersDto,
  type UpdateBannerDto,
} from './dto/banner.schemas';

const activeSchema = z.object({ isActive: z.boolean() });
const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), position: z.number().int().min(0) })).min(1),
});

@Controller('admin/banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Get()
  list(@Query(zodPipe(listBannersSchema)) query: ListBannersDto) {
    return this.bannersService.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bannersService.findById(id);
  }

  @Post()
  create(
    @Body(zodPipe(createBannerSchema)) dto: CreateBannerDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.bannersService.create(dto, this.ctx(req, user));
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(updateBannerSchema)) dto: UpdateBannerDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.bannersService.update(id, dto, this.ctx(req, user));
  }

  @Patch(':id/active')
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(activeSchema)) dto: z.infer<typeof activeSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.bannersService.setActive(id, dto.isActive, this.ctx(req, user));
  }

  @Post('reorder')
  reorder(
    @Body(zodPipe(reorderSchema)) dto: z.infer<typeof reorderSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.bannersService.reorder(dto.items, this.ctx(req, user));
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.bannersService.remove(id, this.ctx(req, user));
  }

  private ctx(req: Request, user: AuthenticatedUser) {
    return { userId: user.id, userName: user.name, ip: getClientIp(req), userAgent: getUserAgent(req) };
  }
}
