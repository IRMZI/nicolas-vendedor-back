import { Module } from '@nestjs/common';
import { PublicService } from './public.service';
import { PublicController } from './public.controller';
import { AnalyticsModule } from '../analytics/analytics.module';
import { LeadsModule } from '../leads/leads.module';
import { BannersModule } from '../banners/banners.module';
import { TestimonialsModule } from '../testimonials/testimonials.module';
import { HomeSectionsModule } from '../home-sections/home-sections.module';
import { FiltersModule } from '../filters/filters.module';

@Module({
  imports: [AnalyticsModule, LeadsModule, BannersModule, TestimonialsModule, HomeSectionsModule, FiltersModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
