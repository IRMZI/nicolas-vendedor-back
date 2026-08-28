import { ProductAvailability } from '@prisma/client';
import { z } from 'zod';

export const catalogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(12),
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(140).optional(),
  tag: z.string().trim().max(60).optional(),
  availability: z.nativeEnum(ProductAvailability).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  featured: z.enum(['true', 'false']).optional(),
  sort: z
    .enum(['recent', 'most_viewed', 'name_asc', 'name_desc', 'price_asc', 'price_desc'])
    .default('recent'),
  // Filtros dinamicos: f[marca]=toyota,honda&f[cambio]=automatico
  f: z
    .record(z.string().max(80), z.string().max(400))
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const clean: Record<string, string[]> = {};
      for (const [group, csv] of Object.entries(value)) {
        const slugs = csv
          .split(',')
          .map((slug) => slug.trim())
          .filter((slug) => /^[a-z0-9-]{1,80}$/.test(slug))
          .slice(0, 20);
        if (slugs.length > 0) clean[group] = slugs;
      }
      return Object.keys(clean).length > 0 ? clean : undefined;
    }),
});

export type CatalogQueryDto = z.infer<typeof catalogQuerySchema>;
