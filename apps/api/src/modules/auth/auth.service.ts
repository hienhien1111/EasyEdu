import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt, randomUUID } from 'crypto';
import { Resend } from 'resend';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import {
  LoginDto,
  RegisterDto,
  ForgotPasswordDto,
  VerifyOtpDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './dto/auth.dto';

import { Prisma, UserStatus } from '@prisma/client';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;
const SALT_ROUNDS = 12;
const OTP_MAX_PER_HOUR = 3;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly resend: Resend | null;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
  ) {
    const resendKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = resendKey ? new Resend(resendKey) : null;
    if (!resendKey) {
      this.logger.warn(
        'RESEND_API_KEY not set — emails will only be logged to console',
      );
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Write an audit log entry without throwing on failure */
  private async log(
    userId: string,
    action: string,
    metadata?: Record<string, any>,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: { userId, action, metadata: metadata ?? {} },
      });
    } catch (e: any) {
      this.logger.error(`AuditLog failed for ${action}: ${e.message}`);
    }
  }

  // ─── Send OTP Email ───────────────────────────────────────────
  private async sendOtpEmail(
    toEmail: string,
    otp: string,
    expiryMinutes: number,
  ) {
    const from =
      this.configService.get<string>('EMAIL_FROM') || 'onboarding@resend.dev';
    const subject = 'EasyEdu — Mã xác thực OTP';
    const html = `
      <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0d0f1a;color:#e2e4f3;border-radius:16px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="font-size:24px;font-weight:800;background:linear-gradient(135deg,#6366f1,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0;">EasyEdu</h1>
          <p style="color:#9198c5;font-size:13px;margin-top:4px;">Hệ thống Quản lý Trung tâm Dạy học</p>
        </div>
        <h2 style="font-size:18px;font-weight:700;margin-bottom:8px;">Mã xác thực OTP</h2>
        <p style="color:#9198c5;font-size:14px;margin-bottom:24px;">Sử dụng mã dưới đây để đặt lại mật khẩu của bạn. Mã có hiệu lực trong <strong style="color:#e2e4f3">${expiryMinutes} phút</strong>.</p>
        <div style="background:#131629;border:2px solid #6366f144;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <span style="font-size:40px;font-weight:800;letter-spacing:10px;color:#6366f1;font-family:monospace;">${otp}</span>
        </div>
        <p style="color:#9198c5;font-size:12px;text-align:center;">Nếu bạn không yêu cầu mã này, hãy bỏ qua email này.<br/>Không chia sẻ mã này cho bất kỳ ai.</p>
      </div>
    `;

    if (this.resend) {
      try {
        const result = await this.resend.emails.send({
          from,
          to: toEmail,
          subject,
          html,
        });
        this.logger.log(
          `OTP email sent to ${toEmail} — id: ${(result as any)?.data?.id ?? 'unknown'}`,
        );
      } catch (e: any) {
        this.logger.error(`Failed to send OTP email: ${e.message}`);
        // Don't throw — OTP is still saved in DB, user can retry
      }
    } else {
      this.logger.log(`[DEV - no Resend key] OTP for ${toEmail}: ${otp}`);
    }
  }

  // ─── Login (UC-01) ───────────────────────────────────────────
  async login(dto: LoginDto) {
    const { username, password, rememberMe } = dto;
    const loginIdentifier = username.trim();

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: loginIdentifier, mode: 'insensitive' } },
          { phone: loginIdentifier },
          { username: { equals: loginIdentifier, mode: 'insensitive' } },
        ],
      },
      include: { profile: true },
    });

    if (!user) {
      throw new UnauthorizedException('Tài khoản hoặc mật khẩu không đúng');
    }

    if (user.status === UserStatus.LOCKED) {
      throw new ForbiddenException(
        'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.',
      );
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenException(
        `Tài khoản tạm thời bị khóa. Vui lòng thử lại sau ${minutesLeft} phút.`,
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      const newFailCount = user.failedLoginCount + 1;
      const updateData: any = { failedLoginCount: newFailCount };

      if (newFailCount >= MAX_FAILED_ATTEMPTS) {
        updateData.lockedUntil = new Date(
          Date.now() + LOCK_DURATION_MINUTES * 60 * 1000,
        );
        updateData.failedLoginCount = 0;
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });

      await this.log(user.id, 'auth:login_failed', {
        attempt: newFailCount,
        locked: newFailCount >= MAX_FAILED_ATTEMPTS,
      });

      if (newFailCount >= MAX_FAILED_ATTEMPTS) {
        throw new ForbiddenException(
          `Đăng nhập sai quá ${MAX_FAILED_ATTEMPTS} lần. Tài khoản bị khóa ${LOCK_DURATION_MINUTES} phút.`,
        );
      }

      throw new UnauthorizedException(
        `Mật khẩu không đúng. Còn ${MAX_FAILED_ATTEMPTS - newFailCount} lần thử.`,
      );
    }

    if (user.status === UserStatus.PENDING_APPROVAL) {
      throw new ForbiddenException(
        'Tài khoản đang chờ Admin duyệt. Vui lòng liên hệ quản trị viên.',
      );
    }

    // Reset failed attempts and record last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    // ── Issue tokens ────────────────────────────────────────────
    const jti = randomUUID();
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      jti,
    };
    const accessTokenExpiresIn = rememberMe
      ? '30d'
      : this.configService.get('JWT_EXPIRES_IN', '15m');

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: accessTokenExpiresIn,
    });

    // Always create a refresh token for seamless session renewal
    const refreshTokenRaw = this.jwtService.sign(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
        jti: randomUUID(),
      },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: '30d',
      },
    );

    // Store hashed refresh token in DB
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshTokenRaw),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await this.log(user.id, 'auth:login');

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        fullName: user.profile?.fullName,
        avatarUrl: user.profile?.avatarUrl,
      },
    };
  }

  // ─── Refresh Token ────────────────────────────────────────────
  async refresh(rawRefreshToken: string) {
    // Verify signature & expiry
    let payload: any;
    try {
      payload = this.jwtService.verify(rawRefreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }

    // Validate against DB record
    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash: this.hashToken(rawRefreshToken),
        userId: payload.sub,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã bị thu hồi',
      );
    }

    // Verify user is still active
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, role: true, status: true },
    });

    if (!user || user.status === 'LOCKED') {
      throw new UnauthorizedException('Tài khoản không hợp lệ');
    }

    // ── Token rotation: revoke old, issue new ──────────────────
    const jti = randomUUID();
    const newAccessToken = this.jwtService.sign(
      { sub: user.id, username: user.username, role: user.role, jti },
      { expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m') },
    );

    const newRefreshTokenRaw = this.jwtService.sign(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
        jti: randomUUID(),
      },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: '30d',
      },
    );

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { isRevoked: true },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(newRefreshTokenRaw),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    return { accessToken: newAccessToken, refreshToken: newRefreshTokenRaw };
  }

  // ─── Register (UC-14) ────────────────────────────────────────
  async register(dto: RegisterDto) {
    const {
      role,
      username: rawUsername,
      fullName,
      phone,
      email,
      password,
      gender,
      dateOfBirth,
      subjectsTaught,
      gradesHandled,
      experienceDesc,
      idCardNumber,
      bankAccount,
      bankName,
      guardianName,
      guardianPhone,
      guardianRelation,
    } = dto;
    const username = rawUsername.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    const normalizedFullName = fullName.trim();

    if (username.length < 3) {
      throw new BadRequestException('Username tối thiểu 3 ký tự');
    }
    if (!gender) {
      throw new BadRequestException('Vui lòng chọn giới tính');
    }
    if (role === 'STUDENT' && !dateOfBirth) {
      throw new BadRequestException('Vui lòng nhập ngày sinh của học sinh');
    }

    const parsedDateOfBirth =
      role === 'STUDENT' && dateOfBirth ? new Date(dateOfBirth) : undefined;
    if (
      parsedDateOfBirth instanceof Date &&
      Number.isNaN(parsedDateOfBirth.getTime())
    ) {
      throw new BadRequestException('Ngày sinh không hợp lệ');
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: username, mode: 'insensitive' } },
          { email: { equals: normalizedEmail, mode: 'insensitive' } },
          { phone: normalizedPhone },
        ],
      },
    });
    if (existing) {
      if (existing.username.toLowerCase() === username) {
        throw new ConflictException('Username đã được sử dụng');
      }
      if (existing.email.toLowerCase() === normalizedEmail) {
        throw new ConflictException('Email đã được sử dụng');
      }
      throw new ConflictException('Số điện thoại đã được sử dụng');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            username,
            email: normalizedEmail,
            phone: normalizedPhone,
            passwordHash,
            role: role as any,
            status: 'PENDING_APPROVAL',
            profile: {
              create: {
                fullName: normalizedFullName,
                gender,
                ...(parsedDateOfBirth && { dateOfBirth: parsedDateOfBirth }),
              },
            },
          },
        });

        if (role === 'TEACHER') {
          await tx.teacherProfile.create({
            data: {
              userId: newUser.id,
              subjectsTaught: subjectsTaught || [],
              gradesHandled: gradesHandled || [],
              experienceDesc,
              idCardNumber,
              bankAccountNumber: bankAccount,
              bankName,
            },
          });
        } else {
          await tx.studentProfile.create({
            data: {
              userId: newUser.id,
              guardianName,
              guardianPhone,
              guardianRole: (guardianRelation as any) || undefined,
            },
          });
        }

        return newUser;
      });
    } catch (e: any) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const target = Array.isArray(e.meta?.target) ? e.meta.target : [];
        if (target.includes('username')) {
          throw new ConflictException('Username đã được sử dụng');
        }
        if (target.includes('email')) {
          throw new ConflictException('Email đã được sử dụng');
        }
        if (target.includes('phone')) {
          throw new ConflictException('Số điện thoại đã được sử dụng');
        }
      }
      throw e;
    }

    return {
      message: 'Đăng ký thành công. Tài khoản đang chờ Admin duyệt.',
      userId: user.id,
    };
  }

  // ─── Forgot Password / Send OTP (UC-18) ──────────────────────
  async forgotPassword(dto: ForgotPasswordDto) {
    const { identifier } = dto;

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    });

    // Always return generic message to prevent user enumeration
    if (!user) {
      return { message: 'Nếu tài khoản tồn tại, mã OTP đã được gửi.' };
    }

    // ── OTP rate limit: max 3 per hour per user ────────────────
    const otpCount = await this.redisService.incrementOtpCount(user.id);
    if (otpCount > OTP_MAX_PER_HOUR) {
      this.logger.warn(
        `OTP rate limit exceeded for user ${user.id} (${otpCount} attempts)`,
      );
      return { message: 'Nếu tài khoản tồn tại, mã OTP đã được gửi.' };
    }

    // Invalidate old OTPs
    await this.prisma.otpToken.updateMany({
      where: { userId: user.id, isUsed: false },
      data: { isUsed: true },
    });

    // Generate 6-digit OTP using CSPRNG (crypto.randomInt — not Math.random)
    const otp = randomInt(100000, 1000000).toString();
    const expiryMinutes =
      this.configService.get<number>('OTP_EXPIRY_MINUTES') || 10;

    await this.prisma.otpToken.create({
      data: {
        userId: user.id,
        token: otp,
        expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
      },
    });

    await this.sendOtpEmail(user.email, otp, expiryMinutes);
    await this.log(user.id, 'auth:otp_sent');

    return { message: 'Nếu tài khoản tồn tại, mã OTP đã được gửi.' };
  }

  // ─── Verify OTP ───────────────────────────────────────────────
  async verifyOtp(dto: VerifyOtpDto) {
    const { identifier, otp } = dto;

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    });

    if (!user) throw new BadRequestException('Thông tin không hợp lệ');

    const otpToken = await this.prisma.otpToken.findFirst({
      where: {
        userId: user.id,
        token: otp,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!otpToken) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    return { valid: true, message: 'OTP hợp lệ' };
  }

  // ─── Reset Password ───────────────────────────────────────────
  async resetPassword(dto: ResetPasswordDto) {
    const { identifier, otp, newPassword } = dto;

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    });

    if (!user) throw new BadRequestException('Thông tin không hợp lệ');

    const otpToken = await this.prisma.otpToken.findFirst({
      where: {
        userId: user.id,
        token: otp,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!otpToken) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.otpToken.update({
        where: { id: otpToken.id },
        data: { isUsed: true },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      }),
    ]);

    await this.log(user.id, 'auth:password_reset');

    return { message: 'Mật khẩu đã được đặt lại thành công' };
  }

  // ─── Logout (UC-02) ──────────────────────────────────────────
  async logout(userId: string, jti?: string, exp?: number) {
    // Blacklist the access token jti for its remaining TTL
    if (jti && exp) {
      const ttlSeconds = Math.max(0, exp - Math.floor(Date.now() / 1000));
      await this.redisService.setBlacklist(jti, ttlSeconds);
    }

    // Revoke all active refresh tokens for this user
    await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });

    await this.log(userId, 'auth:logout');
    this.logger.log(`User ${userId} logged out`);

    return { message: 'Đăng xuất thành công' };
  }

  // ─── Change Password (UC-20) ──────────────────────────────────
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const { currentPassword, newPassword, confirmPassword } = dto;

    if (newPassword !== confirmPassword) {
      throw new BadRequestException('Mật khẩu xác nhận không khớp');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    });

    await this.log(userId, 'auth:password_changed');

    return { message: 'Đổi mật khẩu thành công' };
  }
}
