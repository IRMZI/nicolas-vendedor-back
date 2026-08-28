import { Controller, Get, Query } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from './audit.service';
import { zodPipe } from '@/common/pipes/zod-validation.pipe';
import { DEFAULT_PER_PAGE, MAX_PER_PAGE } from '@/common/constants';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(MAX_PER_PAGE).default(DEFAULT_PER_PAGE),
  action: z.nativeEnum(AuditAction).optional(),
  entity: z.string().trim().min(1).optional(),
  userId: z.string().uuid().optional(),
  search: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(@Query(zodPipe(listSchema)) query: z.infer<typeof listSchema>) {
    return this.auditService.list(query);
  }

  @Get('entities')
  entities() {
    return this.auditService.entities();
  }
}
