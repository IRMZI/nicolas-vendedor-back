import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { buildPagination, skipTake, type Paginated } from '@/common/utils/pagination.util';

export interface AuditContext {
  userId?: string;
  userName?: string;
  ip?: string;
  userAgent?: string;
}

export interface RecordAuditInput extends AuditContext {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  summary?: string;
  changes?: object;
}

export interface ListAuditQuery {
  page: number;
  perPage: number;
  action?: AuditAction;
  entity?: string;
  userId?: string;
  search?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra uma acao administrativa. Nunca lanca erro para nao
   * derrubar a operacao principal caso a auditoria falhe.
   */
  async record(input: RecordAuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: input.userId ?? null,
          userName: input.userName ?? null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId ?? null,
          summary: input.summary ?? null,
          changes: (input.changes as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Falha ao registrar auditoria (${input.action} ${input.entity}): ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
    }
  }

  async list(query: ListAuditQuery): Promise<Paginated<any>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
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
              { summary: { contains: query.search, mode: 'insensitive' } },
              { userName: { contains: query.search, mode: 'insensitive' } },
              { entity: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(query.page, query.perPage),
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    return { data, meta: buildPagination(query.page, query.perPage, total) };
  }

  async entities(): Promise<string[]> {
    const rows = await this.prisma.auditLog.findMany({
      distinct: ['entity'],
      select: { entity: true },
      orderBy: { entity: 'asc' },
    });
    return rows.map((row) => row.entity);
  }

  /**
   * Compara dois objetos e devolve apenas os campos alterados,
   * para exibir um resumo legivel no painel.
   */
  static diff(
    before: Record<string, any> | null,
    after: Record<string, any> | null,
  ): Record<string, { de: unknown; para: unknown }> {
    const changes: Record<string, { de: unknown; para: unknown }> = {};
    if (!before || !after) return changes;

    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (['updatedAt', 'createdAt', 'passwordHash'].includes(key)) continue;
      const from = normalize(before[key]);
      const to = normalize(after[key]);
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        changes[key] = { de: from, para: to };
      }
    }
    return changes;
  }
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && 'toNumber' in (value as any)) {
    return Number((value as any).toString());
  }
  return value;
}
