import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus, BadRequestException, ConflictException, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class CreateTimeSlotDto {
  @ApiProperty({ enum: ['MON','TUE','WED','THU','FRI','SAT','SUN'] })
  @IsEnum(['MON','TUE','WED','THU','FRI','SAT','SUN'])
  dayOfWeek: any;
  @ApiProperty({ example: '08:00' }) @IsNotEmpty() @IsString() startTime: string;
  @ApiProperty({ example: '10:00' }) @IsNotEmpty() @IsString() endTime: string;
  @ApiProperty({ example: 'Thứ 2 - 08:00-10:00' }) @IsNotEmpty() @IsString() label: string;
}

class AssignScheduleDto {
  @ApiProperty() @IsNotEmpty() @IsString() classId: string;
  @ApiProperty() @IsNotEmpty() @IsString() roomId: string;
  @ApiProperty() @IsNotEmpty() @IsString() timeSlotId: string;
  @ApiProperty() @IsNotEmpty() @IsString() teacherId: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
}

class ReportAbsenceDto {
  @ApiProperty() @IsNotEmpty() @IsString() scheduleId: string;
  @ApiProperty() @IsNotEmpty() @IsString() reason: string;
}

class RegisterMakeupDto {
  @ApiProperty() @IsNotEmpty() @IsString() cancelledScheduleId: string; // Ca đã báo nghỉ
  @ApiProperty() @IsNotEmpty() @IsString() roomId: string;
  @ApiProperty() @IsNotEmpty() @IsString() timeSlotId: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() weekDate?: string; // Tuần học bù
}

@ApiTags('Schedules - Thời khóa biểu')
@ApiBearerAuth()
@Controller('schedules')
export class SchedulesController {
  constructor(private prisma: PrismaService) {}

  // Time slots management
  @Get('timeslots')
  @ApiOperation({ summary: 'Danh sách khung giờ' })
  getTimeSlots() {
    return this.prisma.timeSlot.findMany({ orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] });
  }

  @Post('timeslots')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo khung giờ mới (UC-05)' })
  async createTimeSlot(@Body() dto: CreateTimeSlotDto) {
    // Check time overlap on same day
    const existing = await this.prisma.timeSlot.findMany({
      where: { dayOfWeek: dto.dayOfWeek },
    });
    const conflict = existing.find(s =>
      dto.startTime < s.endTime && dto.endTime > s.startTime,
    );
    if (conflict) {
      throw new ConflictException(
        `Khung giờ ${dto.startTime}–${dto.endTime} bị trùng với ${conflict.startTime}–${conflict.endTime} ngày ${conflict.dayOfWeek}`,
      );
    }
    return this.prisma.timeSlot.create({ data: dto });
  }

  @Patch('timeslots/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Sửa khung giờ (UC-05)' })
  async updateTimeSlot(
    @Param('id') id: string,
    @Body() body: { startTime?: string; endTime?: string; label?: string },
  ) {
    const slot = await this.prisma.timeSlot.findUnique({ where: { id } });
    if (!slot) throw new NotFoundException('Không tìm thấy khung giờ');

    const start = body.startTime ?? slot.startTime;
    const end = body.endTime ?? slot.endTime;

    if (start >= end) throw new BadRequestException('Giờ bắt đầu phải nhỏ hơn giờ kết thúc');

    // Check overlap with siblings (same day, exclude self)
    const siblings = await this.prisma.timeSlot.findMany({
      where: { dayOfWeek: slot.dayOfWeek, id: { not: id } },
    });
    const conflict = siblings.find(s => start < s.endTime && end > s.startTime);
    if (conflict) {
      throw new ConflictException(
        `Trùng giờ với khung ${conflict.startTime}–${conflict.endTime}`,
      );
    }

    return this.prisma.timeSlot.update({
      where: { id },
      data: {
        startTime: start,
        endTime: end,
        ...(body.label && { label: body.label }),
      },
    });
  }

  @Delete('timeslots/:id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa khung giờ' })
  async deleteTimeSlot(@Param('id') id: string) {
    await this.prisma.timeSlot.delete({ where: { id } });
  }


  // Schedule grid
  @Get('grid')
  @ApiOperation({ summary: 'Bảng thời khóa biểu dạng Grid (UC-05)' })
  async getGrid() {
    const [timeSlots, rooms, schedules] = await Promise.all([
      this.prisma.timeSlot.findMany({ orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] }),
      this.prisma.room.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      this.prisma.schedule.findMany({
        where: { type: { in: ['REGULAR', 'MAKEUP'] } },
        include: {
          class: true,
          room: true,
          timeSlot: true,
          creator: { include: { profile: true } },
        },
      }),
    ]);

    return { timeSlots, rooms, schedules };
  }

  // Admin: Assign schedule to grid cell (UC-05)
  @Post('assign')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Phân công lịch học vào ô Grid (UC-05)' })
  async assign(@Body() dto: AssignScheduleDto, @CurrentUser('id') adminId: string) {
    // Check teacher conflict
    const teacherConflict = await this.prisma.schedule.findFirst({
      where: {
        teacherId: dto.teacherId,
        timeSlotId: dto.timeSlotId,
        type: { not: 'CANCELLED' },
        endDate: null,
      },
    });
    if (teacherConflict) {
      throw new ConflictException('Giáo viên đã có lịch dạy vào khung giờ này');
    }

    // Check room conflict
    const roomConflict = await this.prisma.schedule.findFirst({
      where: {
        roomId: dto.roomId,
        timeSlotId: dto.timeSlotId,
        type: { not: 'CANCELLED' },
        endDate: null,
      },
    });
    if (roomConflict) {
      throw new ConflictException('Phòng học đã được sử dụng trong khung giờ này');
    }

    return this.prisma.schedule.create({
      data: {
        classId: dto.classId, roomId: dto.roomId,
        timeSlotId: dto.timeSlotId, teacherId: dto.teacherId,
        type: 'REGULAR',
        effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : new Date(),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        createdBy: adminId,
      },
      include: { class: true, room: true, timeSlot: true },
    });
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa phân công lịch học' })
  async remove(@Param('id') id: string) {
    await this.prisma.schedule.delete({ where: { id } });
  }

  // Teacher: View personal schedule (UC-13)
  @Get('my')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Xem thời khóa biểu cá nhân (UC-13)' })
  async mySchedule(@CurrentUser('id') teacherId: string) {
    return this.prisma.schedule.findMany({
      where: {
        teacherId,
        type: { not: 'CANCELLED' },
      },
      include: {
        class: true, room: true, timeSlot: true,
      },
      orderBy: [{ timeSlot: { dayOfWeek: 'asc' } }, { timeSlot: { startTime: 'asc' } }],
    });
  }

  // Teacher: Report absence (UC-13 Thao tác 2)
  @Post('report-absence')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Báo nghỉ ca dạy (UC-13)' })
  async reportAbsence(
    @Body() dto: ReportAbsenceDto,
    @CurrentUser('id') teacherId: string,
  ) {
    if (!dto.reason || dto.reason.trim() === '') {
      throw new BadRequestException('Lý do nghỉ là bắt buộc');
    }

    const schedule = await this.prisma.schedule.findUnique({
      where: { id: dto.scheduleId },
    });
    if (!schedule || schedule.teacherId !== teacherId) {
      throw new NotFoundException('Không tìm thấy lịch dạy');
    }

    return this.prisma.schedule.update({
      where: { id: dto.scheduleId },
      data: { type: 'CANCELLED', cancelReason: dto.reason },
    });
  }

  // Teacher: Register makeup session (UC-13 Thao tác 3)
  @Post('register-makeup')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Đăng ký học bù (UC-13)' })
  async registerMakeup(
    @Body() dto: RegisterMakeupDto,
    @CurrentUser('id') teacherId: string,
  ) {
    const cancelledSchedule = await this.prisma.schedule.findUnique({
      where: { id: dto.cancelledScheduleId },
    });
    if (!cancelledSchedule || cancelledSchedule.teacherId !== teacherId) {
      throw new NotFoundException('Không tìm thấy ca đã báo nghỉ');
    }
    if (cancelledSchedule.type !== 'CANCELLED') {
      throw new BadRequestException('Ca học này chưa được đánh dấu báo nghỉ');
    }

    // Calculate the week of makeup (current week's Monday)
    const weekDate = dto.weekDate ? new Date(dto.weekDate) : new Date();
    const startOfWeek = new Date(weekDate);
    startOfWeek.setDate(weekDate.getDate() - weekDate.getDay() + 1);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    // Check conflicts
    const roomConflict = await this.prisma.schedule.findFirst({
      where: { roomId: dto.roomId, timeSlotId: dto.timeSlotId, type: { not: 'CANCELLED' } },
    });
    if (roomConflict) throw new ConflictException('Phòng học đã được sử dụng trong khung giờ này');

    const teacherConflict = await this.prisma.schedule.findFirst({
      where: { teacherId, timeSlotId: dto.timeSlotId, type: { not: 'CANCELLED' } },
    });
    if (teacherConflict) throw new ConflictException('Giáo viên đã có lịch dạy vào khung giờ này');

    return this.prisma.schedule.create({
      data: {
        classId: cancelledSchedule.classId,
        roomId: dto.roomId,
        timeSlotId: dto.timeSlotId,
        teacherId,
        type: 'MAKEUP',
        effectiveDate: startOfWeek,
        endDate: endOfWeek,  // Chỉ có hiệu lực trong tuần đăng ký
        makeupForId: cancelledSchedule.id,
        weekOfMakeup: startOfWeek,
        createdBy: teacherId,
      },
      include: { class: true, room: true, timeSlot: true },
    });
  }

  // Student: View upcoming schedule (UC-15)
  @Get('student/upcoming')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh: Xem lịch sắp tới (UC-15)' })
  async studentUpcoming(@CurrentUser('id') studentId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, status: 'APPROVED' },
      select: { classId: true },
    });
    const classIds = enrollments.map((e) => e.classId);

    return this.prisma.schedule.findMany({
      where: {
        classId: { in: classIds },
        type: { not: 'CANCELLED' },
        effectiveDate: { gte: new Date() },
      },
      include: { class: true, room: true, timeSlot: true },
      orderBy: { effectiveDate: 'asc' },
    });
  }
}
