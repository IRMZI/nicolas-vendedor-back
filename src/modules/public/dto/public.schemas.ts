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
});

export type CatalogQueryDto = z.infer<typeof catalogQuerySchema>;
