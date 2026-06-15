import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import * as bcrypt from 'bcrypt';
import { InvoicesService } from '../invoices/invoices.service';

export interface CreateUserInput {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserInput {
  fullName?: string;
  email?: string;
  phone?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private invoicesService: InvoicesService,
  ) {}

  async findAll(
    page: number | string,
    limit: number | string,
    search?: string,
    role?: UserRole,
    status?: UserStatus,
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

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true, teacherProfile: true, studentProfile: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  async create(dto: CreateUserInput) {
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

  async update(id: string, dto: UpdateUserInput) {
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

  async lock(id: string, reason: string, closeInvoices = false) {
    if (!reason) throw new BadRequestException('Lý do khóa là bắt buộc');
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    const invoiceArchive =
      user.role === 'STUDENT'
        ? await this.invoicesService.archiveStudentInvoicesForLock(
            id,
            closeInvoices,
          )
        : null;

    const locked = await this.prisma.user.update({
      where: { id },
      data: { status: 'LOCKED', lockReason: reason },
      select: { id: true, status: true, lockReason: true },
    });
    return { ...locked, invoiceArchive };
  }

  async unlock(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE', lockReason: null, failedLoginCount: 0, lockedUntil: null },
      select: { id: true, status: true },
    });
  }

  async approve(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE' },
      select: { id: true, status: true },
    });
  }

  async resetPassword(id: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Mật khẩu mới tối thiểu 8 ký tự');
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      select: { id: true, username: true },
    });
  }

  async remove(id: string) {
    await this.prisma.user.delete({ where: { id } });
  }
}
