import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyticsEventType, DeviceType, Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { detectDevice, referrerHost } from '@/common/utils/request.util';
import {
  eachDay,
  percentChange,
  previousRange,
  resolveRange,
  toDateKey,
  type DateRange,
  type PeriodPreset,
} from '@/common/utils/date.util';
import type { TrackEventDto } from './dto/analytics.schemas';

/** Eventos que sao deduplicados por visitante dentro de uma janela de tempo. */
const DEDUPED_TYPES = new Set<AnalyticsEventType>([
  AnalyticsEventType.PRODUCT_VIEW,
  AnalyticsEventType.CATEGORY_VIEW,
  AnalyticsEventType.PAGE_VIEW,
]);

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly dedupeMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.dedupeMinutes = Number(this.config.get('ANALYTICS_DEDUPE_MINUTES', 30));
  }

  // -------------------------------------------------------------------------
  // Registro de eventos
  // -------------------------------------------------------------------------

  /**
   * Registra um evento do site publico.
   * Visualizacoes repetidas do mesmo visitante dentro da janela configurada
   * (padrao 30 min) nao sao contadas novamente, evitando inflar as metricas
   * com recarregamentos de pagina.
   */
  async track(
    dto: TrackEventDto,
    meta: { userAgent?: string; ip?: string },
  ): Promise<{ recorded: boolean }> {
    if (DEDUPED_TYPES.has(dto.type) && (dto.anonymousId || dto.sessionId)) {
      const since = new Date(Date.now() - this.dedupeMinutes * 60_000);
      const duplicate = await this.prisma.analyticsEvent.findFirst({
        where: {
          type: dto.type,
          createdAt: { gte: since },
          ...(dto.productId ? { productId: dto.productId } : {}),
          ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
          ...(dto.productId || dto.categoryId ? {} : { path: dto.path ?? null }),
          OR: [
            ...(dto.anonymousId ? [{ anonymousId: dto.anonymousId }] : []),
            ...(dto.sessionId ? [{ sessionId: dto.sessionId }] : []),
          ],
        },
        select: { id: true },
      });

      if (duplicate) return { recorded: false };
    }

    const device: DeviceType = detectDevice(meta.userAgent);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.analyticsEvent.create({
          data: {
            type: dto.type,
            productId: dto.productId ?? null,
            categoryId: dto.categoryId ?? null,
            searchTerm: dto.searchTerm ? dto.searchTerm.toLowerCase().slice(0, 120) : null,
            resultCount: dto.resultCount ?? null,
            path: dto.path ?? null,
            referrer: dto.referrer ?? null,
            referrerHost: referrerHost(dto.referrer),
            device,
            anonymousId: dto.anonymousId ?? null,
            sessionId: dto.sessionId ?? null,
          },
        });

        // Contadores desnormalizados para leitura rapida nas listagens.
        if (dto.productId) {
          const increments: Prisma.ProductUpdateInput = {};
          if (dto.type === AnalyticsEventType.PRODUCT_VIEW) increments.viewCount = { increment: 1 };
          if (dto.type === AnalyticsEventType.WHATSAPP_CLICK)
            increments.whatsappClickCount = { increment: 1 };
          if (dto.type === AnalyticsEventType.SHARE_CLICK) increments.shareCount = { increment: 1 };

          if (Object.keys(increments).length > 0) {
            await tx.product.update({ where: { id: dto.productId }, data: increments });
          }
        }

        if (dto.categoryId && dto.type === AnalyticsEventType.CATEGORY_VIEW) {
          await tx.category.update({
            where: { id: dto.categoryId },
            data: { viewCount: { increment: 1 } },
          });
        }
      });

      return { recorded: true };
    } catch (error) {
      // Metricas nunca podem quebrar a navegacao do visitante.
      this.logger.warn(
        `Falha ao registrar evento ${dto.type}: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
      return { recorded: false };
    }
  }

  // -------------------------------------------------------------------------
  // Consultas agregadas
  // -------------------------------------------------------------------------

  async overview(period: PeriodPreset, from?: string, to?: string) {
    const range = resolveRange(period, from, to);
    const previous = previousRange(range);

    const [current, prior] = await Promise.all([
      this.totals(range),
      this.totals(previous),
    ]);

    const conversionRate =
      current.productViews > 0
        ? Number(((current.whatsappClicks / current.productViews) * 100).toFixed(2))
        : 0;
    const previousConversion =
      prior.productViews > 0
        ? Number(((prior.whatsappClicks / prior.productViews) * 100).toFixed(2))
        : 0;

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      current: { ...current, conversionRate },
      previous: { ...prior, conversionRate: previousConversion },
      comparison: {
        productViews: percentChange(current.productViews, prior.productViews),
        whatsappClicks: percentChange(current.whatsappClicks, prior.whatsappClicks),
        categoryViews: percentChange(current.categoryViews, prior.categoryViews),
        searches: percentChange(current.searches, prior.searches),
        leads: percentChange(current.leads, prior.leads),
        conversionRate: percentChange(conversionRate, previousConversion),
      },
    };
  }

  /** Serie diaria continua (dias sem evento aparecem com zero). */
  async dailySeries(period: PeriodPreset, from?: string, to?: string) {
    const range = resolveRange(period, from, to);

    const rows = await this.prisma.$queryRaw<Array<{ day: Date; type: string; total: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day, "type"::text AS type, COUNT(*)::bigint AS total
      FROM analytics_events
      WHERE "createdAt" BETWEEN ${range.from} AND ${range.to}
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `;

    const base = new Map(
      eachDay(range).map((date) => [
        date,
        { date, views: 0, whatsapp: 0, categories: 0, searches: 0, leads: 0 },
      ]),
    );

    for (const row of rows) {
      const key = toDateKey(row.day);
      const entry = base.get(key);
      if (!entry) continue;
      const total = Number(row.total);
      switch (row.type) {
        case 'PRODUCT_VIEW':
          entry.views += total;
          break;
        case 'WHATSAPP_CLICK':
          entry.whatsapp += total;
          break;
        case 'CATEGORY_VIEW':
          entry.categories += total;
          break;
        case 'SEARCH':
        case 'SEARCH_NO_RESULT':
          entry.searches += total;
          break;
        case 'LEAD_SUBMIT':
          entry.leads += total;
          break;
      }
    }

    return [...base.values()];
  }

  async topProducts(
    period: PeriodPreset,
    metric: 'views' | 'clicks',
    limit: number,
    from?: string,
    to?: string,
  ) {
    const range = resolveRange(period, from, to);
    const type =
      metric === 'clicks' ? AnalyticsEventType.WHATSAPP_CLICK : AnalyticsEventType.PRODUCT_VIEW;

    const grouped = await this.prisma.analyticsEvent.groupBy({
      by: ['productId'],
      where: {
        type,
        productId: { not: null },
        createdAt: { gte: range.from, lte: range.to },
      },
      _count: { _all: true },
      orderBy: { _count: { productId: 'desc' } },
      take: limit,
    });

    const ids = grouped.map((row) => row.productId!).filter(Boolean);
    if (ids.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        slug: true,
        viewCount: true,
        whatsappClickCount: true,
        images: { where: { isPrimary: true }, take: 1, select: { url: true } },
      },
    });
    const byId = new Map(products.map((product) => [product.id, product]));

    return grouped
      .map((row) => {
        const product = byId.get(row.productId!);
        if (!product) return null;
        return {
          id: product.id,
          name: product.name,
          slug: product.slug,
          image: product.images[0]?.url ?? null,
          total: row._count._all,
          totalViews: product.viewCount,
          totalClicks: product.whatsappClickCount,
        };
      })
      .filter(Boolean);
  }

  async categoryPerformance(period: PeriodPreset, from?: string, to?: string) {
    const range = resolveRange(period, from, to);

    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; name: string; views: bigint; product_views: bigint; clicks: bigint }>
    >`
      SELECT
        c.id,
        c.name,
        COUNT(*) FILTER (WHERE e."type" = 'CATEGORY_VIEW' AND e."categoryId" = c.id)::bigint AS views,
        COUNT(*) FILTER (WHERE e."type" = 'PRODUCT_VIEW' AND pc."categoryId" = c.id)::bigint AS product_views,
        COUNT(*) FILTER (WHERE e."type" = 'WHATSAPP_CLICK' AND pc."categoryId" = c.id)::bigint AS clicks
      FROM categories c
      LEFT JOIN product_categories pc ON pc."categoryId" = c.id
      LEFT JOIN analytics_events e
        ON (e."categoryId" = c.id OR e."productId" = pc."productId")
       AND e."createdAt" BETWEEN ${range.from} AND ${range.to}
      WHERE c."deletedAt" IS NULL
      GROUP BY c.id, c.name
      ORDER BY 3 DESC, 2 ASC
      LIMIT 12
    `;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      categoryViews: Number(row.views),
      productViews: Number(row.product_views),
      whatsappClicks: Number(row.clicks),
    }));
  }

  async trafficSources(period: PeriodPreset, from?: string, to?: string) {
    const range = resolveRange(period, from, to);

    const grouped = await this.prisma.analyticsEvent.groupBy({
      by: ['referrerHost'],
      where: { createdAt: { gte: range.from, lte: range.to } },
      _count: { _all: true },
      orderBy: { _count: { referrerHost: 'desc' } },
      take: 10,
    });

    return grouped.map((row) => ({
      source: row.referrerHost ?? 'Acesso direto',
      total: row._count._all,
    }));
  }

  async devices(period: PeriodPreset, from?: string, to?: string) {
    const range = resolveRange(period, from, to);
    const grouped = await this.prisma.analyticsEvent.groupBy({
      by: ['device'],
      where: { createdAt: { gte: range.from, lte: range.to } },
      _count: { _all: true },
    });

    const labels: Record<DeviceType, string> = {
      DESKTOP: 'Computador',
      MOBILE: 'Celular',
      TABLET: 'Tablet',
      UNKNOWN: 'Nao identificado',
    };

    return grouped.map((row) => ({
      device: labels[row.device],
      total: row._count._all,
    }));
  }

  async searchTerms(period: PeriodPreset, from?: string, to?: string) {
    const range = resolveRange(period, from, to);

    const [top, empty] = await Promise.all([
      this.prisma.analyticsEvent.groupBy({
        by: ['searchTerm'],
        where: {
          type: AnalyticsEventType.SEARCH,
          searchTerm: { not: null },
          createdAt: { gte: range.from, lte: range.to },
        },
        _count: { _all: true },
        orderBy: { _count: { searchTerm: 'desc' } },
        take: 15,
      }),
      this.prisma.analyticsEvent.groupBy({
        by: ['searchTerm'],
        where: {
          type: AnalyticsEventType.SEARCH_NO_RESULT,
          searchTerm: { not: null },
          createdAt: { gte: range.from, lte: range.to },
        },
        _count: { _all: true },
        orderBy: { _count: { searchTerm: 'desc' } },
        take: 15,
      }),
    ]);

    return {
      topTerms: top.map((row) => ({ term: row.searchTerm!, total: row._count._all })),
      withoutResults: empty.map((row) => ({ term: row.searchTerm!, total: row._count._all })),
    };
  }

  private async totals(range: DateRange) {
    const where = { createdAt: { gte: range.from, lte: range.to } };

    const grouped = await this.prisma.analyticsEvent.groupBy({
      by: ['type'],
      where,
      _count: { _all: true },
    });

    const byType = new Map(grouped.map((row) => [row.type, row._count._all]));

    return {
      productViews: byType.get(AnalyticsEventType.PRODUCT_VIEW) ?? 0,
      categoryViews: byType.get(AnalyticsEventType.CATEGORY_VIEW) ?? 0,
      whatsappClicks: byType.get(AnalyticsEventType.WHATSAPP_CLICK) ?? 0,
      shares: byType.get(AnalyticsEventType.SHARE_CLICK) ?? 0,
      searches:
        (byType.get(AnalyticsEventType.SEARCH) ?? 0) +
        (byType.get(AnalyticsEventType.SEARCH_NO_RESULT) ?? 0),
      searchesWithoutResults: byType.get(AnalyticsEventType.SEARCH_NO_RESULT) ?? 0,
      leads: byType.get(AnalyticsEventType.LEAD_SUBMIT) ?? 0,
      pageViews: byType.get(AnalyticsEventType.PAGE_VIEW) ?? 0,
    };
  }
}
