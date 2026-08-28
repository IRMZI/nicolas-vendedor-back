import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService, type AuditContext } from '../audit/audit.service';
import type { CreateBannerDto, ListBannersDto, UpdateBannerDto } from './dto/banner.schemas';

@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListBannersDto) {
    const where: Prisma.BannerWhereInput = {
      deletedAt: null,
      ...(query.isActive ? { isActive: query.isActive === 'true' } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    return this.prisma.banner.findMany({ where, orderBy: [{ position: 'asc' }, { createdAt: 'desc' }] });
  }

  async findById(id: string) {
    const banner = await this.prisma.banner.findFirst({ where: { id, deletedAt: null } });
    if (!banner) throw new NotFoundException('Banner nao encontrado.');
    return banner;
  }

  async create(dto: CreateBannerDto, ctx: AuditContext) {
    const banner = await this.prisma.banner.create({ data: dto });
    await this.audit.record({
      ...ctx,
      action: AuditAction.CREATE,
      entity: 'Banner',
      entityId: banner.id,
      summary: `Banner criado: ${banner.title}`,
    });
    return banner;
  }

  async update(id: string, dto: UpdateBannerDto, ctx: AuditContext) {
    const current = await this.findById(id);
    const banner = await this.prisma.banner.update({ where: { id }, data: dto });
    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'Banner',
      entityId: id,
      summary: `Banner atualizado: ${banner.title}`,
      changes: AuditService.diff(current, banner),
    });
    return banner;
  }

  async setActive(id: string, isActive: boolean, ctx: AuditContext) {
    await this.findById(id);
    const banner = await this.prisma.banner.update({ where: { id }, data: { isActive } });
    await this.audit.record({
      ...ctx,
      action: AuditAction.STATUS_CHANGE,
      entity: 'Banner',
      entityId: id,
      summary: `Banner "${banner.title}" ${isActive ? 'ativado' : 'desativado'}`,
    });
    return banner;
  }

  async reorder(items: Array<{ id: string; position: number }>, ctx: AuditContext) {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.banner.update({ where: { id: item.id }, data: { position: item.position } }),
      ),
    );
    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'Banner',
      summary: `Ordem de ${items.length} banner(s) atualizada`,
    });
    return { success: true };
  }

  async remove(id: string, ctx: AuditContext) {
    const banner = await this.findById(id);
    await this.prisma.banner.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.audit.record({
      ...ctx,
      action: AuditAction.DELETE,
      entity: 'Banner',
      entityId: id,
      summary: `Banner excluido: ${banner.title}`,
    });
    return { success: true };
  }

  /** Banners visiveis agora no site publico (respeita janela de agendamento). */
  async activeForSite() {
    const now = new Date();
    return this.prisma.banner.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    });
  }
}
