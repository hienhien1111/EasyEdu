import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class EnrollDto {
  @ApiProperty() @IsNotEmpty() @IsString() classId: string;
}

class ApproveEnrollDto {
  @ApiProperty() @IsNotEmpty() @IsString() enrollmentId: string;
}

class RemoveStudentDto {
  @ApiProperty() @IsNotEmpty() @IsString() enrollmentId: string;
  @ApiProperty() @IsNotEmpty() @IsString() reason: string;
}

@ApiTags('Enrollments - Đăng ký học')
@ApiBearerAuth()
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private prisma: PrismaService) {}

  // Student: Register for a class (UC-19)
  @Post()
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh đăng ký lớp học (UC-19)' })
  async register(@CurrentUser('id') studentId: string, @Body() dto: EnrollDto) {
    const cls = await this.prisma.class.findUnique({
      where: { id: dto.classId },
      include: {
        _count: { select: { enrollments: { where: { status: 'APPROVED' } } } },
      },
    });
    if (!cls || !cls.isActive) throw new NotFoundException('Lớp học không tồn tại hoặc đã đóng');

    const existing = await this.prisma.enrollment.findUnique({
      where: { studentId_classId: { studentId, classId: dto.classId } },
    });
    if (existing) {
      if (existing.status === 'PENDING') throw new BadRequestException('Đã có yêu cầu đăng ký đang chờ duyệt');
      if (existing.status === 'APPROVED') throw new BadRequestException('Đã là thành viên lớp này');
    }

    return this.prisma.enrollment.create({
      data: { studentId, classId: dto.classId, status: 'PENDING' },
      include: { class: true },
    });
  }

  // Student: Cancel pending enrollment (UC-19)
  @Patch(':id/cancel')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh hủy yêu cầu đăng ký (UC-19)' })
  async cancel(@Param('id') id: string, @CurrentUser('id') studentId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id } });
    if (!enrollment || enrollment.studentId !== studentId) throw new NotFoundException('Không tìm thấy yêu cầu');
    if (enrollment.status !== 'PENDING') throw new BadRequestException('Chỉ có thể hủy yêu cầu đang chờ duyệt');
    return this.prisma.enrollment.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  // Teacher: Approve enrollment (UC-12)
  @Patch(':id/approve')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Duyệt học sinh vào lớp (UC-12)' })
  async approve(@Param('id') id: string, @CurrentUser('id') teacherId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id },
      include: { class: { include: { _count: { select: { enrollments: { where: { status: 'APPROVED' } } } } } } },
    });
    if (!enrollment) throw new NotFoundException('Không tìm thấy yêu cầu đăng ký');

    const cls = enrollment.class;
    if (cls._count.enrollments >= cls.maxStudents) {
      throw new ForbiddenException(`Lớp đã đạt sĩ số tối đa (${cls.maxStudents} học sinh)`);
    }

    return this.prisma.enrollment.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: teacherId, approvedAt: new Date() },
    });
  }

  // Teacher/Admin: Remove student from class (UC-12)
  @Patch(':id/remove')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Loại học sinh khỏi lớp (UC-12)' })
  async remove(@Param('id') id: string, @Body() dto: RemoveStudentDto) {
    return this.prisma.enrollment.update({
      where: { id },
      data: { status: 'REMOVED', removedAt: new Date(), removeReason: dto.reason },
    });
  }

  // Get enrollment list for a class
  @Get('class/:classId')
  @ApiOperation({ summary: 'Danh sách đăng ký của lớp' })
  async getByClass(@Param('classId') classId: string, @Query('status') status?: string) {
    return this.prisma.enrollment.findMany({
      where: { classId, status: status as any },
      include: { student: { include: { profile: true, studentProfile: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Student: Get my enrollments
  @Get('my')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh: Xem danh sách đăng ký của mình' })
  async myEnrollments(@CurrentUser('id') studentId: string) {
    return this.prisma.enrollment.findMany({
      where: { studentId },
      include: {
        class: { include: { teacher: { include: { profile: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Admin: Directly add a student to a class (bypass pending approval)
  @Post('admin-add')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Thêm trực tiếp học sinh vào lớp (UC-04)' })
  async adminAdd(@Body() dto: { studentId: string; classId: string }) {
    const { studentId, classId } = dto;
    if (!studentId || !classId) throw new BadRequestException('studentId và classId là bắt buộc');

    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      include: { _count: { select: { enrollments: { where: { status: 'APPROVED' } } } } },
    });
    if (!cls || !cls.isActive) throw new NotFoundException('Lớp học không tồn tại hoặc đã đóng');
    if (cls._count.enrollments >= cls.maxStudents) {
      throw new ForbiddenException(`Lớp đã đạt sĩ số tối đa (${cls.maxStudents} học sinh)`);
    }

    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    if (!student || student.role !== 'STUDENT') throw new NotFoundException('Không tìm thấy học sinh');

    // Upsert: if already exists set to APPROVED, else create
    const existing = await this.prisma.enrollment.findUnique({
      where: { studentId_classId: { studentId, classId } },
    });

    if (existing) {
      if (existing.status === 'APPROVED') throw new BadRequestException('Học sinh đã ở trong lớp này');
      return this.prisma.enrollment.update({
        where: { id: existing.id },
        data: { status: 'APPROVED', approvedAt: new Date() },
        include: { student: { include: { profile: true } } },
      });
    }

    return this.prisma.enrollment.create({
      data: { studentId, classId, status: 'APPROVED', approvedAt: new Date() },
      include: { student: { include: { profile: true } } },
    });
  }

  // Admin: Remove student directly
  @Patch('admin-remove/:enrollmentId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Xóa học sinh khỏi lớp trực tiếp (UC-04)' })
  async adminRemove(@Param('enrollmentId') enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) throw new NotFoundException('Không tìm thấy enrollment');
    return this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { status: 'REMOVED', removedAt: new Date() },
    });
  }
}
