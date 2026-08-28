import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { LeadsService } from './leads.service';
import { zodPipe } from '@/common/pipes/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { getClientIp, getUserAgent } from '@/common/utils/request.util';
import {
  createLeadSchema,
  listLeadsSchema,
  updateLeadSchema,
  updateLeadStatusSchema,
  type CreateLeadDto,
  type ListLeadsDto,
  type UpdateLeadDto,
  type UpdateLeadStatusDto,
} from './dto/lead.schemas';

const noteSchema = z.object({ note: z.string().trim().min(1, 'Escreva a observacao').max(1000) });

@Controller('admin/leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  list(@Query(zodPipe(listLeadsSchema)) query: ListLeadsDto) {
    return this.leadsService.list(query);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(@Query(zodPipe(listLeadsSchema)) query: ListLeadsDto, @Res() res: Response) {
    const csv = await this.leadsService.exportCsv(query);
    const filename = `contatos-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // BOM para o Excel reconhecer UTF-8.
    res.send(`﻿${csv}`);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.leadsService.findById(id);
  }

  @Post()
  create(
    @Body(zodPipe(createLeadSchema)) dto: CreateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.leadsService.create(dto, this.ctx(req, user));
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(updateLeadSchema)) dto: UpdateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.leadsService.update(id, dto, this.ctx(req, user));
  }

  @Patch(':id/status')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(updateLeadStatusSchema)) dto: UpdateLeadStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.leadsService.changeStatus(id, dto, this.ctx(req, user));
  }

  @Post(':id/notes')
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(noteSchema)) dto: z.infer<typeof noteSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.leadsService.addNote(id, dto.note, this.ctx(req, user));
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.leadsService.remove(id, this.ctx(req, user));
  }

  private ctx(req: Request, user: AuthenticatedUser) {
    return { userId: user.id, userName: user.name, ip: getClientIp(req), userAgent: getUserAgent(req) };
  }
}
