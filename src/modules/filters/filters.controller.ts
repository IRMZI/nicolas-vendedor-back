import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { FiltersService } from './filters.service';
import { zodPipe } from '@/common/pipes/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { getClientIp, getUserAgent } from '@/common/utils/request.util';
import {
  createFilterGroupSchema,
  createFilterOptionSchema,
  reorderSchema,
  updateFilterGroupSchema,
  updateFilterOptionSchema,
  type CreateFilterGroupDto,
  type CreateFilterOptionDto,
  type ReorderDto,
  type UpdateFilterGroupDto,
  type UpdateFilterOptionDto,
} from './dto/filter.schemas';

@Controller('admin/filters')
export class FiltersController {
  constructor(private readonly filtersService: FiltersService) {}

  @Get()
  list() {
    return this.filtersService.list();
  }

  @Post()
  createGroup(
    @Body(zodPipe(createFilterGroupSchema)) dto: CreateFilterGroupDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.filtersService.createGroup(dto, this.ctx(req, user));
  }

  @Put(':id')
  updateGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(updateFilterGroupSchema)) dto: UpdateFilterGroupDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.filtersService.updateGroup(id, dto, this.ctx(req, user));
  }

  @Delete(':id')
  removeGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.filtersService.removeGroup(id, this.ctx(req, user));
  }

  @Post('reorder')
  reorderGroups(
    @Body(zodPipe(reorderSchema)) dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.filtersService.reorderGroups(dto, this.ctx(req, user));
  }

  @Post(':id/options')
  createOption(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(createFilterOptionSchema)) dto: CreateFilterOptionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.filtersService.createOption(id, dto, this.ctx(req, user));
  }

  @Put('options/:optionId')
  updateOption(
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Body(zodPipe(updateFilterOptionSchema)) dto: UpdateFilterOptionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.filtersService.updateOption(optionId, dto, this.ctx(req, user));
  }

  @Delete('options/:optionId')
  removeOption(
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.filtersService.removeOption(optionId, this.ctx(req, user));
  }

  @Post('options/reorder')
  reorderOptions(
    @Body(zodPipe(reorderSchema)) dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.filtersService.reorderOptions(dto, this.ctx(req, user));
  }

  private ctx(req: Request, user: AuthenticatedUser) {
    return { userId: user.id, userName: user.name, ip: getClientIp(req), userAgent: getUserAgent(req) };
  }
}
