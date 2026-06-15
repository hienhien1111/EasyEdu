import {
  Controller,
  Post,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RegisterDto,
  ForgotPasswordDto,
  VerifyOtpDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './dto/auth.dto';

import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Build cookie options.
   * - Dev:  secure=false, no domain (localhost only)
   * - Prod: secure=true, domain=COOKIE_DOMAIN (.easyedu.study) for subdomain sharing
   */
  private cookieOptions(maxAgeMs: number) {
    const isProd = process.env.NODE_ENV === 'production';
    const cookieDomain = process.env.COOKIE_DOMAIN; // e.g. '.easyedu.study'
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      maxAge: maxAgeMs,
      path: '/',
      ...(isProd && cookieDomain ? { domain: cookieDomain } : {}),
    };
  }

  // ── Login ────────────────────────────────────────────────────

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60 * 1000 } }) // 5 attempts / 60s / IP
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập (UC-01) — tokens set as httpOnly cookies' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);

    // Access token: 15 min normally, 30 days if rememberMe
    const accessMaxAge = dto.rememberMe
      ? 30 * 24 * 60 * 60 * 1000
      : 15 * 60 * 1000;

    res.cookie('access_token', result.accessToken, this.cookieOptions(accessMaxAge));
    res.cookie('refresh_token', result.refreshToken, this.cookieOptions(30 * 24 * 60 * 60 * 1000));

    // Return only user info — tokens are in cookies, not response body
    return { user: result.user };
  }

  // ── Refresh ──────────────────────────────────────────────────

  @Public()
  @SkipThrottle() // refresh is called automatically — don't throttle it
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Làm mới access token bằng refresh token cookie' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = (req as any).cookies?.['refresh_token'];
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Không tìm thấy refresh token');
    }

    const result = await this.authService.refresh(rawRefreshToken);

    res.cookie('access_token', result.accessToken, this.cookieOptions(15 * 60 * 1000));
    res.cookie('refresh_token', result.refreshToken, this.cookieOptions(30 * 24 * 60 * 60 * 1000));

    return { message: 'Token đã được làm mới' };
  }

  // ── Register ─────────────────────────────────────────────────

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } }) // 5 registrations / hour / IP
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Đăng ký tài khoản (UC-14)' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ── Forgot password / OTP ────────────────────────────────────

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60 * 60 * 1000 } }) // 3 OTP sends / hour / IP
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Quên mật khẩu - gửi OTP (UC-18)' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác thực OTP (UC-18)' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đặt lại mật khẩu (UC-18)' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // ── Logout ───────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất (UC-02) — revokes token + clears cookies' })
  async logout(
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    // user object contains jti + exp injected by JwtStrategy.validate()
    await this.authService.logout(user.id, user.jti, user.exp);

    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });

    return { message: 'Đăng xuất thành công' };
  }

  // ── Change password ──────────────────────────────────────────

  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đổi mật khẩu khi đã đăng nhập (UC-20)' })
  changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto);
  }

  // ── Me ───────────────────────────────────────────────────────

  @Post('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin người dùng hiện tại' })
  me(@CurrentUser() user: any) {
    // Strip internal token metadata before returning
    const { jti, exp, iat, ...safeUser } = user;
    return safeUser;
  }
}
