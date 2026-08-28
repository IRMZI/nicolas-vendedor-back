import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaService } from './common/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const prefix = config.get<string>('API_PREFIX', 'api');
  app.setGlobalPrefix(prefix, { exclude: ['uploads/(.*)'] });

  // Cabecalhos de seguranca. crossOriginResourcePolicy liberado para que
  // o site publico (outra origem) consiga exibir as imagens servidas aqui.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  app.enableCors({
    origin: config.get<string[]>('corsOrigins') ?? ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    exposedHeaders: ['Content-Disposition'],
  });

  app.set('trust proxy', 1);

  const prisma = app.get(PrismaService);
  prisma.enableShutdownHooks(app);
  app.enableShutdownHooks();

  if (!config.get<boolean>('isProduction')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Nicolas Vendedor API')
      .setDescription('API do catalogo automotivo e do painel administrativo')
      .setVersion('1.0.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${prefix}/docs`, app, document);
  }

  const port = config.get<number>('PORT', 4000);
  await app.listen(port, '0.0.0.0');

  logger.log(`API disponivel em http://localhost:${port}/${prefix}`);
  if (!config.get<boolean>('isProduction')) {
    logger.log(`Documentacao em http://localhost:${port}/${prefix}/docs`);
  }
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Falha ao iniciar a aplicacao:', error);
  process.exit(1);
});
