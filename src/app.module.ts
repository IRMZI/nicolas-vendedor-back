import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { resolve } from 'node:path';

import { loadConfiguration } from './common/config/configuration';
import { PrismaModule } from './common/prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

import { AuditModule } from './modules/audit/audit.module';
import { MailModule } from './modules/mail/mail.module';
import { StorageModule } from './modules/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { ProductsModule } from './modules/products/products.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { TagsModule } from './modules/tags/tags.module';
import { FiltersModule } from './modules/filters/filters.module';
import { LeadsModule } from './modules/leads/leads.module';
import { BannersModule } from './modules/banners/banners.module';
import { TestimonialsModule } from './modules/testimonials/testimonials.module';
import { SettingsModule } from './modules/settings/settings.module';
import { HomeSectionsModule } from './modules/home-sections/home-sections.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PublicModule } from './modules/public/public.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, load: [loadConfiguration] }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    // Serve as imagens quando STORAGE_DRIVER=local.
    ServeStaticModule.forRoot({
      rootPath: resolve(process.env.UPLOAD_DIR ?? './uploads'),
      serveRoot: '/uploads',
      serveStaticOptions: { index: false, maxAge: '365d', immutable: true },
    }),

    PrismaModule,
    AuditModule,
    MailModule,
    StorageModule,
    SettingsModule,

    AuthModule,
    UploadsModule,
    ProductsModule,
    CategoriesModule,
    TagsModule,
    FiltersModule,
    LeadsModule,
    BannersModule,
    TestimonialsModule,
    HomeSectionsModule,
    AnalyticsModule,
    DashboardModule,
    PublicModule,
  ],
  controllers: [HealthController],
  providers: [
    // A ordem importa: throttling -> autenticacao -> CSRF -> permissoes.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(cookieParser()).forRoutes('*');
  }
}
