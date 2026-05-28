import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {
    this.client = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    this.client.on('error', (err) =>
      this.logger.warn(`Redis error (non-fatal): ${err.message}`),
    );
    this.client.on('connect', () => this.logger.log('Redis connected'));

    this.client.connect().catch(() => {
      this.logger.warn(
        'Redis unavailable — token blacklist & OTP rate limit disabled for this session',
      );
    });
  }

  // ─── Token Blacklist ──────────────────────────────────────────

  /**
   * Blacklist a JWT by its jti for the remaining TTL seconds.
   */
  async setBlacklist(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    try {
      await this.client.set(`bl:${jti}`, '1', 'EX', ttlSeconds);
    } catch {
      this.logger.warn('Redis setBlacklist failed — continuing without blacklist');
    }
  }

  /**
   * Returns true if the jti is blacklisted (i.e., token was revoked).
   * Fail-open: returns false if Redis is unavailable.
   */
  async isBlacklisted(jti: string): Promise<boolean> {
    try {
      const val = await this.client.get(`bl:${jti}`);
      return val !== null;
    } catch {
      return false;
    }
  }

  // ─── OTP Rate Limit ───────────────────────────────────────────

  /**
   * Increment the OTP send counter for a user (1-hour sliding window).
   * Returns the new count after increment.
   */
  async incrementOtpCount(userId: string): Promise<number> {
    const key = `otp:rate:${userId}`;
    try {
      const count = await this.client.incr(key);
      if (count === 1) {
        await this.client.expire(key, 3600); // 1-hour window
      }
      return count;
    } catch {
      return 0; // fail-open: allow OTP send if Redis is unavailable
    }
  }

  onModuleDestroy() {
    this.client.quit().catch(() => {});
  }
}
