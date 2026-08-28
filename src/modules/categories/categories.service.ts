import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService, type AuditContext } from '../audit/audit.service';
import { uniqueSlug } from '@/common/utils/slug.util';
import type {
  CreateCategoryDto,
  DeleteCategoryDto,
  LinkProductsDto,
  ListCategoriesDto,
  ReorderDto,
  UpdateCategoryDto,
} from './dto/category.schemas';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListCategoriesDto) {
    const where: Prisma.CategoryWhereInput = {
      ...(query.includeDeleted === 'true' ? {} : { deletedAt: null }),
      ...(query.isActive ? { isActive: query.isActive === 'true' } : {}),
      ...(query.onlyRoots === 'true' ? { parentId: null } : {}),
      ...(query.parentId ? { parentId: query.parentId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const categories = await this.prisma.category.findMany({
      where,
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        _count: { select: { products: true, children: true } },
      },
    });

    return categories.map((category) => this.serialize(category));
  }

  /** Arvore hierarquica (categorias e subcategorias) para o menu do painel. */
  async tree() {
    const categories = await this.list({
      includeDeleted: 'false',
      onlyRoots: 'false',
    } as ListCategoriesDto);

    const byId = new Map(categories.map((item) => [item.id, { ...item, children: [] as any[] }]));
    const roots: any[] = [];

    for (const category of byId.values()) {
      if (category.parentId && byId.has(category.parentId)) {
        byId.get(category.parentId)!.children.push(category);
      } else {
        roots.push(category);
      }
    }

    return roots;
  }

  async findById(id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: { select: { id: true, name: true, slug: true }, orderBy: { position: 'asc' } },
        _count: { select: { products: true, children: true } },
      },
    });
    if (!category) throw new NotFoundException('Categoria nao encontrada.');
    return this.serialize(category);
  }

  async products(id: string) {
    const links = await this.prisma.productCategory.findMany({
      where: { categoryId: id, product: { deletedAt: null } },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            sku: true,
            price: true,
            status: true,
            viewCount: true,
            images: { where: { isPrimary: true }, take: 1, select: { url: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return links.map((link) => ({
      ...link.product,
      price: Number(link.product.price),
      primaryImage: link.product.images[0]?.url ?? null,
    }));
  }

  async create(dto: CreateCategoryDto, ctx: AuditContext) {
    await this.assertParent(dto.parentId ?? null);

    const slug = await uniqueSlug(dto.slug || dto.name, (candidate) => this.slugTaken(candidate));

    const category = await this.prisma.category.create({
      data: { ...this.data(dto), slug },
      include: { _count: { select: { products: true, children: true } } },
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.CREATE,
      entity: 'Category',
      entityId: category.id,
      summary: `Categoria criada: ${category.name}`,
    });

    return this.serialize(category);
  }

  async update(id: string, dto: UpdateCategoryDto, ctx: AuditContext) {
    const current = await this.prisma.category.findFirst({ where: { id } });
    if (!current) throw new NotFoundException('Categoria nao encontrada.');

    if (dto.parentId === id) {
      throw new BadRequestException({
        message: 'Dados invalidos. Revise os campos destacados.',
        errors: { parentId: 'Uma categoria nao pode ser pai dela mesma' },
      });
    }
    await this.assertParent(dto.parentId ?? null, id);

    const slug =
      dto.slug && dto.slug !== current.slug
        ? await uniqueSlug(dto.slug, (candidate) => this.slugTaken(candidate, id))
        : dto.slug || current.slug;

    const category = await this.prisma.category.update({
      where: { id },
      data: { ...this.data(dto), slug },
      include: { _count: { select: { products: true, children: true } } },
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'Category',
      entityId: id,
      summary: `Categoria atualizada: ${category.name}`,
      changes: AuditService.diff(current, category),
    });

    return this.serialize(category);
  }

  async reorder(dto: ReorderDto, ctx: AuditContext) {
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.category.update({ where: { id: item.id }, data: { position: item.position } }),
      ),
    );

    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'Category',
      summary: `Ordem de ${dto.items.length} categoria(s) atualizada`,
    });

    return { success: true };
  }

  async setActive(id: string, isActive: boolean, ctx: AuditContext) {
    const category = await this.prisma.category
      .update({
        where: { id },
        data: { isActive },
        include: { _count: { select: { products: true, children: true } } },
      })
      .catch(() => null);
    if (!category) throw new NotFoundException('Categoria nao encontrada.');

    await this.audit.record({
      ...ctx,
      action: AuditAction.STATUS_CHANGE,
      entity: 'Category',
      entityId: id,
      summary: `Categoria "${category.name}" ${isActive ? 'ativada' : 'desativada'}`,
    });

    return this.serialize(category);
  }

  /**
   * Antes de excluir, o painel consulta este endpoint para saber
   * quantos produtos e subcategorias serao afetados.
   */
  async deleteImpact(id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { products: true, children: true } } },
    });
    if (!category) throw new NotFoundException('Categoria nao encontrada.');

    return {
      id: category.id,
      name: category.name,
      productCount: category._count.products,
      childrenCount: category._count.children,
      requiresDecision: category._count.products > 0,
    };
  }

  async remove(id: string, dto: DeleteCategoryDto, ctx: AuditContext) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { products: true } } },
    });
    if (!category) throw new NotFoundException('Categoria nao encontrada.');

    if (dto.strategy === 'move') {
      if (!dto.targetCategoryId) {
        throw new BadRequestException({
          message: 'Dados invalidos. Revise os campos destacados.',
          errors: { targetCategoryId: 'Escolha a categoria de destino dos produtos' },
        });
      }
      if (dto.targetCategoryId === id) {
        throw new BadRequestException({
          message: 'Dados invalidos. Revise os campos destacados.',
          errors: { targetCategoryId: 'Escolha uma categoria diferente da que sera excluida' },
        });
      }
      const target = await this.prisma.category.findFirst({
        where: { id: dto.targetCategoryId, deletedAt: null },
      });
      if (!target) throw new BadRequestException('Categoria de destino nao encontrada.');
    }

    const links = await this.prisma.productCategory.findMany({
      where: { categoryId: id },
      select: { productId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      if (dto.strategy === 'move' && dto.targetCategoryId && links.length > 0) {
        await tx.productCategory.createMany({
          data: links.map((link) => ({ productId: link.productId, categoryId: dto.targetCategoryId! })),
          skipDuplicates: true,
        });
      }
      // Em ambos os casos o vinculo com a categoria removida deixa de existir.
      await tx.productCategory.deleteMany({ where: { categoryId: id } });
      // Subcategorias sobem um nivel em vez de serem perdidas.
      await tx.category.updateMany({ where: { parentId: id }, data: { parentId: null } });
      await tx.category.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false, showOnHome: false },
      });
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.DELETE,
      entity: 'Category',
      entityId: id,
      summary: `Categoria excluida: ${category.name} (${links.length} produto(s), estrategia: ${
        dto.strategy === 'move' ? 'movidos' : 'sem categoria'
      })`,
      changes: { strategy: dto.strategy, targetCategoryId: dto.targetCategoryId ?? null },
    });

    return { success: true, affectedProducts: links.length };
  }

  async linkProducts(id: string, dto: LinkProductsDto, ctx: AuditContext) {
    await this.findById(id);
    await this.prisma.productCategory.createMany({
      data: dto.productIds.map((productId) => ({ productId, categoryId: id })),
      skipDuplicates: true,
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'Category',
      entityId: id,
      summary: `${dto.productIds.length} produto(s) vinculado(s) a categoria`,
    });

    return { success: true };
  }

  async unlinkProduct(id: string, productId: string, ctx: AuditContext) {
    await this.prisma.productCategory.deleteMany({ where: { categoryId: id, productId } });

    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'Category',
      entityId: id,
      summary: 'Produto desvinculado da categoria',
    });

    return { success: true };
  }

  private data(dto: CreateCategoryDto) {
    return {
      name: dto.name,
      description: dto.description,
      imageUrl: dto.imageUrl,
      icon: dto.icon,
      parentId: dto.parentId ?? null,
      position: dto.position,
      isActive: dto.isActive,
      showOnHome: dto.showOnHome,
      seoTitle: dto.seoTitle,
      seoDescription: dto.seoDescription,
    };
  }

  private async assertParent(parentId: string | null, selfId?: string) {
    if (!parentId) return;
    const parent = await this.prisma.category.findFirst({
      where: { id: parentId, deletedAt: null },
      select: { id: true, parentId: true },
    });
    if (!parent) {
      throw new BadRequestException({
        message: 'Dados invalidos. Revise os campos destacados.',
        errors: { parentId: 'Categoria principal nao encontrada' },
      });
    }
    // Mantem a arvore com apenas dois niveis e evita ciclos.
    if (selfId && parent.parentId === selfId) {
      throw new BadRequestException({
        message: 'Dados invalidos. Revise os campos destacados.',
        errors: { parentId: 'Esta escolha criaria um ciclo entre as categorias' },
      });
    }
  }

  private async slugTaken(slug: string, ignoreId?: string): Promise<boolean> {
    const found = await this.prisma.category.findFirst({
      where: { slug, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
      select: { id: true },
    });
    return !!found;
  }

  private serialize(category: any) {
    return {
      ...category,
      productCount: category._count?.products ?? 0,
      childrenCount: category._count?.children ?? 0,
    };
  }

  /** Quantidade de produtos publicados, usada no site publico. */
  async activeProductCount(categoryId: string): Promise<number> {
    return this.prisma.product.count({
      where: {
        deletedAt: null,
        status: ProductStatus.ACTIVE,
        categories: { some: { categoryId } },
      },
    });
  }
}
