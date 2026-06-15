import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { GuardianRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../../database/prisma.service';

const PUBLIC_TEACHER_PROFILE_SELECT = {
  id: true,
  userId: true,
  subjectsTaught: true,
  gradesHandled: true,
  experienceDesc: true,
  idCardFrontUrl: true,
  idCardBackUrl: true,
  idCardNumber: true,
  bankAccountNumber: true,
  bankName: true,
  salaryQrCodeUrl: true,
  salaryQrCodeStorageKey: true,
  contractSignedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const TEACHER_COMPLETION_FIELDS = [
  { key: 'idCardNumber', label: 'Số CCCD/CMND' },
  { key: 'bankName', label: 'Tên ngân hàng' },
  { key: 'bankAccountNumber', label: 'Số tài khoản ngân hàng' },
] as const;

export interface UpdateTeacherProfileInput {
  idCardFrontUrl?: string;
  idCardBackUrl?: string;
  idCardNumber?: string;
  bankAccountNumber?: string;
  bankName?: string;
  salaryQrCodeUrl?: string;
  avatarUrl?: string;
  subjectsTaught?: string[];
  gradesHandled?: string[];
  experienceDesc?: string;
}

export interface UploadTeacherSalaryQrInput {
  fileName?: string;
  dataUrl: string;
}

export interface UpdateStudentProfileInput {
  fullName?: string;
  avatarUrl?: string;
  grade?: string;
  school?: string;
  guardianRole?: GuardianRole;
  guardianName?: string;
  guardianPhone?: string;
  guardianDateOfBirth?: string;
}

@Injectable()
export class ProfilesService {
  constructor(private prisma: PrismaService) {}

  async verifyPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw new UnauthorizedException('Mật khẩu không đúng');

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Mật khẩu không đúng');

    return { verified: true };
  }

  async getProfile(user: any) {
    const data = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        profile: true,
      },
    });

    return {
      ...data,
      fullName: data?.profile?.fullName,
      avatarUrl: data?.profile?.avatarUrl,
      address: data?.profile?.address,
      dateOfBirth: data?.profile?.dateOfBirth,
      gender: data?.profile?.gender,
      phone: data?.phone,
    };
  }

  async getTeacherProfile(userId: string) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: PUBLIC_TEACHER_PROFILE_SELECT,
    });
    return profile;
  }

  async getTeacherProfileCompletion(userId: string) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: {
        idCardNumber: true,
        bankName: true,
        bankAccountNumber: true,
      },
    });

    if (!profile) {
      return {
        isComplete: true,
        completion: 100,
        missingFields: [],
      };
    }

    const missingFields = TEACHER_COMPLETION_FIELDS.filter(({ key }) => {
      const value = profile[key];
      return typeof value !== 'string' || value.trim().length === 0;
    }).map(({ key, label }) => ({ key, label }));

    return {
      isComplete: missingFields.length === 0,
      completion: Math.round(
        ((TEACHER_COMPLETION_FIELDS.length - missingFields.length) /
          TEACHER_COMPLETION_FIELDS.length) *
          100,
      ),
      missingFields,
    };
  }

  async getStudentProfile(userId: string) {
    return this.prisma.studentProfile.findUnique({ where: { userId } });
  }

  async updateBaseProfile(user: any, body: any) {
    const { fullName, phone, address, avatarUrl, dateOfBirth, gender } = body;
    const normalizedDateOfBirth =
      dateOfBirth === undefined
        ? undefined
        : dateOfBirth
          ? new Date(dateOfBirth)
          : null;

    if (
      normalizedDateOfBirth instanceof Date &&
      Number.isNaN(normalizedDateOfBirth.getTime())
    ) {
      throw new BadRequestException('Ngày sinh không hợp lệ');
    }

    const [updated] = await Promise.all([
      this.prisma.profile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          fullName: fullName ?? '',
          ...(avatarUrl !== undefined && { avatarUrl }),
          ...(address !== undefined && { address }),
          ...(gender !== undefined && { gender }),
          ...(dateOfBirth !== undefined && {
            dateOfBirth: normalizedDateOfBirth,
          }),
        },
        update: {
          ...(fullName !== undefined && { fullName }),
          ...(avatarUrl !== undefined && { avatarUrl }),
          ...(address !== undefined && { address }),
          ...(gender !== undefined && { gender }),
          ...(dateOfBirth !== undefined && {
            dateOfBirth: normalizedDateOfBirth,
          }),
        },
      }),
      phone !== undefined
        ? this.prisma.user.update({ where: { id: user.id }, data: { phone } })
        : Promise.resolve(null),
    ]);
    return { message: 'Cập nhật thành công', profile: updated };
  }

  async updateTeacherProfile(userId: string, dto: UpdateTeacherProfileInput) {
    const { avatarUrl, ...teacherFields } = dto;
    const tp = await this.prisma.teacherProfile.update({
      where: { userId },
      data: {
        ...teacherFields,
        subjectsTaught: teacherFields.subjectsTaught,
        gradesHandled: teacherFields.gradesHandled,
      },
      select: PUBLIC_TEACHER_PROFILE_SELECT,
    });
    if (avatarUrl) {
      await this.prisma.profile.update({
        where: { userId },
        data: { avatarUrl },
      });
    }
    return tp;
  }

  async uploadTeacherSalaryQr(userId: string, dto: UploadTeacherSalaryQrInput) {
    if (!dto.dataUrl || typeof dto.dataUrl !== 'string') {
      throw new BadRequestException('Ảnh QR không hợp lệ');
    }

    const match = dto.dataUrl.match(
      /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/,
    );
    if (!match) {
      throw new BadRequestException(
        'Chỉ hỗ trợ ảnh QR dạng PNG/JPEG/WEBP base64',
      );
    }

    const mime = match[1];
    const base64 = match[2];
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      throw new BadRequestException('Ảnh QR không được vượt quá 2MB');
    }

    const extension =
      mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const storageKey = path.posix.join(
      'teacher-salary-qrs',
      userId,
      `${Date.now()}-${randomUUID()}.${extension}`,
    );

    if ((process.env.STORAGE_DRIVER ?? 'local') !== 'local') {
      throw new BadRequestException(
        'STORAGE_DRIVER hiện chưa triển khai trong môi trường này',
      );
    }

    const uploadRoot = process.env.LOCAL_UPLOAD_DIR || 'uploads';
    const fullPath = path.join(process.cwd(), uploadRoot, storageKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);

    const publicBaseUrl =
      process.env.PUBLIC_UPLOAD_BASE_URL ||
      `${process.env.API_PUBLIC_URL || 'http://localhost:3001'}/uploads`;
    const salaryQrCodeUrl = `${publicBaseUrl.replace(/\/$/, '')}/${storageKey}`;

    return this.prisma.teacherProfile.update({
      where: { userId },
      data: {
        salaryQrCodeUrl,
        salaryQrCodeStorageKey: storageKey,
      },
      select: PUBLIC_TEACHER_PROFILE_SELECT,
    });
  }

  async updateStudentProfile(userId: string, dto: UpdateStudentProfileInput) {
    // Validate guardian fields mandatory for student
    if (
      dto.guardianRole !== undefined ||
      dto.guardianName !== undefined ||
      dto.guardianPhone !== undefined ||
      dto.guardianDateOfBirth !== undefined
    ) {
      if (
        !dto.guardianRole ||
        !dto.guardianName ||
        !dto.guardianPhone ||
        !dto.guardianDateOfBirth
      ) {
        throw new BadRequestException(
          'Thông tin phụ huynh (Vai trò, Tên, Số điện thoại, Ngày sinh) là bắt buộc',
        );
      }
    }

    const [profile, studentProfile] = await Promise.all([
      this.prisma.profile.update({
        where: { userId },
        data: {
          fullName: dto.fullName,
          avatarUrl: dto.avatarUrl,
        },
      }),
      this.prisma.studentProfile.update({
        where: { userId },
        data: {
          grade: dto.grade,
          school: dto.school,
          guardianRole: dto.guardianRole,
          guardianName: dto.guardianName,
          guardianPhone: dto.guardianPhone,
          guardianDateOfBirth: dto.guardianDateOfBirth
            ? new Date(dto.guardianDateOfBirth)
            : undefined,
        },
      }),
    ]);

    return { profile, studentProfile };
  }
}
