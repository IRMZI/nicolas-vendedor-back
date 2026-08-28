import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .trim()
    .optional()
    .nullable()
    .transform((value) => (value && value !== '' ? value : null));

export const createTestimonialSchema = z.object({
  customerName: z.string().trim().min(2, 'Informe o nome do cliente').max(120),
  photoUrl: optionalText(500),
  content: z.string().trim().min(10, 'O depoimento deve ter ao menos 10 caracteres').max(1200),
  rating: z.coerce.number().int().min(1, 'A avaliacao vai de 1 a 5').max(5).default(5),
  role: optionalText(120),
  position: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateTestimonialSchema = createTestimonialSchema;

export const listTestimonialsSchema = z.object({
  search: z.string().trim().max(120).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export type CreateTestimonialDto = z.infer<typeof createTestimonialSchema>;
export type UpdateTestimonialDto = z.infer<typeof updateTestimonialSchema>;
export type ListTestimonialsDto = z.infer<typeof listTestimonialsSchema>;
