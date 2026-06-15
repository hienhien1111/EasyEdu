import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SchedulesService } from './schedules.service';

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
  @ApiProperty() @IsNotEmpty() @IsString() cancelledScheduleId: string;
  @ApiProperty() @IsNotEmpty() @IsString() roomId: string;
  @ApiProperty() @IsNotEmpty() @IsString() timeSlotId: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() weekDate?: string;
}

class WeeklyOverrideDto {
  @ApiProperty({ description: 'ID lịch REGULAR gốc muốn đổi' })
  @IsNotEmpty() @IsString() scheduleId: string;

  @ApiProperty({ description: 'Phòng mới cho tuần này' })
  @IsNotEmpty() @IsString() roomId: string;

  @ApiProperty({ description: 'Khung giờ mới cho tuần này' })
  @IsNotEmpty() @IsString() timeSlotId: string;

  @ApiPropertyOptional({ description: 'Lý do thay đổi' })
  @IsOptional() @IsString() reason?: string;
}

class AddWeeklySessionDto {
  @ApiProperty({ description: 'ID lớp học (phải do giáo viên giảng dạy)' })
  @IsNotEmpty() @IsString() classId: string;

  @ApiProperty({ description: 'Phòng học' })
  @IsNotEmpty() @IsString() roomId: string;

  @ApiProperty({ description: 'Khung giờ' })
  @IsNotEmpty() @IsString() timeSlotId: string;

  @ApiPropertyOptional({ description: 'Lý do thêm buổi' })
  @IsOptional() @IsString() reason?: string;
}

@ApiTags('Schedules - Thời khóa biểu')
@ApiBearerAuth()
@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  // ─── TimeSlots ────────────────────────────────────────────────

  @Get('timeslots')
  @ApiOperation({ summary: 'Danh sách khung giờ' })
  getTimeSlots() {
    return this.schedulesService.getTimeSlots();
  }

  @Post('timeslots')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo khung giờ mới (UC-05)' })
  async createTimeSlot(@Body() dto: CreateTimeSlotDto) {
    return this.schedulesService.createTimeSlot(dto);
  }

  @Patch('timeslots/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Sửa khung giờ (UC-05)' })
  async updateTimeSlot(
    @Param('id') id: string,
    @Body() body: { startTime?: string; endTime?: string; label?: string },
  ) {
    return this.schedulesService.updateTimeSlot(id, body);
  }

  @Delete('timeslots/:id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa khung giờ' })
  async deleteTimeSlot(@Param('id') id: string) {
    return this.schedulesService.deleteTimeSlot(id);
  }

  // ─── Admin: Grid ──────────────────────────────────────────────

  @Get('grid')
  @ApiOperation({ summary: 'Admin: Bảng thời khóa biểu (UC-05)' })
  @ApiQuery({ name: 'mode', enum: ['base', 'weekly'], required: false, description: 'base = lịch gốc, weekly = lịch tuần hiện tại (có override)' })
  async getGrid(@Query('mode') mode?: 'base' | 'weekly') {
    return this.schedulesService.getGrid(mode);
  }

  @Post('assign')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Phân công lịch học vào ô Grid (UC-05)' })
  async assign(@Body() dto: AssignScheduleDto, @CurrentUser('id') adminId: string) {
    return this.schedulesService.assign(dto, adminId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin: Xóa phân công lịch học' })
  async remove(@Param('id') id: string) {
    return this.schedulesService.remove(id);
  }

  // ─── Teacher: Grid tuần hiện tại ─────────────────────────────

  @Get('teacher-grid')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Grid thời khóa biểu tuần hiện tại (Thứ 2–CN, real-time)' })
  async teacherGrid(@CurrentUser('id') teacherId: string) {
    return this.schedulesService.teacherGrid(teacherId);
  }

  @Post('weekly-override')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Đổi lịch gốc sang ô khác trong tuần này' })
  async applyWeeklyOverride(
    @Body() dto: WeeklyOverrideDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.schedulesService.applyWeeklyOverride(dto, teacherId);
  }

  @Post('weekly-session')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Thêm buổi học tuần này vào ô trống' })
  async addWeeklySession(
    @Body() dto: AddWeeklySessionDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.schedulesService.addWeeklySession(dto, teacherId);
  }

  @Delete('weekly-override/:id')
  @Roles(UserRole.TEACHER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Giáo viên: Hoàn tác override / xóa buổi học tự thêm' })
  async removeWeeklyOverride(
    @Param('id') overrideId: string,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.schedulesService.removeWeeklyOverride(overrideId, teacherId);
  }

  // ─── Teacher: List view + báo nghỉ ───────────────────────────

  @Get('my')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Xem thời khóa biểu cá nhân dạng list (UC-13)' })
  async mySchedule(@CurrentUser('id') teacherId: string) {
    return this.schedulesService.mySchedule(teacherId);
  }

  @Post('report-absence')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Báo nghỉ ca dạy (UC-13)' })
  async reportAbsence(
    @Body() dto: ReportAbsenceDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.schedulesService.reportAbsence(dto, teacherId);
  }

  @Post('register-makeup')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Đăng ký học bù (UC-13)' })
  async registerMakeup(
    @Body() dto: RegisterMakeupDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.schedulesService.registerMakeup(dto, teacherId);
  }

  // ─── Student ──────────────────────────────────────────────────

  @Get('student/upcoming')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh: Xem lịch sắp tới (UC-15)' })
  async studentUpcoming(@CurrentUser('id') studentId: string) {
    return this.schedulesService.studentUpcoming(studentId);
  }
}
