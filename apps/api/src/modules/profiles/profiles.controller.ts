import {
  Controller, Get, Patch, Body, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsOptional, IsString, IsEnum, IsDateString, IsNumber, Min, Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { GuardianRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BadRequestException } from '@nestjs/common';

class UpdateTeacherProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() idCardFrontUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() idCardBackUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() idCardNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() taxCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() avatarUrl?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() subjectsTaught?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() gradesHandled?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() experienceDesc?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) salaryPercentage?: number;
}

class UpdateStudentProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() avatarUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() grade?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() school?: string;
  @ApiPropertyOptional({ enum: GuardianRole }) @IsOptional() @IsEnum(GuardianRole) guardianRole?: GuardianRole;
  @ApiPropertyOptional() @IsOptional() @IsString() guardianName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() guardianPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() guardianDateOfBirth?: string;
}

// Calculate teacher profile completeness %
function calcTeacherCompleteness(tp: any): number {
  const fields = ['idCardFrontUrl', 'idCardBackUrl', 'idCardNumber', 'bankAccountNumber', 'bankName', 'taxCode'];
  const filled = fields.filter((f) => tp[f]).length;
  return Math.round((filled / fields.length) * 100);
}

@ApiTags('Profile - Thông tin cá nhân')
@ApiBearerAuth()
@Controller('profile')
export class ProfilesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Xem thông tin cá nhân (UC-20)' })
  async getProfile(@CurrentUser() user: any) {
    const data = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        profile: true,
        teacherProfile: true,
        studentProfile: true,
      },
    });
    // Flatten profile fields for FE convenience
    return {
      ...data,
      fullName: data?.profile?.fullName,
      avatarUrl: data?.profile?.avatarUrl,
      address: (data?.profile as any)?.address,
      bio: (data?.profile as any)?.bio,
      phone: data?.phone,
    };
  }

  @Get('teacher')
  @ApiOperation({ summary: 'Xem hồ sơ giáo viên (UC-20)' })
  async getTeacherProfile(@CurrentUser() user: any) {
    return this.prisma.teacherProfile.findUnique({ where: { userId: user.id } });
  }

  @Get('student')
  @ApiOperation({ summary: 'Xem hồ sơ học sinh (UC-20)' })
  async getStudentProfile(@CurrentUser() user: any) {
    return this.prisma.studentProfile.findUnique({ where: { userId: user.id } });
  }

  @Patch()
  @ApiOperation({ summary: 'Cập nhật thông tin cơ bản (UC-20)' })
  async updateBaseProfile(
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    const { fullName, phone, address, bio, avatarUrl, dateOfBirth, gender } = body;
    const [updated] = await Promise.all([
      this.prisma.profile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, fullName: fullName ?? '' },
        update: {
          ...(fullName !== undefined && { fullName }),
          ...(avatarUrl !== undefined && { avatarUrl }),
        },
      }),
      phone !== undefined
        ? this.prisma.user.update({ where: { id: user.id }, data: { phone } })
        : Promise.resolve(null),
    ]);
    return { message: 'Cập nhật thành công', profile: updated };
  }

  @Patch('teacher')
  @ApiOperation({ summary: 'Cập nhật hồ sơ giáo viên (UC-20)' })
  async updateTeacherProfile(
    @CurrentUser() user: any,
    @Body() dto: UpdateTeacherProfileDto,
  ) {
    const tp = await this.prisma.teacherProfile.update({
      where: { userId: user.id },
      data: {
        ...dto,
        subjectsTaught: dto.subjectsTaught,
        gradesHandled: dto.gradesHandled,
      },
    });
    const completeness = calcTeacherCompleteness(tp);
    await this.prisma.teacherProfile.update({
      where: { userId: user.id },
      data: { profileCompleteness: completeness },
    });
    if (dto.avatarUrl) {
      await this.prisma.profile.update({
        where: { userId: user.id },
        data: { avatarUrl: dto.avatarUrl },
      });
    }
    return { ...tp, profileCompleteness: completeness };
  }

  @Patch('student')
  @ApiOperation({ summary: 'Cập nhật hồ sơ học sinh (UC-20)' })
  async updateStudentProfile(
    @CurrentUser() user: any,
    @Body() dto: UpdateStudentProfileDto,
  ) {
    // Validate guardian fields mandatory for student
    if (
      dto.guardianRole !== undefined ||
      dto.guardianName !== undefined ||
      dto.guardianPhone !== undefined ||
      dto.guardianDateOfBirth !== undefined
    ) {
      if (!dto.guardianRole || !dto.guardianName || !dto.guardianPhone || !dto.guardianDateOfBirth) {
        throw new BadRequestException(
          'Thông tin phụ huynh (Vai trò, Tên, Số điện thoại, Ngày sinh) là bắt buộc',
        );
      }
    }

    const [profile, studentProfile] = await Promise.all([
      this.prisma.profile.update({
        where: { userId: user.id },
        data: {
          fullName: dto.fullName,
          avatarUrl: dto.avatarUrl,
        },
      }),
      this.prisma.studentProfile.update({
        where: { userId: user.id },
        data: {
          grade: dto.grade,
          school: dto.school,
          guardianRole: dto.guardianRole,
          guardianName: dto.guardianName,
          guardianPhone: dto.guardianPhone,
          guardianDateOfBirth: dto.guardianDateOfBirth ? new Date(dto.guardianDateOfBirth) : undefined,
        },
      }),
    ]);

    return { profile, studentProfile };
  }
}
