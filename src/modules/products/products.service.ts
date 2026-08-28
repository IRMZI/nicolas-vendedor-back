import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma, ProductStatus, type Product } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService, type AuditContext } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { TagsService } from '../tags/tags.service';
import { FiltersService } from '../filters/filters.service';
import { sanitizeHtml } from '@/common/utils/sanitize.util';
import { toSlug, uniqueSlug } from '@/common/utils/slug.util';
import { buildPagination, skipTake, type Paginated } from '@/common/utils/pagination.util';
import type {
  BulkActionDto,
  CreateProductDto,
  ListProductsDto,
  UpdateProductDto,
} from './dto/product.schemas';

const PRODUCT_INCLUDE = {
  images: { orderBy: { position: 'asc' } },
  categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
  tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
  filterOptions: {
    include: {
      option: {
        select: { id: true, name: true, slug: true, groupId: true, group: { select: { id: true, name: true, slug: true } } },
      },
    },
  },
  attributes: { orderBy: { position: 'asc' } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly tags: TagsService,
    private readonly filters: FiltersService,
  ) {}

  // -------------------------------------------------------------------------
  // Leitura
  // -------------------------------------------------------------------------

  async list(query: ListProductsDto): Promise<Paginated<any>> {
    const where = this.buildWhere(query);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: this.buildOrderBy(query.sort),
        ...skipTake(query.page, query.perPage),
        include: PRODUCT_INCLUDE,
      }),
    ]);

    return {
      data: rows.map((row) => this.serialize(row)),
      meta: buildPagination(query.page, query.perPage, total),
    };
  }

  async findById(id: string, includeDeleted = true) {
    const product = await this.prisma.product.findFirst({
      where: { id, ...(includeDeleted ? {} : { deletedAt: null }) },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException('Produto nao encontrado.');
    return this.serialize(product);
  }

  /** Metricas individuais do produto para a tela de detalhes do painel. */
  async metrics(id: string, days = 30) {
    const product = await this.prisma.product.findFirst({
      where: { id },
      select: { id: true, name: true, viewCount: true, whatsappClickCount: true, shareCount: true, leadCount: true },
    });
    if (!product) throw new NotFoundException('Produto nao encontrado.');

    const from = new Date();
    from.setDate(from.getDate() - days + 1);
    from.setHours(0, 0, 0, 0);

    const rows = await this.prisma.$queryRaw<Array<{ day: Date; type: string; total: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day, "type"::text AS type, COUNT(*)::bigint AS total
      FROM analytics_events
      WHERE "productId" = ${id}::uuid AND "createdAt" >= ${from}
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `;

    const series = new Map<string, { date: string; views: number; whatsapp: number }>();
    for (const row of rows) {
      const key = row.day.toISOString().slice(0, 10);
      const entry = series.get(key) ?? { date: key, views: 0, whatsapp: 0 };
      if (row.type === 'PRODUCT_VIEW') entry.views += Number(row.total);
      if (row.type === 'WHATSAPP_CLICK') entry.whatsapp += Number(row.total);
      series.set(key, entry);
    }

    const conversionRate =
      product.viewCount > 0
        ? Number(((product.whatsappClickCount / product.viewCount) * 100).toFixed(2))
        : 0;

    return { ...product, conversionRate, series: [...series.values()] };
  }

  // -------------------------------------------------------------------------
  // Escrita
  // -------------------------------------------------------------------------

  async create(dto: CreateProductDto, ctx: AuditContext) {
    await this.assertCategoriesExist(dto.categoryIds);
    await this.filters.assertOptionsExist(dto.filterOptionIds);

    const slug = await uniqueSlug(dto.slug || dto.name, (candidate) => this.slugTaken(candidate));
    const tagIds = await this.tags.ensureTags(dto.tags);

    const product = await this.prisma.product.create({
      data: {
        ...this.scalarData(dto),
        slug,
        publishedAt: dto.publishedAt ?? (dto.status === ProductStatus.ACTIVE ? new Date() : null),
        categories: { create: dto.categoryIds.map((categoryId) => ({ categoryId })) },
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
        filterOptions: { create: dto.filterOptionIds.map((optionId) => ({ optionId })) },
        images: { create: this.normalizeImages(dto.images) },
        attributes: {
          create: dto.attributes.map((attribute, index) => ({
            name: attribute.name,
            value: attribute.value,
            position: attribute.position ?? index,
          })),
        },
      },
      include: PRODUCT_INCLUDE,
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.CREATE,
      entity: 'Product',
      entityId: product.id,
      summary: `Produto criado: ${product.name}`,
    });

    return this.serialize(product);
  }

  async update(id: string, dto: UpdateProductDto, ctx: AuditContext) {
    const current = await this.prisma.product.findFirst({ where: { id }, include: PRODUCT_INCLUDE });
    if (!current) throw new NotFoundException('Produto nao encontrado.');

    await this.assertCategoriesExist(dto.categoryIds);
    await this.filters.assertOptionsExist(dto.filterOptionIds);

    const slug =
      dto.slug && dto.slug !== current.slug
        ? await uniqueSlug(dto.slug, (candidate) => this.slugTaken(candidate, id))
        : dto.slug || current.slug;

    const tagIds = await this.tags.ensureTags(dto.tags);

    // Remove do storage as imagens que sairam da galeria.
    const keptUrls = new Set(dto.images.map((image) => image.url));
    const removedImages = current.images.filter((image) => !keptUrls.has(image.url));

    const product = await this.prisma.$transaction(async (tx) => {
      await tx.productCategory.deleteMany({ where: { productId: id } });
      await tx.productTag.deleteMany({ where: { productId: id } });
      await tx.productFilterOption.deleteMany({ where: { productId: id } });
      await tx.productAttribute.deleteMany({ where: { productId: id } });
      await tx.productImage.deleteMany({ where: { productId: id } });

      return tx.product.update({
        where: { id },
        data: {
          ...this.scalarData(dto),
          slug,
          publishedAt:
            dto.publishedAt ??
            (dto.status === ProductStatus.ACTIVE ? (current.publishedAt ?? new Date()) : current.publishedAt),
          categories: { create: dto.categoryIds.map((categoryId) => ({ categoryId })) },
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
          filterOptions: { create: dto.filterOptionIds.map((optionId) => ({ optionId })) },
          images: { create: this.normalizeImages(dto.images) },
          attributes: {
            create: dto.attributes.map((attribute, index) => ({
              name: attribute.name,
              value: attribute.value,
              position: attribute.position ?? index,
            })),
          },
        },
        include: PRODUCT_INCLUDE,
      });
    });

    await Promise.all(removedImages.map((image) => this.storage.remove(image.storageKey)));

    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'Product',
      entityId: id,
      summary: `Produto atualizado: ${product.name}`,
      changes: AuditService.diff(this.auditSnapshot(current), this.auditSnapshot(product)),
    });

    return this.serialize(product);
  }

  async duplicate(id: string, ctx: AuditContext) {
    const source = await this.prisma.product.findFirst({ where: { id }, include: PRODUCT_INCLUDE });
    if (!source) throw new NotFoundException('Produto nao encontrado.');

    const name = `${source.name} (copia)`;
    const slug = await uniqueSlug(name, (candidate) => this.slugTaken(candidate));

    const product = await this.prisma.product.create({
      data: {
        name,
        slug,
        sku: source.sku ? `${source.sku}-COPIA` : null,
        shortDescription: source.shortDescription,
        description: source.description,
        price: source.price,
        comparePrice: source.comparePrice,
        stock: source.stock,
        trackStock: source.trackStock,
        status: ProductStatus.DRAFT,
        availability: source.availability,
        isFeatured: false,
        seoTitle: source.seoTitle,
        seoDescription: source.seoDescription,
        categories: { create: source.categories.map((item) => ({ categoryId: item.categoryId })) },
        tags: { create: source.tags.map((item) => ({ tagId: item.tagId })) },
        filterOptions: { create: source.filterOptions.map((item) => ({ optionId: item.optionId })) },
        // As imagens sao reaproveitadas por URL; o arquivo original continua unico no storage.
        images: {
          create: source.images.map((image) => ({
            url: image.url,
            storageKey: null,
            alt: image.alt,
            position: image.position,
            isPrimary: image.isPrimary,
            width: image.width,
            height: image.height,
            sizeBytes: image.sizeBytes,
            mimeType: image.mimeType,
          })),
        },
        attributes: {
          create: source.attributes.map((attribute) => ({
            name: attribute.name,
            value: attribute.value,
            position: attribute.position,
          })),
        },
      },
      include: PRODUCT_INCLUDE,
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.CREATE,
      entity: 'Product',
      entityId: product.id,
      summary: `Produto duplicado a partir de: ${source.name}`,
    });

    return this.serialize(product);
  }

  async setStatus(id: string, status: ProductStatus, ctx: AuditContext) {
    const current = await this.prisma.product.findFirst({ where: { id } });
    if (!current) throw new NotFoundException('Produto nao encontrado.');

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        status,
        publishedAt:
          status === ProductStatus.ACTIVE && !current.publishedAt ? new Date() : current.publishedAt,
      },
      include: PRODUCT_INCLUDE,
    });

    await this.audit.record({
      ...ctx,
      action: status === ProductStatus.ARCHIVED ? AuditAction.ARCHIVE : AuditAction.STATUS_CHANGE,
      entity: 'Product',
      entityId: id,
      summary: `Status de "${product.name}" alterado para ${status}`,
      changes: { status: { de: current.status, para: status } },
    });

    return this.serialize(product);
  }

  async setFeatured(id: string, isFeatured: boolean, ctx: AuditContext) {
    const product = await this.prisma.product
      .update({ where: { id }, data: { isFeatured }, include: PRODUCT_INCLUDE })
      .catch(() => null);
    if (!product) throw new NotFoundException('Produto nao encontrado.');

    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'Product',
      entityId: id,
      summary: `${isFeatured ? 'Marcado' : 'Removido'} como destaque: ${product.name}`,
    });

    return this.serialize(product);
  }

  /** Exclusao logica: o registro permanece e pode ser restaurado. */
  async softDelete(id: string, ctx: AuditContext) {
    const product = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw new NotFoundException('Produto nao encontrado.');

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), status: ProductStatus.INACTIVE, isFeatured: false },
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.DELETE,
      entity: 'Product',
      entityId: id,
      summary: `Produto excluido (lixeira): ${product.name}`,
    });

    return { success: true };
  }

  async restore(id: string, ctx: AuditContext) {
    const product = await this.prisma.product.findFirst({ where: { id, deletedAt: { not: null } } });
    if (!product) throw new NotFoundException('Produto nao encontrado na lixeira.');

    const restored = await this.prisma.product.update({
      where: { id },
      data: { deletedAt: null, status: ProductStatus.DRAFT },
      include: PRODUCT_INCLUDE,
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.RESTORE,
      entity: 'Product',
      entityId: id,
      summary: `Produto restaurado: ${restored.name}`,
    });

    return this.serialize(restored);
  }

  /** Remocao definitiva, incluindo os arquivos de imagem. */
  async hardDelete(id: string, ctx: AuditContext) {
    const product = await this.prisma.product.findFirst({ where: { id }, include: { images: true } });
    if (!product) throw new NotFoundException('Produto nao encontrado.');

    await Promise.all(product.images.map((image) => this.storage.remove(image.storageKey)));
    await this.prisma.product.delete({ where: { id } });

    await this.audit.record({
      ...ctx,
      action: AuditAction.DELETE,
      entity: 'Product',
      entityId: id,
      summary: `Produto removido definitivamente: ${product.name}`,
    });

    return { success: true };
  }

  async bulk(dto: BulkActionDto, ctx: AuditContext) {
    const { ids, action } = dto;
    let affected = 0;

    switch (action) {
      case 'activate':
        affected = (
          await this.prisma.product.updateMany({
            where: { id: { in: ids }, deletedAt: null },
            data: { status: ProductStatus.ACTIVE },
          })
        ).count;
        break;
      case 'deactivate':
        affected = (
          await this.prisma.product.updateMany({
            where: { id: { in: ids } },
            data: { status: ProductStatus.INACTIVE },
          })
        ).count;
        break;
      case 'feature':
        affected = (
          await this.prisma.product.updateMany({
            where: { id: { in: ids }, deletedAt: null },
            data: { isFeatured: true },
          })
        ).count;
        break;
      case 'unfeature':
        affected = (
          await this.prisma.product.updateMany({ where: { id: { in: ids } }, data: { isFeatured: false } })
        ).count;
        break;
      case 'archive':
        affected = (
          await this.prisma.product.updateMany({
            where: { id: { in: ids } },
            data: { status: ProductStatus.ARCHIVED, isFeatured: false },
          })
        ).count;
        break;
      case 'restore':
        affected = (
          await this.prisma.product.updateMany({
            where: { id: { in: ids } },
            data: { deletedAt: null, status: ProductStatus.DRAFT },
          })
        ).count;
        break;
      case 'delete':
        affected = (
          await this.prisma.product.updateMany({
            where: { id: { in: ids }, deletedAt: null },
            data: { deletedAt: new Date(), isFeatured: false, status: ProductStatus.INACTIVE },
          })
        ).count;
        break;
      case 'set_category': {
        const categoryId = dto.categoryId!;
        const category = await this.prisma.category.findFirst({
          where: { id: categoryId, deletedAt: null },
        });
        if (!category) throw new BadRequestException('Categoria de destino nao encontrada.');

        await this.prisma.$transaction([
          this.prisma.productCategory.deleteMany({ where: { productId: { in: ids } } }),
          this.prisma.productCategory.createMany({
            data: ids.map((productId) => ({ productId, categoryId })),
            skipDuplicates: true,
          }),
        ]);
        affected = ids.length;
        break;
      }
    }

    await this.audit.record({
      ...ctx,
      action: AuditAction.BULK_ACTION,
      entity: 'Product',
      summary: `Acao em massa "${action}" aplicada a ${affected} produto(s)`,
      changes: { ids, action },
    });

    return { success: true, affected };
  }

  // -------------------------------------------------------------------------
  // Auxiliares
  // -------------------------------------------------------------------------

  private buildWhere(query: ListProductsDto): Prisma.ProductWhereInput {
    const deletedFilter =
      query.onlyDeleted === 'true'
        ? { deletedAt: { not: null } }
        : query.includeDeleted === 'true'
          ? {}
          : { deletedAt: null };

    const price =
      query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            price: {
              ...(query.minPrice !== undefined ? { gte: new Prisma.Decimal(query.minPrice) } : {}),
              ...(query.maxPrice !== undefined ? { lte: new Prisma.Decimal(query.maxPrice) } : {}),
            },
          }
        : {};

    return {
      ...deletedFilter,
      ...price,
      ...(query.status ? { status: query.status } : {}),
      ...(query.availability ? { availability: query.availability } : {}),
      ...(query.isFeatured ? { isFeatured: query.isFeatured === 'true' } : {}),
      ...(query.categoryId ? { categories: { some: { categoryId: query.categoryId } } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
              { shortDescription: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: toSlug(query.search), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private buildOrderBy(sort: ListProductsDto['sort']): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'oldest':
        return [{ createdAt: 'asc' }];
      case 'name_asc':
        return [{ name: 'asc' }];
      case 'name_desc':
        return [{ name: 'desc' }];
      case 'price_asc':
        return [{ price: 'asc' }];
      case 'price_desc':
        return [{ price: 'desc' }];
      case 'views_desc':
        return [{ viewCount: 'desc' }, { createdAt: 'desc' }];
      case 'clicks_desc':
        return [{ whatsappClickCount: 'desc' }, { createdAt: 'desc' }];
      case 'updated_desc':
        return [{ updatedAt: 'desc' }];
      default:
        return [{ createdAt: 'desc' }];
    }
  }

  private scalarData(dto: CreateProductDto) {
    return {
      name: dto.name,
      sku: dto.sku,
      shortDescription: dto.shortDescription,
      description: sanitizeHtml(dto.description),
      price: new Prisma.Decimal(dto.price),
      comparePrice:
        dto.comparePrice != null && dto.comparePrice > 0 ? new Prisma.Decimal(dto.comparePrice) : null,
      stock: dto.trackStock ? (dto.stock ?? 0) : null,
      trackStock: dto.trackStock,
      status: dto.status,
      availability: dto.availability,
      isFeatured: dto.isFeatured,
      seoTitle: dto.seoTitle,
      seoDescription: dto.seoDescription,
    };
  }

  private normalizeImages(images: CreateProductDto['images']) {
    if (images.length === 0) return [];
    const hasPrimary = images.some((image) => image.isPrimary);

    return images.map((image, index) => ({
      url: image.url,
      storageKey: image.storageKey ?? null,
      alt: image.alt ?? null,
      position: image.position ?? index,
      isPrimary: hasPrimary ? image.isPrimary : index === 0,
      width: image.width ?? null,
      height: image.height ?? null,
      sizeBytes: image.sizeBytes ?? null,
      mimeType: image.mimeType ?? null,
    }));
  }

  private async slugTaken(slug: string, ignoreId?: string): Promise<boolean> {
    const found = await this.prisma.product.findFirst({
      where: { slug, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
      select: { id: true },
    });
    return !!found;
  }

  private async assertCategoriesExist(ids: string[]) {
    if (ids.length === 0) return;
    const count = await this.prisma.category.count({ where: { id: { in: ids }, deletedAt: null } });
    if (count !== new Set(ids).size) {
      throw new BadRequestException({
        message: 'Dados invalidos. Revise os campos destacados.',
        errors: { categoryIds: 'Uma ou mais categorias selecionadas nao existem' },
      });
    }
  }

  private auditSnapshot(product: any) {
    const { images, categories, tags, attributes, ...rest } = product;
    return {
      ...rest,
      imagens: images?.length ?? 0,
      categorias: categories?.map((item: any) => item.category?.name ?? item.categoryId) ?? [],
      tags: tags?.map((item: any) => item.tag?.name ?? item.tagId) ?? [],
      caracteristicas: attributes?.length ?? 0,
    };
  }

  /** Converte Decimal em number e calcula o desconto para o cliente. */
  serialize(product: any) {
    const price = Number(product.price);
    const comparePrice = product.comparePrice != null ? Number(product.comparePrice) : null;
    const discountPercent =
      comparePrice && comparePrice > price ? Math.round(((comparePrice - price) / comparePrice) * 100) : null;

    return {
      ...product,
      price,
      comparePrice,
      discountPercent,
      conversionRate:
        product.viewCount > 0
          ? Number(((product.whatsappClickCount / product.viewCount) * 100).toFixed(2))
          : 0,
      primaryImage:
        product.images?.find((image: any) => image.isPrimary)?.url ?? product.images?.[0]?.url ?? null,
      categories: product.categories?.map((item: any) => item.category) ?? [],
      tags: product.tags?.map((item: any) => item.tag) ?? [],
      filterOptionIds: product.filterOptions?.map((item: any) => item.optionId ?? item.option?.id) ?? [],
      filterOptions: product.filterOptions?.map((item: any) => item.option).filter(Boolean) ?? [],
    };
  }
}

export type SerializedProduct = ReturnType<ProductsService['serialize']>;
export { PRODUCT_INCLUDE };
export type { Product };
