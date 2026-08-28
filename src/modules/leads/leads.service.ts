import { Injectable, NotFoundException } from '@nestjs/common';
import { AnalyticsEventType, AuditAction, LeadSource, Prisma, type LeadStatus } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService, type AuditContext } from '../audit/audit.service';
import { buildPagination, skipTake, type Paginated } from '@/common/utils/pagination.util';
import type {
  CreateLeadDto,
  CreatePublicLeadDto,
  ListLeadsDto,
  UpdateLeadDto,
  UpdateLeadStatusDto,
} from './dto/lead.schemas';

const LEAD_INCLUDE = {
  product: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.LeadInclude;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListLeadsDto): Promise<Paginated<any>> {
    const where = this.buildWhere(query);

    const [total, data, statusCounts] = await this.prisma.$transaction([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        orderBy:
          query.sort === 'oldest'
            ? { createdAt: 'asc' }
            : query.sort === 'name_asc'
              ? { name: 'asc' }
              : { createdAt: 'desc' },
        ...skipTake(query.page, query.perPage),
        include: LEAD_INCLUDE,
      }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
    ]);

    return {
      data,
      meta: {
        ...buildPagination(query.page, query.perPage, total),
        ...({
          statusCounts: Object.fromEntries(
            statusCounts.map((row) => [row.status, (row._count as { _all: number })._all]),
          ),
        } as any),
      },
    };
  }

  async findById(id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id },
      include: {
        ...LEAD_INCLUDE,
        history: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
    if (!lead) throw new NotFoundException('Contato nao encontrado.');
    return lead;
  }

  /** Criacao a partir do formulario publico "Tenho interesse". */
  async createFromSite(dto: CreatePublicLeadDto, meta: { ip?: string; userAgent?: string }) {
    const lead = await this.prisma.lead.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email || null,
        productId: dto.productId ?? null,
        message: dto.message || null,
        source: dto.productId ? LeadSource.PRODUCT_INTEREST : LeadSource.SITE_FORM,
      },
    });

    await this.prisma.leadHistory.create({
      data: { leadId: lead.id, toStatus: lead.status, note: 'Contato recebido pelo site' },
    });

    if (dto.productId) {
      await this.prisma.product
        .update({ where: { id: dto.productId }, data: { leadCount: { increment: 1 } } })
        .catch(() => undefined);
    }

    await this.prisma.analyticsEvent
      .create({
        data: {
          type: AnalyticsEventType.LEAD_SUBMIT,
          productId: dto.productId ?? null,
        },
      })
      .catch(() => undefined);

    return { success: true, id: lead.id };
  }

  async create(dto: CreateLeadDto, ctx: AuditContext) {
    const lead = await this.prisma.lead.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email || null,
        productId: dto.productId ?? null,
        message: dto.message,
        source: dto.source,
        status: dto.status,
        notes: dto.notes,
      },
      include: LEAD_INCLUDE,
    });

    await this.prisma.leadHistory.create({
      data: {
        leadId: lead.id,
        userId: ctx.userId ?? null,
        toStatus: lead.status,
        note: 'Contato cadastrado manualmente',
      },
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.CREATE,
      entity: 'Lead',
      entityId: lead.id,
      summary: `Contato criado: ${lead.name}`,
    });

    return lead;
  }

  async update(id: string, dto: UpdateLeadDto, ctx: AuditContext) {
    const current = await this.prisma.lead.findFirst({ where: { id } });
    if (!current) throw new NotFoundException('Contato nao encontrado.');

    const lead = await this.prisma.lead.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email || null } : {}),
        ...(dto.productId !== undefined ? { productId: dto.productId ?? null } : {}),
        ...(dto.message !== undefined ? { message: dto.message } : {}),
        ...(dto.source !== undefined ? { source: dto.source } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: LEAD_INCLUDE,
    });

    if (dto.status && dto.status !== current.status) {
      await this.prisma.leadHistory.create({
        data: {
          leadId: id,
          userId: ctx.userId ?? null,
          fromStatus: current.status,
          toStatus: dto.status,
          note: 'Status alterado na edicao do contato',
        },
      });
    }

    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'Lead',
      entityId: id,
      summary: `Contato atualizado: ${lead.name}`,
      changes: AuditService.diff(current, lead),
    });

    return lead;
  }

  async changeStatus(id: string, dto: UpdateLeadStatusDto, ctx: AuditContext) {
    const current = await this.prisma.lead.findFirst({ where: { id } });
    if (!current) throw new NotFoundException('Contato nao encontrado.');

    const lead = await this.prisma.lead.update({
      where: { id },
      data: { status: dto.status },
      include: LEAD_INCLUDE,
    });

    await this.prisma.leadHistory.create({
      data: {
        leadId: id,
        userId: ctx.userId ?? null,
        fromStatus: current.status,
        toStatus: dto.status,
        note: dto.note,
      },
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.STATUS_CHANGE,
      entity: 'Lead',
      entityId: id,
      summary: `Status do contato "${lead.name}": ${current.status} -> ${dto.status}`,
    });

    return lead;
  }

  async addNote(id: string, note: string, ctx: AuditContext) {
    const lead = await this.prisma.lead.findFirst({ where: { id } });
    if (!lead) throw new NotFoundException('Contato nao encontrado.');

    await this.prisma.leadHistory.create({
      data: { leadId: id, userId: ctx.userId ?? null, note },
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'Lead',
      entityId: id,
      summary: `Observacao adicionada ao contato ${lead.name}`,
    });

    return this.findById(id);
  }

  async remove(id: string, ctx: AuditContext) {
    const lead = await this.prisma.lead.findFirst({ where: { id, deletedAt: null } });
    if (!lead) throw new NotFoundException('Contato nao encontrado.');

    await this.prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.record({
      ...ctx,
      action: AuditAction.DELETE,
      entity: 'Lead',
      entityId: id,
      summary: `Contato excluido: ${lead.name}`,
    });

    return { success: true };
  }

  /** Exportacao CSV respeitando os filtros ativos na tela. */
  async exportCsv(query: ListLeadsDto): Promise<string> {
    const leads = await this.prisma.lead.findMany({
      where: this.buildWhere(query),
      orderBy: { createdAt: 'desc' },
      include: LEAD_INCLUDE,
      take: 5000,
    });

    const statusLabels: Record<LeadStatus, string> = {
      NEW: 'Novo',
      IN_PROGRESS: 'Em atendimento',
      PROPOSAL_SENT: 'Proposta enviada',
      CONVERTED: 'Convertido',
      LOST: 'Perdido',
    };

    const header = ['Nome', 'Telefone', 'E-mail', 'Produto', 'Mensagem', 'Origem', 'Status', 'Data'];
    const rows = leads.map((lead) => [
      lead.name,
      lead.phone ?? '',
      lead.email ?? '',
      lead.product?.name ?? '',
      (lead.message ?? '').replace(/\s+/g, ' '),
      lead.source,
      statusLabels[lead.status],
      lead.createdAt.toLocaleString('pt-BR'),
    ]);

    return [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
  }

  private buildWhere(query: ListLeadsDto): Prisma.LeadWhereInput {
    return {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
              { message: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }
}

/** Escapa o valor para CSV (delimitador ; compativel com Excel pt-BR). */
function csvCell(value: string): string {
  const text = String(value ?? '');
  // Impede que planilhas interpretem o conteudo como formula.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
