import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { toSlug } from '@/common/utils/slug.util';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cria as tags que ainda nao existem e devolve os ids correspondentes. */
  async ensureTags(names: string[]): Promise<string[]> {
    const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
    if (unique.length === 0) return [];

    const ids: string[] = [];
    for (const name of unique) {
      const slug = toSlug(name);
      if (!slug) continue;
      const tag = await this.prisma.tag.upsert({
        where: { slug },
        update: {},
        create: { name, slug },
        select: { id: true },
      });
      ids.push(tag.id);
    }
    return ids;
  }

  async list(search?: string) {
    return this.prisma.tag.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
      take: 200,
    });
  }

  async remove(id: string) {
    await this.prisma.tag.delete({ where: { id } });
    return { success: true };
  }
}
