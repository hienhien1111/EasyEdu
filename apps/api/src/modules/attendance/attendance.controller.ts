import {
  Controller, Get, Post, Patch, Body, Param, Query, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AttendanceStatus, UserRole } from '@prisma/client';
import { IsString, IsNotEmpty, IsEnum, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class AttendanceRecordDto {
  @ApiProperty() @IsNotEmpty() @IsString() studentId: string;
  @ApiProperty({ enum: AttendanceStatus }) @IsEnum(AttendanceStatus) status: AttendanceStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() makeupSourceId?: string; // For MAKEUP type
}

class SaveAttendanceDto {
  @ApiProperty() @IsNotEmpty() @IsString() scheduleId: string;
  @ApiProperty({ type: [AttendanceRecordDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records: AttendanceRecordDto[];
}

// Check if within 24h edit window
function isWithinEditWindow(savedAt: Date | null): boolean {
  if (!savedAt) return true;
  return Date.now() - savedAt.getTime() < 24 * 60 * 60 * 1000;
}

@ApiTags('Attendance - Điểm danh')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private prisma: PrismaService) {}

  // Teacher: Get attendance for a schedule session (UC-11)
  @Get('schedule/:scheduleId')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy điểm danh của buổi học (UC-11)' })
  async getBySchedule(@Param('scheduleId') scheduleId: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        class: {
          include: {
            enrollments: {
              where: { status: 'APPROVED' },
              include: { student: { include: { profile: true } } },
            },
          },
        },
      },
    });
    if (!schedule) throw new NotFoundException('Không tìm thấy buổi học');

    const existingAttendances = await this.prisma.attendance.findMany({
      where: { scheduleId },
    });

    const attendanceMap = new Map(existingAttendances.map((a) => [a.studentId, a]));
    const students = schedule.class.enrollments.map((e) => ({
      studentId: e.studentId,
      fullName: e.student.profile?.fullName,
      attendance: attendanceMap.get(e.studentId) || null,
    }));

    return { schedule, students, savedAt: existingAttendances[0]?.savedAt || null };
  }

  // Teacher: Save attendance (UC-11)
  @Post('save')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Lưu điểm danh (UC-11)' })
  async saveAttendance(@Body() dto: SaveAttendanceDto, @CurrentUser('id') teacherId: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: dto.scheduleId },
    });
    if (!schedule) throw new NotFoundException('Không tìm thấy buổi học');
    if (schedule.teacherId !== teacherId) {
      throw new BadRequestException('Bạn không có quyền điểm danh lớp này');
    }

    // Check edit window
    const existingFirst = await this.prisma.attendance.findFirst({
      where: { scheduleId: dto.scheduleId },
    });
    if (existingFirst?.isLocked) {
      throw new BadRequestException('Đã quá 24h, điểm danh đã bị khóa');
    }
    if (existingFirst?.savedAt && !isWithinEditWindow(existingFirst.savedAt)) {
      throw new BadRequestException('Đã quá 24h kể từ lần lưu đầu tiên, không thể chỉnh sửa');
    }

    const savedAt = existingFirst?.savedAt || new Date();

    // For MAKEUP records: verify student has ABSENT_EXCUSED record (unused)
    for (const record of dto.records) {
      if (record.status === 'MAKEUP' && record.makeupSourceId) {
        const source = await this.prisma.attendance.findUnique({
          where: { id: record.makeupSourceId },
        });
        if (!source || source.status !== 'ABSENT_EXCUSED') {
          throw new BadRequestException(
            `Học sinh ${record.studentId} không có phép nghỉ hợp lệ để học bù`,
          );
        }
      }
    }

    // Upsert all attendance records
    await Promise.all(
      dto.records.map((record) =>
        this.prisma.attendance.upsert({
          where: {
            scheduleId_studentId: {
              scheduleId: dto.scheduleId,
              studentId: record.studentId,
            },
          },
          update: {
            status: record.status,
            note: record.note,
            makeupSourceId: record.makeupSourceId,
            savedAt,
          },
          create: {
            scheduleId: dto.scheduleId,
            studentId: record.studentId,
            status: record.status,
            note: record.note,
            makeupSourceId: record.makeupSourceId,
            savedAt,
          },
        }),
      ),
    );

    // Return list of absent students for popup display
    const absentStudents = await this.prisma.attendance.findMany({
      where: {
        scheduleId: dto.scheduleId,
        status: { in: ['ABSENT_EXCUSED', 'ABSENT_UNEXCUSED'] },
      },
      include: { student: { include: { profile: true } } },
    });

    return {
      message: 'Đã lưu điểm danh thành công',
      absentStudents,
    };
  }

  // Student: View attendance history (UC-15)
  @Get('my-history')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh: Xem lịch sử điểm danh (UC-15)' })
  async myHistory(@CurrentUser('id') studentId: string) {
    return this.prisma.attendance.findMany({
      where: { studentId },
      include: {
        schedule: {
          include: { class: true, room: true, timeSlot: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Auto-close: Get sessions needing auto-close (used by job)
  @Get('pending-autoclose')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Lấy danh sách chờ tự động chốt' })
  async getPendingAutoClose() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.prisma.attendance.findMany({
      where: {
        isLocked: false,
        savedAt: { lt: cutoff },
      },
    });
  }

  // Get students eligible for makeup (UC-11)
  @Get('eligible-makeup')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Lấy danh sách học sinh đủ điều kiện học bù (UC-11)' })
  async getEligibleMakeup(@Query('classId') classId: string) {
    return this.prisma.attendance.findMany({
      where: {
        status: 'ABSENT_EXCUSED',
        schedule: { classId },
      },
      include: {
        student: { include: { profile: true } },
        schedule: { include: { class: true, timeSlot: true } },
      },
    });
  }

  // Teacher: Get attendance sessions grouped by schedule for a class (used by history view)
  @Get('sessions')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Giáo viên: Lịch sử điểm danh theo buổi' })
  async getSessions(@Query('classId') classId: string) {
    if (!classId) throw new BadRequestException('classId là bắt buộc');

    // Get all schedules for this class that have at least 1 attendance record
    const schedules = await this.prisma.schedule.findMany({
      where: { classId },
      include: {
        timeSlot: true,
        room: true,
        attendances: {
          include: { student: { include: { profile: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Only return schedules that have attendance records
    return schedules
      .filter(s => s.attendances.length > 0)
      .map(s => ({
        scheduleId: s.id,
        dayOfWeek: s.timeSlot?.dayOfWeek ?? '',
        startTime: s.timeSlot?.startTime ?? '',
        endTime: s.timeSlot?.endTime ?? '',
        date: s.createdAt,
        room: s.room?.name ?? '—',
        records: s.attendances.map(a => ({
          id: a.id,
          status: a.status,
          note: a.note,
          createdAt: a.createdAt,
          savedAt: a.savedAt,
          student: a.student,
        })),
      }));
  }

  // Teacher: Edit a single attendance record within 24h window
  @Patch(':id')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Sửa 1 bản ghi điểm danh (trong 24h)' })
  async updateRecord(
    @Param('id') id: string,
    @Body() body: { status?: string; note?: string },
  ) {
    const record = await this.prisma.attendance.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Không tìm thấy bản ghi');
    if (record.isLocked) throw new BadRequestException('Bản ghi đã bị khóa sau 24h');
    if (!isWithinEditWindow(record.savedAt)) {
      throw new BadRequestException('Đã quá 24h kể từ lần lưu đầu, không thể chỉnh sửa');
    }
    return this.prisma.attendance.update({
      where: { id },
      data: {
        ...(body.status && { status: body.status as AttendanceStatus }),
        ...(body.note !== undefined && { note: body.note }),
      },
    });
  }
}
