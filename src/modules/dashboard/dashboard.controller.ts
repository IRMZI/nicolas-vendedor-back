import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { zodPipe } from '@/common/pipes/zod-validation.pipe';
import { periodSchema, type PeriodDto } from '../analytics/dto/analytics.schemas';

@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  summary(@Query(zodPipe(periodSchema)) query: PeriodDto) {
    return this.dashboardService.summary(query.period, query.from, query.to);
  }
}
