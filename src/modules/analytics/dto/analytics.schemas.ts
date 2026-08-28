import { AnalyticsEventType } from '@prisma/client';
import { z } from 'zod';

/** Evento enviado pelo site publico. Nunca aceita dados pessoais. */
export const trackEventSchema = z.object({
  type: z.nativeEnum(AnalyticsEventType),
  productId: z.string().uuid().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  searchTerm: z.string().trim().max(120).optional().nullable(),
  resultCount: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  path: z.string().trim().max(300).optional().nullable(),
  referrer: z.string().trim().max(500).optional().nullable(),
  // Identificadores anonimos gerados no navegador (sem relacao com pessoa identificada).
  anonymousId: z.string().trim().max(64).optional().nullable(),
  sessionId: z.string().trim().max(64).optional().nullable(),
});

export const periodSchema = z.object({
  period: z.enum(['today', '7d', '30d', '90d', 'custom']).default('30d'),
  from: z.string().optional(),
  to: z.string().optional(),
});

export type TrackEventDto = z.infer<typeof trackEventSchema>;
export type PeriodDto = z.infer<typeof periodSchema>;
