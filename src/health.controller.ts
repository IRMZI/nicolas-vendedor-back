import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './common/prisma/prisma.service';
import { Public } from './common/decorators/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let database = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'unavailable';
    }

    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
