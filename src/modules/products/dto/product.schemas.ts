import { ProductAvailability, ProductStatus } from '@prisma/client';
import { z } from 'zod';
import { DEFAULT_PER_PAGE, MAX_PER_PAGE } from '@/common/constants';

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .trim()
    .optional()
    .nullable()
    .transform((value) => (value && value !== '' ? value : null));

export const productImageSchema = z.object({
  id: z.string().uuid().optional(),
  url: z.string().url('URL da imagem invalida'),
  storageKey: z.string().optional().nullable(),
  alt: optionalText(200),
  position: z.number().int().min(0).default(0),
  isPrimary: z.boolean().default(false),
  width: z.number().int().positive().optional().nullable(),
  height: z.number().int().positive().optional().nullable(),
  sizeBytes: z.number().int().positive().optional().nullable(),
  mimeType: z.string().optional().nullable(),
});

export const productAttributeSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da caracteristica').max(80),
  value: z.string().trim().min(1, 'Informe o valor').max(300),
  position: z.number().int().min(0).default(0),
});

export const createProductSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome do produto').max(180),
    slug: z
      .string()
      .trim()
      .max(200)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minusculas, numeros e hifens')
      .optional()
      .or(z.literal('')),
    sku: optionalText(60),
    shortDescription: optionalText(400),
    description: z.string().max(60_000).optional().nullable(),
    price: z.coerce.number().min(0, 'O preco nao pode ser negativo').max(99_999_999),
    comparePrice: z.coerce.number().min(0).max(99_999_999).optional().nullable(),
    stock: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
    trackStock: z.boolean().default(false),
    status: z.nativeEnum(ProductStatus).default(ProductStatus.DRAFT),
    availability: z.nativeEnum(ProductAvailability).default(ProductAvailability.IN_STOCK),
    isFeatured: z.boolean().default(false),
    seoTitle: optionalText(180),
    seoDescription: optionalText(320),
    publishedAt: z.coerce.date().optional().nullable(),
    categoryIds: z.array(z.string().uuid()).default([]),
    tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
    images: z.array(productImageSchema).max(20).default([]),
    attributes: z.array(productAttributeSchema).max(50).default([]),
  })
  .refine(
    (data) => data.comparePrice == null || data.comparePrice === 0 || data.comparePrice > data.price,
    { message: 'O preco anterior deve ser maior que o preco atual', path: ['comparePrice'] },
  );

export const updateProductSchema = createProductSchema;

export const listProductsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(MAX_PER_PAGE).default(DEFAULT_PER_PAGE),
  search: z.string().trim().max(120).optional(),
  status: z.nativeEnum(ProductStatus).optional(),
  categoryId: z.string().uuid().optional(),
  availability: z.nativeEnum(ProductAvailability).optional(),
  isFeatured: z.enum(['true', 'false']).optional(),
  includeDeleted: z.enum(['true', 'false']).default('false'),
  onlyDeleted: z.enum(['true', 'false']).default('false'),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z
    .enum([
      'recent',
      'oldest',
      'name_asc',
      'name_desc',
      'price_asc',
      'price_desc',
      'views_desc',
      'clicks_desc',
      'updated_desc',
    ])
    .default('recent'),
});

export const bulkActionSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1, 'Selecione ao menos um produto').max(500),
    action: z.enum(['activate', 'deactivate', 'feature', 'unfeature', 'archive', 'restore', 'delete', 'set_category']),
    categoryId: z.string().uuid().optional(),
  })
  .refine((data) => data.action !== 'set_category' || !!data.categoryId, {
    message: 'Escolha a categoria de destino',
    path: ['categoryId'],
  });

export type CreateProductDto = z.infer<typeof createProductSchema>;
export type UpdateProductDto = z.infer<typeof updateProductSchema>;
export type ListProductsDto = z.infer<typeof listProductsSchema>;
export type BulkActionDto = z.infer<typeof bulkActionSchema>;
