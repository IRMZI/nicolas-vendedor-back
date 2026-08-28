import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .trim()
    .optional()
    .nullable()
    .transform((value) => (value && value !== '' ? value : null));

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Informe uma cor em hexadecimal, ex.: #2563eb');

export const socialLinksSchema = z.object({
  instagram: optionalText(300),
  facebook: optionalText(300),
  youtube: optionalText(300),
  tiktok: optionalText(300),
  linkedin: optionalText(300),
  x: optionalText(300),
});

export const benefitSchema = z.object({
  icon: z.string().trim().max(40).default('sparkles'),
  title: z.string().trim().min(2, 'Informe o titulo').max(80),
  description: z.string().trim().max(240).default(''),
});

export const updateSettingsSchema = z.object({
  siteName: z.string().trim().min(2, 'Informe o nome do site').max(120),
  tagline: optionalText(200),
  logoUrl: optionalText(500),
  faviconUrl: optionalText(500),
  primaryColor: hexColor,
  secondaryColor: hexColor,
  phone: optionalText(30),
  whatsapp: z
    .string()
    .trim()
    .max(30)
    .optional()
    .nullable()
    .transform((value) => (value && value !== '' ? value.replace(/\D/g, '') : null))
    .refine((value) => !value || value.length >= 10, {
      message: 'Informe o WhatsApp com DDD, ex.: 5511999998888',
    }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Informe um e-mail valido')
    .optional()
    .nullable()
    .or(z.literal('')),
  address: optionalText(300),
  businessHours: optionalText(200),
  socialLinks: socialLinksSchema.optional().nullable(),
  whatsappTemplate: z
    .string()
    .trim()
    .min(10, 'A mensagem precisa ter ao menos 10 caracteres')
    .max(600)
    .refine((value) => value.includes('{produto}'), {
      message: 'Inclua a variavel {produto} na mensagem',
    }),
  footerText: optionalText(500),
  aboutTitle: optionalText(160),
  aboutContent: z.string().max(20_000).optional().nullable(),
  aboutImageUrl: optionalText(500),
  benefits: z.array(benefitSchema).max(12).optional().nullable(),
  seoTitle: optionalText(180),
  seoDescription: optionalText(320),
  seoKeywords: optionalText(400),
  ogImageUrl: optionalText(500),
  googleAnalyticsId: optionalText(60),
  metaPixelId: optionalText(60),
  customScripts: z.string().max(10_000).optional().nullable(),
  privacyPolicy: z.string().max(60_000).optional().nullable(),
  termsOfUse: z.string().max(60_000).optional().nullable(),
  cookieNotice: optionalText(600),
});

export type UpdateSettingsDto = z.infer<typeof updateSettingsSchema>;
