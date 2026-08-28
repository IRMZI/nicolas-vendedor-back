import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, ProductStatus } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService, type AuditContext } from '../audit/audit.service';
import { toSlug, uniqueSlug } from '@/common/utils/slug.util';
import type {
  CreateFilterGroupDto,
  CreateFilterOptionDto,
  ReorderDto,
  UpdateFilterGroupDto,
  UpdateFilterOptionDto,
} from './dto/filter.schemas';

@Injectable()
export class FiltersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Administracao
  // -------------------------------------------------------------------------

  async list() {
    const groups = await this.prisma.filterGroup.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: {
        options: {
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          include: { _count: { select: { products: true } } },
        },
      },
    });

    return groups.map((group) => ({
      ...group,
      options: group.options.map((option) => ({
        ...option,
        productCount: option._count.products,
      })),
    }));
  }

  async createGroup(dto: CreateFilterGroupDto, ctx: AuditContext) {
    const slug = await uniqueSlug(dto.slug || dto.name, async (candidate) => {
      const found = await this.prisma.filterGroup.findUnique({ where: { slug: candidate } });
      return !!found;
    });

    const optionNames = [...new Set(dto.options.map((name) => name.trim()).filter(Boolean))];

    const group = await this.prisma.filterGroup.create({
      data: {
        name: dto.name,
        slug,
        position: dto.position,
        isActive: dto.isActive,
        options: {
          create: optionNames
            .map((name, index) => ({ name, slug: toSlug(name), position: index }))
            .filter((option) => option.slug),
        },
      },
      include: { options: { orderBy: { position: 'asc' } } },
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.CREATE,
      entity: 'FilterGroup',
      entityId: group.id,
      summary: `Filtro criado: ${group.name} (${group.options.length} opcao(oes))`,
    });

    return group;
  }

  async updateGroup(id: string, dto: UpdateFilterGroupDto, ctx: AuditContext) {
    const current = await this.prisma.filterGroup.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Filtro nao encontrado.');

    const slug =
      dto.slug && dto.slug !== current.slug
        ? await uniqueSlug(dto.slug, async (candidate) => {
            const found = await this.prisma.filterGroup.findFirst({
              where: { slug: candidate, id: { not: id } },
            });
            return !!found;
          })
        : current.slug;

    const group = await this.prisma.filterGroup.update({
      where: { id },
      data: { name: dto.name, slug, position: dto.position, isActive: dto.isActive },
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'FilterGroup',
      entityId: id,
      summary: `Filtro atualizado: ${group.name}`,
      changes: AuditService.diff(current, group),
    });

    return group;
  }

  async removeGroup(id: string, ctx: AuditContext) {
    const group = await this.prisma.filterGroup.findUnique({
      where: { id },
      include: { _count: { select: { options: true } } },
    });
    if (!group) throw new NotFoundException('Filtro nao encontrado.');

    // Cascata remove opcoes e vinculos; os produtos permanecem intactos.
    await this.prisma.filterGroup.delete({ where: { id } });

    await this.audit.record({
      ...ctx,
      action: AuditAction.DELETE,
      entity: 'FilterGroup',
      entityId: id,
      summary: `Filtro excluido: ${group.name} (${group._count.options} opcao(oes))`,
    });

    return { success: true };
  }

  async reorderGroups(dto: ReorderDto, ctx: AuditContext) {
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.filterGroup.update({ where: { id: item.id }, data: { position: item.position } }),
      ),
    );
    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'FilterGroup',
      summary: `Ordem de ${dto.items.length} filtro(s) atualizada`,
    });
    return { success: true };
  }

  async createOption(groupId: string, dto: CreateFilterOptionDto, ctx: AuditContext) {
    const group = await this.prisma.filterGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Filtro nao encontrado.');

    const slug = toSlug(dto.name);
    if (!slug) throw new BadRequestException('Valor invalido.');

    const existing = await this.prisma.filterOption.findUnique({
      where: { groupId_slug: { groupId, slug } },
    });
    if (existing) {
      throw new BadRequestException({
        message: 'Dados invalidos. Revise os campos destacados.',
        errors: { name: 'Esta opcao ja existe neste filtro' },
      });
    }

    const option = await this.prisma.filterOption.create({
      data: { groupId, name: dto.name, slug, position: dto.position },
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'FilterGroup',
      entityId: groupId,
      summary: `Opcao "${option.name}" adicionada ao filtro ${group.name}`,
    });

    return option;
  }

  async updateOption(optionId: string, dto: UpdateFilterOptionDto, ctx: AuditContext) {
    const current = await this.prisma.filterOption.findUnique({
      where: { id: optionId },
      include: { group: { select: { id: true, name: true } } },
    });
    if (!current) throw new NotFoundException('Opcao nao encontrada.');

    const slug = toSlug(dto.name);
    const duplicate = await this.prisma.filterOption.findFirst({
      where: { groupId: current.groupId, slug, id: { not: optionId } },
    });
    if (duplicate) {
      throw new BadRequestException({
        message: 'Dados invalidos. Revise os campos destacados.',
        errors: { name: 'Esta opcao ja existe neste filtro' },
      });
    }

    const option = await this.prisma.filterOption.update({
      where: { id: optionId },
      data: { name: dto.name, slug, position: dto.position },
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'FilterGroup',
      entityId: current.groupId,
      summary: `Opcao do filtro ${current.group.name} renomeada: ${current.name} -> ${option.name}`,
    });

    return option;
  }

  async removeOption(optionId: string, ctx: AuditContext) {
    const option = await this.prisma.filterOption.findUnique({
      where: { id: optionId },
      include: { group: { select: { id: true, name: true } } },
    });
    if (!option) throw new NotFoundException('Opcao nao encontrada.');

    await this.prisma.filterOption.delete({ where: { id: optionId } });

    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'FilterGroup',
      entityId: option.groupId,
      summary: `Opcao "${option.name}" removida do filtro ${option.group.name}`,
    });

    return { success: true };
  }

  async reorderOptions(dto: ReorderDto, ctx: AuditContext) {
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.filterOption.update({ where: { id: item.id }, data: { position: item.position } }),
      ),
    );
    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'FilterGroup',
      summary: `Ordem de ${dto.items.length} opcao(oes) de filtro atualizada`,
    });
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Site publico
  // -------------------------------------------------------------------------

  /** Grupos ativos com contagem de produtos publicados por opcao. */
  async publicGroups() {
    const groups = await this.prisma.filterGroup.findMany({
      where: { isActive: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: {
        options: {
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          include: {
            _count: {
              select: {
                products: {
                  where: { product: { deletedAt: null, status: ProductStatus.ACTIVE } },
                },
              },
            },
          },
        },
      },
    });

    return groups
      .map((group) => ({
        id: group.id,
        name: group.name,
        slug: group.slug,
        options: group.options
          .map((option) => ({
            id: option.id,
            name: option.name,
            slug: option.slug,
            productCount: option._count.products,
          }))
          .filter((option) => option.productCount > 0),
      }))
      .filter((group) => group.options.length > 0);
  }

  /** Garante que os ids de opcoes existem antes de vincular a um produto. */
  async assertOptionsExist(ids: string[]) {
    if (ids.length === 0) return;
    const count = await this.prisma.filterOption.count({ where: { id: { in: ids } } });
    if (count !== new Set(ids).size) {
      throw new BadRequestException({
        message: 'Dados invalidos. Revise os campos destacados.',
        errors: { filterOptionIds: 'Uma ou mais opcoes de filtro nao existem' },
      });
    }
  }
}
