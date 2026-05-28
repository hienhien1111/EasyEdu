import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';
import {
  IsString, IsOptional, IsEnum, IsEmail, IsNotEmpty, MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import * as bcrypt from 'bcrypt';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

class CreateUserDto {
  @ApiProperty() @IsNotEmpty() @IsString() fullName: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsNotEmpty() @IsString() phone: string;
  @ApiProperty() @IsNotEmpty() @IsString() @MinLength(8) password: string;
  @ApiProperty({ enum: UserRole }) @IsEnum(UserRole) role: UserRole;
}

class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
}

class LockUserDto {
  @ApiProperty() @IsNotEmpty() @IsString() reason: string;
}

@ApiTags('Admin - Quản lý người dùng')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách người dùng (UC-03)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiQuery({ name: 'status', required: false, enum: UserStatus })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
    @Query('role') role?: UserRole,
    @Query('status') status?: UserStatus,
  ) {
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(200, parseInt(String(limit), 10) || 20);
    const where: any = {};
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { profile: { fullName: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (role) where.role = role;
    if (status) where.status = status;

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        include: { profile: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: users.map((u) => ({
        id: u.id, username: u.username, email: u.email, phone: u.phone,
        role: u.role, status: u.status, fullName: u.profile?.fullName,
        avatarUrl: u.profile?.avatarUrl, lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
      })),
      meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết người dùng' })
  async findOne(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true, teacherProfile: true, studentProfile: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  @Post()
  @ApiOperation({ summary: 'Tạo tài khoản mới' })
  async create(@Body() dto: CreateUserDto, @CurrentUser('id') adminId: string) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { phone: dto.phone }] },
    });
    if (existing) {
      throw new ConflictException('Email hoặc số điện thoại đã tồn tại');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const username = dto.email.split('@')[0] + '_' + Date.now();

    return this.prisma.user.create({
      data: {
        username, email: dto.email, phone: dto.phone,
        passwordHash, role: dto.role, status: 'ACTIVE',
        profile: { create: { fullName: dto.fullName } },
      },
      include: { profile: true },
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật người dùng' })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    await this.prisma.profile.update({
      where: { userId: id },
      data: { fullName: dto.fullName },
    });

    if (dto.email || dto.phone) {
      const updateData: any = {};
      if (dto.email) updateData.email = dto.email;
      if (dto.phone) updateData.phone = dto.phone;
      await this.prisma.user.update({ where: { id }, data: updateData });
    }

    return this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });
  }

  @Patch(':id/lock')
  @ApiOperation({ summary: 'Khóa tài khoản (UC-03)' })
  async lock(@Param('id') id: string, @Body() dto: LockUserDto) {
    if (!dto.reason) throw new BadRequestException('Lý do khóa là bắt buộc');
    return this.prisma.user.update({
      where: { id },
      data: { status: 'LOCKED', lockReason: dto.reason },
      select: { id: true, status: true, lockReason: true },
    });
  }

  @Patch(':id/unlock')
  @ApiOperation({ summary: 'Mở khóa tài khoản' })
  async unlock(@Param('id') id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE', lockReason: null, failedLoginCount: 0, lockedUntil: null },
      select: { id: true, status: true },
    });
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Duyệt tài khoản chờ' })
  async approve(@Param('id') id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE' },
      select: { id: true, status: true },
    });
  }

  @Patch(':id/reset-password')
  @ApiOperation({ summary: 'Admin đặt lại mật khẩu người dùng' })
  async resetPassword(@Param('id') id: string, @Body() body: { newPassword: string }) {
    if (!body.newPassword || body.newPassword.length < 8) {
      throw new BadRequestException('Mật khẩu mới tối thiểu 8 ký tự');
    }
    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      select: { id: true, username: true },
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa người dùng' })
  async remove(@Param('id') id: string) {
    await this.prisma.user.delete({ where: { id } });
  }
}
