import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService, type AuditContext } from '../audit/audit.service';
import type {
  CreateTestimonialDto,
  ListTestimonialsDto,
  UpdateTestimonialDto,
} from './dto/testimonial.schemas';

@Injectable()
export class TestimonialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListTestimonialsDto) {
    const where: Prisma.TestimonialWhereInput = {
      deletedAt: null,
      ...(query.isActive ? { isActive: query.isActive === 'true' } : {}),
      ...(query.search
        ? {
            OR: [
              { customerName: { contains: query.search, mode: 'insensitive' } },
              { content: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.prisma.testimonial.findMany({
      where,
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findById(id: string) {
    const testimonial = await this.prisma.testimonial.findFirst({ where: { id, deletedAt: null } });
    if (!testimonial) throw new NotFoundException('Depoimento nao encontrado.');
    return testimonial;
  }

  async create(dto: CreateTestimonialDto, ctx: AuditContext) {
    const testimonial = await this.prisma.testimonial.create({ data: dto });
    await this.audit.record({
      ...ctx,
      action: AuditAction.CREATE,
      entity: 'Testimonial',
      entityId: testimonial.id,
      summary: `Depoimento criado: ${testimonial.customerName}`,
    });
    return testimonial;
  }

  async update(id: string, dto: UpdateTestimonialDto, ctx: AuditContext) {
    const current = await this.findById(id);
    const testimonial = await this.prisma.testimonial.update({ where: { id }, data: dto });
    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'Testimonial',
      entityId: id,
      summary: `Depoimento atualizado: ${testimonial.customerName}`,
      changes: AuditService.diff(current, testimonial),
    });
    return testimonial;
  }

  async setActive(id: string, isActive: boolean, ctx: AuditContext) {
    await this.findById(id);
    const testimonial = await this.prisma.testimonial.update({ where: { id }, data: { isActive } });
    await this.audit.record({
      ...ctx,
      action: AuditAction.STATUS_CHANGE,
      entity: 'Testimonial',
      entityId: id,
      summary: `Depoimento de "${testimonial.customerName}" ${isActive ? 'ativado' : 'desativado'}`,
    });
    return testimonial;
  }

  async reorder(items: Array<{ id: string; position: number }>, ctx: AuditContext) {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.testimonial.update({ where: { id: item.id }, data: { position: item.position } }),
      ),
    );
    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'Testimonial',
      summary: `Ordem de ${items.length} depoimento(s) atualizada`,
    });
    return { success: true };
  }

  async remove(id: string, ctx: AuditContext) {
    const testimonial = await this.findById(id);
    await this.prisma.testimonial.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.audit.record({
      ...ctx,
      action: AuditAction.DELETE,
      entity: 'Testimonial',
      entityId: id,
      summary: `Depoimento excluido: ${testimonial.customerName}`,
    });
    return { success: true };
  }

  async activeForSite() {
    return this.prisma.testimonial.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    });
  }
}
