import { z } from 'zod';

export const createFilterGroupSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do filtro').max(60),
  slug: z
    .string()
    .trim()
    .max(80)
    .regex(/^$|^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letras minusculas, numeros e hifens')
    .optional(),
  position: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  options: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
});

export const updateFilterGroupSchema = createFilterGroupSchema.omit({ options: true });

export const createFilterOptionSchema = z.object({
  name: z.string().trim().min(1, 'Informe o valor').max(80),
  position: z.coerce.number().int().min(0).default(0),
});

export const updateFilterOptionSchema = createFilterOptionSchema;

export const reorderSchema = z.object({
  items: z
    .array(z.object({ id: z.string().uuid(), position: z.number().int().min(0) }))
    .min(1, 'Nada para reordenar'),
});

export type CreateFilterGroupDto = z.infer<typeof createFilterGroupSchema>;
export type UpdateFilterGroupDto = z.infer<typeof updateFilterGroupSchema>;
export type CreateFilterOptionDto = z.infer<typeof createFilterOptionSchema>;
export type UpdateFilterOptionDto = z.infer<typeof updateFilterOptionSchema>;
export type ReorderDto = z.infer<typeof reorderSchema>;
