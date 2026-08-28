import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService, type AuditContext } from '../audit/audit.service';
import { z } from 'zod';

export const updateHomeSectionSchema = z.object({
  title: z.string().trim().min(2, 'Informe o titulo').max(160),
  subtitle: z
    .string()
    .trim()
    .max(300)
    .optional()
    .nullable()
    .transform((value) => (value && value !== '' ? value : null)),
  isEnabled: z.boolean(),
  position: z.coerce.number().int().min(0).default(0),
  config: z.record(z.any()).optional().nullable(),
});

export type UpdateHomeSectionDto = z.infer<typeof updateHomeSectionSchema>;

@Injectable()
export class HomeSectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return this.prisma.homeSection.findMany({ orderBy: { position: 'asc' } });
  }

  async enabled() {
    return this.prisma.homeSection.findMany({
      where: { isEnabled: true },
      orderBy: { position: 'asc' },
    });
  }

  async update(key: string, dto: UpdateHomeSectionDto, ctx: AuditContext) {
    const current = await this.prisma.homeSection.findUnique({ where: { key } });
    if (!current) throw new NotFoundException('Secao nao encontrada.');

    const section = await this.prisma.homeSection.update({
      where: { key },
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        isEnabled: dto.isEnabled,
        position: dto.position,
        config: dto.config ?? undefined,
      },
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'HomeSection',
      entityId: section.id,
      summary: `Secao da home "${section.title}" atualizada (${section.isEnabled ? 'ativa' : 'inativa'})`,
      changes: AuditService.diff(current, section),
    });

    return section;
  }

  async reorder(items: Array<{ key: string; position: number }>, ctx: AuditContext) {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.homeSection.update({ where: { key: item.key }, data: { position: item.position } }),
      ),
    );
    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'HomeSection',
      summary: `Ordem de ${items.length} secao(oes) da home atualizada`,
    });
    return { success: true };
  }
}
