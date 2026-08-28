import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .trim()
    .optional()
    .nullable()
    .transform((value) => (value && value !== '' ? value : null));

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da categoria').max(120),
  slug: z
    .string()
    .trim()
    .max(140)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minusculas, numeros e hifens')
    .optional()
    .or(z.literal('')),
  description: optionalText(1000),
  imageUrl: optionalText(500),
  icon: optionalText(60),
  parentId: z.string().uuid().optional().nullable(),
  position: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  showOnHome: z.boolean().default(false),
  seoTitle: optionalText(180),
  seoDescription: optionalText(320),
});

export const updateCategorySchema = createCategorySchema;

export const listCategoriesSchema = z.object({
  search: z.string().trim().max(120).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  parentId: z.string().uuid().optional(),
  onlyRoots: z.enum(['true', 'false']).default('false'),
  includeDeleted: z.enum(['true', 'false']).default('false'),
});

export const reorderSchema = z.object({
  items: z
    .array(z.object({ id: z.string().uuid(), position: z.number().int().min(0) }))
    .min(1, 'Nenhum item para reordenar'),
});

export const deleteCategorySchema = z.object({
  strategy: z.enum(['move', 'detach']).default('detach'),
  targetCategoryId: z.string().uuid().optional(),
});

export const linkProductsSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1, 'Selecione ao menos um produto'),
});

export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;
export type ListCategoriesDto = z.infer<typeof listCategoriesSchema>;
export type ReorderDto = z.infer<typeof reorderSchema>;
export type DeleteCategoryDto = z.infer<typeof deleteCategorySchema>;
export type LinkProductsDto = z.infer<typeof linkProductsSchema>;
