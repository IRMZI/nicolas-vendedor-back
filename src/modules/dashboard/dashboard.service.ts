import { Injectable } from '@nestjs/common';
import { AnalyticsEventType, ProductStatus } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { addDays, startOfDay, type PeriodPreset } from '@/common/utils/date.util';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Todos os numeros vem do banco; nada e simulado. */
  async summary(period: PeriodPreset = '30d', from?: string, to?: string) {
    const [
      totalProducts,
      totalCategories,
      activeProducts,
      inactiveProducts,
      draftProducts,
      archivedProducts,
      outOfStockProducts,
      trashedProducts,
      totalLeads,
      newLeads,
      convertedLeads,
      totalBanners,
      totalTestimonials,
      aggregates,
    ] = await this.prisma.$transaction([
      this.prisma.product.count({ where: { deletedAt: null } }),
      this.prisma.category.count({ where: { deletedAt: null } }),
      this.prisma.product.count({ where: { deletedAt: null, status: ProductStatus.ACTIVE } }),
      this.prisma.product.count({ where: { deletedAt: null, status: ProductStatus.INACTIVE } }),
      this.prisma.product.count({ where: { deletedAt: null, status: ProductStatus.DRAFT } }),
      this.prisma.product.count({ where: { deletedAt: null, status: ProductStatus.ARCHIVED } }),
      this.prisma.product.count({
        where: {
          deletedAt: null,
          OR: [{ availability: 'OUT_OF_STOCK' }, { trackStock: true, stock: { lte: 0 } }],
        },
      }),
      this.prisma.product.count({ where: { deletedAt: { not: null } } }),
      this.prisma.lead.count({ where: { deletedAt: null } }),
      this.prisma.lead.count({ where: { deletedAt: null, status: 'NEW' } }),
      this.prisma.lead.count({ where: { deletedAt: null, status: 'CONVERTED' } }),
      this.prisma.banner.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.testimonial.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.product.aggregate({
        where: { deletedAt: null },
        _sum: { viewCount: true, whatsappClickCount: true, leadCount: true },
      }),
    ]);

    const [views7, views30, views90] = await Promise.all([
      this.countEvents(AnalyticsEventType.PRODUCT_VIEW, 7),
      this.countEvents(AnalyticsEventType.PRODUCT_VIEW, 30),
      this.countEvents(AnalyticsEventType.PRODUCT_VIEW, 90),
    ]);

    const [clicks7, clicks30, clicks90] = await Promise.all([
      this.countEvents(AnalyticsEventType.WHATSAPP_CLICK, 7),
      this.countEvents(AnalyticsEventType.WHATSAPP_CLICK, 30),
      this.countEvents(AnalyticsEventType.WHATSAPP_CLICK, 90),
    ]);

    const totalViews = aggregates._sum.viewCount ?? 0;
    const totalClicks = aggregates._sum.whatsappClickCount ?? 0;

    const [mostViewed, mostClicked, topCategory, recentProducts, recentLeads, overview] =
      await Promise.all([
        this.prisma.product.findFirst({
          where: { deletedAt: null, viewCount: { gt: 0 } },
          orderBy: { viewCount: 'desc' },
          select: { id: true, name: true, slug: true, viewCount: true, whatsappClickCount: true },
        }),
        this.prisma.product.findFirst({
          where: { deletedAt: null, whatsappClickCount: { gt: 0 } },
          orderBy: { whatsappClickCount: 'desc' },
          select: { id: true, name: true, slug: true, viewCount: true, whatsappClickCount: true },
        }),
        this.prisma.category.findFirst({
          where: { deletedAt: null, viewCount: { gt: 0 } },
          orderBy: { viewCount: 'desc' },
          select: { id: true, name: true, slug: true, viewCount: true },
        }),
        this.prisma.product.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            price: true,
            viewCount: true,
            whatsappClickCount: true,
            createdAt: true,
            images: { where: { isPrimary: true }, take: 1, select: { url: true } },
          },
        }),
        this.prisma.lead.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 6,
          include: { product: { select: { id: true, name: true } } },
        }),
        this.analytics.overview(period, from, to),
      ]);

    return {
      catalog: {
        totalProducts,
        totalCategories,
        activeProducts,
        inactiveProducts,
        draftProducts,
        archivedProducts,
        outOfStockProducts,
        trashedProducts,
        totalBanners,
        totalTestimonials,
      },
      engagement: {
        totalViews,
        totalClicks,
        totalLeadsFromProducts: aggregates._sum.leadCount ?? 0,
        views7,
        views30,
        views90,
        clicks7,
        clicks30,
        clicks90,
        conversionRate:
          totalViews > 0 ? Number(((totalClicks / totalViews) * 100).toFixed(2)) : 0,
      },
      leads: { totalLeads, newLeads, convertedLeads },
      highlights: { mostViewed, mostClicked, topCategory },
      recentProducts: recentProducts.map((product) => ({
        ...product,
        price: Number(product.price),
        primaryImage: product.images[0]?.url ?? null,
      })),
      recentLeads,
      period: overview,
    };
  }

  private async countEvents(type: AnalyticsEventType, days: number): Promise<number> {
    return this.prisma.analyticsEvent.count({
      where: { type, createdAt: { gte: startOfDay(addDays(new Date(), -(days - 1))) } },
    });
  }
}
