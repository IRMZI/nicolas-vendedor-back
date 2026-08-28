import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { AnalyticsService } from './analytics.service';
import { zodPipe } from '@/common/pipes/zod-validation.pipe';
import { periodSchema, type PeriodDto } from './dto/analytics.schemas';

const topSchema = periodSchema.extend({
  metric: z.enum(['views', 'clicks']).default('views'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  overview(@Query(zodPipe(periodSchema)) query: PeriodDto) {
    return this.analyticsService.overview(query.period, query.from, query.to);
  }

  @Get('daily')
  daily(@Query(zodPipe(periodSchema)) query: PeriodDto) {
    return this.analyticsService.dailySeries(query.period, query.from, query.to);
  }

  @Get('top-products')
  topProducts(@Query(zodPipe(topSchema)) query: z.infer<typeof topSchema>) {
    return this.analyticsService.topProducts(
      query.period,
      query.metric,
      query.limit,
      query.from,
      query.to,
    );
  }

  @Get('categories')
  categories(@Query(zodPipe(periodSchema)) query: PeriodDto) {
    return this.analyticsService.categoryPerformance(query.period, query.from, query.to);
  }

  @Get('sources')
  sources(@Query(zodPipe(periodSchema)) query: PeriodDto) {
    return this.analyticsService.trafficSources(query.period, query.from, query.to);
  }

  @Get('devices')
  devices(@Query(zodPipe(periodSchema)) query: PeriodDto) {
    return this.analyticsService.devices(query.period, query.from, query.to);
  }

  @Get('searches')
  searches(@Query(zodPipe(periodSchema)) query: PeriodDto) {
    return this.analyticsService.searchTerms(query.period, query.from, query.to);
  }
}
