import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .trim()
    .optional()
    .nullable()
    .transform((value) => (value && value !== '' ? value : null));

export const createBannerSchema = z
  .object({
    title: z.string().trim().min(2, 'Informe o titulo do banner').max(160),
    subtitle: optionalText(300),
    imageDesktop: optionalText(500),
    imageMobile: optionalText(500),
    buttonLabel: optionalText(60),
    link: optionalText(500),
    position: z.coerce.number().int().min(0).default(0),
    startsAt: z.coerce.date().optional().nullable(),
    endsAt: z.coerce.date().optional().nullable(),
    isActive: z.boolean().default(true),
  })
  .refine((data) => !data.startsAt || !data.endsAt || data.startsAt <= data.endsAt, {
    message: 'A data final deve ser posterior a data inicial',
    path: ['endsAt'],
  });

export const updateBannerSchema = createBannerSchema;

export const listBannersSchema = z.object({
  search: z.string().trim().max(120).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export type CreateBannerDto = z.infer<typeof createBannerSchema>;
export type UpdateBannerDto = z.infer<typeof updateBannerSchema>;
export type ListBannersDto = z.infer<typeof listBannersSchema>;
