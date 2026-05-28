import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../common/services/redis.service';

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  jti?: string;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private redisService: RedisService,
  ) {
    super({
      // Try httpOnly cookie first, then fall back to Bearer header (for Swagger / API clients)
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.['access_token'] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: JwtPayload) {
    // ── Blacklist check ──────────────────────────────────────────
    if (payload.jti) {
      const blacklisted = await this.redisService.isBlacklisted(payload.jti);
      if (blacklisted) {
        throw new UnauthorizedException('Token đã bị thu hồi. Vui lòng đăng nhập lại.');
      }
    }

    // ── User status check ────────────────────────────────────────
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        role: true,
        status: true,
      },
    });

    if (!user || user.status === 'LOCKED') {
      throw new UnauthorizedException('Tài khoản không hợp lệ hoặc đã bị khóa');
    }

    // Return user + token metadata (jti/exp used by logout handler)
    return { ...user, jti: payload.jti, exp: payload.exp };
  }
}
