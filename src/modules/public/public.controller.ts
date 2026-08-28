import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { PublicService } from './public.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { LeadsService } from '../leads/leads.service';
import { Public } from '@/common/decorators/public.decorator';
import { zodPipe } from '@/common/pipes/zod-validation.pipe';
import { getClientIp, getUserAgent } from '@/common/utils/request.util';
import { catalogQuerySchema, type CatalogQueryDto } from './dto/public.schemas';
import { trackEventSchema, type TrackEventDto } from '../analytics/dto/analytics.schemas';
import { createPublicLeadSchema, type CreatePublicLeadDto } from '../leads/dto/lead.schemas';

const categoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(12),
  sort: z
    .enum(['recent', 'most_viewed', 'name_asc', 'name_desc', 'price_asc', 'price_desc'])
    .default('recent'),
});

/** Endpoints consumidos pelo site publico. Todos sem autenticacao. */
@Public()
@Controller('public')
export class PublicController {
  constructor(
    private readonly publicService: PublicService,
    private readonly analytics: AnalyticsService,
    private readonly leads: LeadsService,
  ) {}

  @Get('home')
  home() {
    return this.publicService.home();
  }

  @Get('settings')
  settings() {
    return this.publicService.settingsForSite();
  }

  @Get('legal')
  legal() {
    return this.publicService.legal();
  }

  @Get('products')
  catalog(@Query(zodPipe(catalogQuerySchema)) query: CatalogQueryDto) {
    return this.publicService.catalog(query);
  }

  @Get('products/filters')
  filters() {
    return this.publicService.catalogFilters();
  }

  @Get('products/:slug')
  product(@Param('slug') slug: string) {
    return this.publicService.productBySlug(slug);
  }

  @Get('categories')
  categories() {
    return this.publicService.categories();
  }

  @Get('categories/:slug')
  category(
    @Param('slug') slug: string,
    @Query(zodPipe(categoryQuerySchema)) query: z.infer<typeof categoryQuerySchema>,
  ) {
    return this.publicService.categoryBySlug(slug, query.page, query.perPage, query.sort);
  }

  @Get('sitemap')
  sitemap() {
    return this.publicService.sitemapEntries();
  }

  /** Registro de metricas. Aceita apenas identificadores anonimos. */
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED)
  track(@Body(zodPipe(trackEventSchema)) dto: TrackEventDto, @Req() req: Request) {
    return this.analytics.track(dto, { userAgent: getUserAgent(req), ip: getClientIp(req) });
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('leads')
  @HttpCode(HttpStatus.CREATED)
  createLead(
    @Body(zodPipe(createPublicLeadSchema)) dto: CreatePublicLeadDto,
    @Req() req: Request,
  ) {
    return this.leads.createFromSite(dto, {
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }
}
