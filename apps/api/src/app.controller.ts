import { Controller, Get, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './database/prisma.service';
import { RedisService } from './common/services/redis.service';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Production health check — used by Docker healthcheck, Caddy, load balancers.
   * Checks: app status, database (SELECT 1), Redis (PING).
   * Marked @Public so JWT guard does not block it.
   * Does NOT expose connection strings, secrets, or internal details.
   */
  @Public()
  @Get('health')
  async health(): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };

    // Database check
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      result.database = 'ok';
    } catch (err) {
      this.logger.error(`Health: database check failed — ${err?.message}`);
      result.database = 'error';
      result.status = 'error';
    }

    // Redis check
    try {
      const pong = await this.redis.ping();
      result.redis = pong ? 'ok' : 'error';
    } catch {
      result.redis = 'unavailable';
      // Redis is fail-open — app still works without it, just degraded
      if (result.status !== 'error') {
        result.status = 'degraded';
      }
    }

    return result;
  }
}
