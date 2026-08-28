import { LeadSource, LeadStatus } from '@prisma/client';
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

/** Formulario publico "Tenho interesse". */
export const createPublicLeadSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome').max(120),
  phone: z
    .string()
    .trim()
    .min(8, 'Informe um telefone valido')
    .max(30)
    .regex(/^[0-9()+\-\s]+$/, 'Use apenas numeros e os simbolos ( ) + -'),
  email: z.string().trim().toLowerCase().email('Informe um e-mail valido').optional().or(z.literal('')),
  productId: z.string().uuid().optional().nullable(),
  message: z.string().trim().max(1500).optional().or(z.literal('')),
  // Honeypot anti-spam: precisa chegar vazio.
  website: z.string().max(0, 'Requisicao invalida').optional(),
});

export const createLeadSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(120),
  phone: optionalText(30),
  email: z.string().trim().toLowerCase().email('Informe um e-mail valido').optional().or(z.literal('')),
  productId: z.string().uuid().optional().nullable(),
  message: optionalText(1500),
  source: z.nativeEnum(LeadSource).default(LeadSource.MANUAL),
  status: z.nativeEnum(LeadStatus).default(LeadStatus.NEW),
  notes: optionalText(2000),
});

export const updateLeadSchema = createLeadSchema.partial().extend({
  name: z.string().trim().min(2, 'Informe o nome').max(120).optional(),
});

export const updateLeadStatusSchema = z.object({
  status: z.nativeEnum(LeadStatus),
  note: optionalText(1000),
});

export const listLeadsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(MAX_PER_PAGE).default(DEFAULT_PER_PAGE),
  search: z.string().trim().max(120).optional(),
  status: z.nativeEnum(LeadStatus).optional(),
  source: z.nativeEnum(LeadSource).optional(),
  productId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(['recent', 'oldest', 'name_asc']).default('recent'),
});

export type CreatePublicLeadDto = z.infer<typeof createPublicLeadSchema>;
export type CreateLeadDto = z.infer<typeof createLeadSchema>;
export type UpdateLeadDto = z.infer<typeof updateLeadSchema>;
export type UpdateLeadStatusDto = z.infer<typeof updateLeadStatusSchema>;
export type ListLeadsDto = z.infer<typeof listLeadsSchema>;
