import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { BannersService } from '../banners/banners.service';
import { TestimonialsService } from '../testimonials/testimonials.service';
import { HomeSectionsService } from '../home-sections/home-sections.service';
import { FiltersService } from '../filters/filters.service';
import { buildPagination, skipTake, type Paginated } from '@/common/utils/pagination.util';
import type { CatalogQueryDto } from './dto/public.schemas';

/** Somente produtos publicados aparecem no site. */
const PUBLIC_PRODUCT_WHERE: Prisma.ProductWhereInput = {
  deletedAt: null,
  status: ProductStatus.ACTIVE,
};

const CARD_SELECT = {
  id: true,
  name: true,
  slug: true,
  sku: true,
  shortDescription: true,
  price: true,
  comparePrice: true,
  availability: true,
  stock: true,
  trackStock: true,
  isFeatured: true,
  viewCount: true,
  createdAt: true,
  images: {
    orderBy: { position: 'asc' },
    take: 1,
    select: { url: true, alt: true },
  },
  categories: { select: { category: { select: { id: true, name: true, slug: true } } } },
} satisfies Prisma.ProductSelect;

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly banners: BannersService,
    private readonly testimonials: TestimonialsService,
    private readonly homeSections: HomeSectionsService,
    private readonly filters: FiltersService,
  ) {}

  // -------------------------------------------------------------------------
  // Home
  // -------------------------------------------------------------------------

  async home() {
    const [settings, sections, banners, categories, featured, mostViewed, recent, testimonials] =
      await Promise.all([
        this.settings.publicSettings(),
        this.homeSections.list(),
        this.banners.activeForSite(),
        this.homeCategories(),
        this.productCards({ isFeatured: true }, [{ createdAt: 'desc' }], 8),
        this.productCards({ viewCount: { gt: 0 } }, [{ viewCount: 'desc' }], 8),
        this.productCards({}, [{ createdAt: 'desc' }], 8),
        this.testimonials.activeForSite(),
      ]);

    return {
      settings,
      sections: Object.fromEntries(sections.map((section) => [section.key, section])),
      banners,
      categories,
      featuredProducts: featured,
      mostViewedProducts: mostViewed,
      recentProducts: recent,
      testimonials,
    };
  }

  // -------------------------------------------------------------------------
  // Catalogo
  // -------------------------------------------------------------------------

  async catalog(query: CatalogQueryDto): Promise<Paginated<any> & { appliedFilters: any }> {
    const where: Prisma.ProductWhereInput = {
      ...PUBLIC_PRODUCT_WHERE,
      ...(query.availability ? { availability: query.availability } : {}),
      ...(query.featured === 'true' ? { isFeatured: true } : {}),
      ...(query.category ? { categories: { some: { category: { slug: query.category } } } } : {}),
      ...(query.tag ? { tags: { some: { tag: { slug: query.tag } } } } : {}),
      ...(query.f
        ? {
            AND: Object.entries(query.f).map(([groupSlug, optionSlugs]) => ({
              filterOptions: {
                some: { option: { slug: { in: optionSlugs }, group: { slug: groupSlug, isActive: true } } },
              },
            })),
          }
        : {}),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            price: {
              ...(query.minPrice !== undefined ? { gte: new Prisma.Decimal(query.minPrice) } : {}),
              ...(query.maxPrice !== undefined ? { lte: new Prisma.Decimal(query.maxPrice) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
              { shortDescription: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy = this.catalogOrder(query.sort);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy,
        ...skipTake(query.page, query.perPage),
        select: CARD_SELECT,
      }),
    ]);

    return {
      data: rows.map((row) => this.toCard(row)),
      meta: buildPagination(query.page, query.perPage, total),
      appliedFilters: {
        search: query.search ?? null,
        category: query.category ?? null,
        tag: query.tag ?? null,
        availability: query.availability ?? null,
        minPrice: query.minPrice ?? null,
        maxPrice: query.maxPrice ?? null,
        sort: query.sort,
        f: query.f ?? null,
      },
    };
  }

  /** Faixa de precos real do catalogo, usada no filtro do site. */
  async catalogFilters() {
    const [range, categories, tags, filterGroups] = await Promise.all([
      this.prisma.product.aggregate({
        where: PUBLIC_PRODUCT_WHERE,
        _min: { price: true },
        _max: { price: true },
      }),
      this.categoriesWithCount(),
      this.prisma.tag.findMany({
        where: { products: { some: { product: PUBLIC_PRODUCT_WHERE } } },
        select: { id: true, name: true, slug: true },
        orderBy: { name: 'asc' },
        take: 40,
      }),
      this.filters.publicGroups(),
    ]);

    return {
      filterGroups,
      priceRange: {
        min: range._min.price ? Number(range._min.price) : 0,
        max: range._max.price ? Number(range._max.price) : 0,
      },
      categories,
      tags,
    };
  }

  // -------------------------------------------------------------------------
  // Produto
  // -------------------------------------------------------------------------

  async productBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { ...PUBLIC_PRODUCT_WHERE, slug },
      include: {
        images: { orderBy: { position: 'asc' } },
        attributes: { orderBy: { position: 'asc' } },
        categories: { select: { category: { select: { id: true, name: true, slug: true } } } },
        tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
      },
    });

    if (!product) throw new NotFoundException('Produto nao encontrado.');

    const categoryIds = product.categories.map((item) => item.category.id);
    const related = await this.prisma.product.findMany({
      where: {
        ...PUBLIC_PRODUCT_WHERE,
        id: { not: product.id },
        ...(categoryIds.length > 0
          ? { categories: { some: { categoryId: { in: categoryIds } } } }
          : {}),
      },
      orderBy: [{ isFeatured: 'desc' }, { viewCount: 'desc' }],
      take: 4,
      select: CARD_SELECT,
    });

    const price = Number(product.price);
    const comparePrice = product.comparePrice ? Number(product.comparePrice) : null;

    return {
      ...product,
      price,
      comparePrice,
      discountPercent:
        comparePrice && comparePrice > price
          ? Math.round(((comparePrice - price) / comparePrice) * 100)
          : null,
      primaryImage:
        product.images.find((image) => image.isPrimary)?.url ?? product.images[0]?.url ?? null,
      categories: product.categories.map((item) => item.category),
      tags: product.tags.map((item) => item.tag),
      inStock:
        product.availability === 'IN_STOCK' && (!product.trackStock || (product.stock ?? 0) > 0),
      relatedProducts: related.map((row) => this.toCard(row)),
    };
  }

  // -------------------------------------------------------------------------
  // Categoria
  // -------------------------------------------------------------------------

  async categoryBySlug(slug: string, page: number, perPage: number, sort: CatalogQueryDto['sort']) {
    const category = await this.prisma.category.findFirst({
      where: { slug, deletedAt: null, isActive: true },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: {
          where: { deletedAt: null, isActive: true },
          select: { id: true, name: true, slug: true, imageUrl: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!category) throw new NotFoundException('Categoria nao encontrada.');

    const where: Prisma.ProductWhereInput = {
      ...PUBLIC_PRODUCT_WHERE,
      categories: { some: { categoryId: category.id } },
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: this.catalogOrder(sort),
        ...skipTake(page, perPage),
        select: CARD_SELECT,
      }),
    ]);

    return {
      category,
      products: rows.map((row) => this.toCard(row)),
      meta: buildPagination(page, perPage, total),
    };
  }

  async categories() {
    return this.categoriesWithCount();
  }

  // -------------------------------------------------------------------------
  // Conteudo institucional
  // -------------------------------------------------------------------------

  async settingsForSite() {
    return this.settings.publicSettings();
  }

  async legal() {
    return this.settings.legalPages();
  }

  /** Alimenta o sitemap.xml do site publico. */
  async sitemapEntries() {
    const [products, categories] = await Promise.all([
      this.prisma.product.findMany({
        where: PUBLIC_PRODUCT_WHERE,
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.category.findMany({
        where: { deletedAt: null, isActive: true },
        select: { slug: true, updatedAt: true },
      }),
    ]);
    return { products, categories };
  }

  // -------------------------------------------------------------------------
  // Auxiliares
  // -------------------------------------------------------------------------

  private catalogOrder(sort: CatalogQueryDto['sort']): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'most_viewed':
        return [{ viewCount: 'desc' }, { createdAt: 'desc' }];
      case 'name_asc':
        return [{ name: 'asc' }];
      case 'name_desc':
        return [{ name: 'desc' }];
      case 'price_asc':
        return [{ price: 'asc' }];
      case 'price_desc':
        return [{ price: 'desc' }];
      default:
        return [{ createdAt: 'desc' }];
    }
  }

  private async productCards(
    extraWhere: Prisma.ProductWhereInput,
    orderBy: Prisma.ProductOrderByWithRelationInput[],
    take: number,
  ) {
    const rows = await this.prisma.product.findMany({
      where: { ...PUBLIC_PRODUCT_WHERE, ...extraWhere },
      orderBy,
      take,
      select: CARD_SELECT,
    });
    return rows.map((row) => this.toCard(row));
  }

  private async homeCategories() {
    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null, isActive: true, showOnHome: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      take: 8,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        icon: true,
        _count: { select: { products: { where: { product: PUBLIC_PRODUCT_WHERE } } } },
      },
    });

    return categories.map((category) => ({
      ...category,
      productCount: category._count.products,
    }));
  }

  private async categoriesWithCount() {
    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        icon: true,
        parentId: true,
        _count: { select: { products: { where: { product: PUBLIC_PRODUCT_WHERE } } } },
      },
    });

    return categories.map((category) => ({
      ...category,
      productCount: category._count.products,
    }));
  }

  private toCard(row: any) {
    const price = Number(row.price);
    const comparePrice = row.comparePrice ? Number(row.comparePrice) : null;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      sku: row.sku,
      shortDescription: row.shortDescription,
      price,
      comparePrice,
      discountPercent:
        comparePrice && comparePrice > price
          ? Math.round(((comparePrice - price) / comparePrice) * 100)
          : null,
      availability: row.availability,
      inStock: row.availability === 'IN_STOCK' && (!row.trackStock || (row.stock ?? 0) > 0),
      isFeatured: row.isFeatured,
      viewCount: row.viewCount,
      createdAt: row.createdAt,
      image: row.images?.[0]?.url ?? null,
      imageAlt: row.images?.[0]?.alt ?? row.name,
      categories: row.categories?.map((item: any) => item.category) ?? [],
    };
  }
}
