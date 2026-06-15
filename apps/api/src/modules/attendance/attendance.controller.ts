import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AttendanceStatus, UserRole } from '@prisma/client';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AttendanceService } from './attendance.service';

class AttendanceRecordDto {
  @ApiProperty() @IsNotEmpty() @IsString() studentId: string;
  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() makeupSourceId?: string;
}

class SaveAttendanceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() scheduleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() weeklyOverrideId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sessionDate?: string;
  @ApiProperty({ type: [AttendanceRecordDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records: AttendanceRecordDto[];
}

class QuickMarkNotPresentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() scheduleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() weeklyOverrideId?: string;
  @ApiProperty() @IsNotEmpty() @IsString() sessionDate: string;
  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;
}

class AddMakeupStudentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() scheduleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() weeklyOverrideId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sessionDate?: string;
  @ApiProperty() @IsNotEmpty() @IsString() makeupSourceId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class CancelMakeupStudentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() scheduleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() weeklyOverrideId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sessionDate?: string;
  @ApiProperty() @IsNotEmpty() @IsString() makeupSourceId: string;
}

@ApiTags('Attendance - Điểm danh')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('current')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Buổi học đang diễn ra để điểm danh' })
  async getCurrentSessions(@CurrentUser('id') teacherId: string) {
    return this.attendanceService.getCurrentSessions(teacherId);
  }

  @Get('teaching-history')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Lịch sử dạy học và điểm danh' })
  async getTeachingHistory(
    @CurrentUser('id') teacherId: string,
    @Query('classId') classId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.attendanceService.getTeachingHistory(teacherId, {
      classId,
      status,
      search,
    });
  }

  @Get('unresolved-not-present')
  @Roles(UserRole.TEACHER)
  @ApiOperation({
    summary: 'Giáo viên: Các buổi đã kết thúc còn học sinh chưa có mặt',
  })
  async getUnresolvedNotPresent(@CurrentUser('id') teacherId: string) {
    return this.attendanceService.getUnresolvedNotPresent(teacherId);
  }

  @Get('schedule/:scheduleId')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy điểm danh của buổi học (UC-11)' })
  async getBySchedule(
    @Param('scheduleId') scheduleId: string,
    @Query('sessionDate') sessionDate?: string,
    @CurrentUser('id') userId?: string,
    @CurrentUser('role') role?: UserRole,
  ) {
    return this.attendanceService.getBySchedule(
      scheduleId,
      sessionDate,
      role === UserRole.TEACHER ? userId : undefined,
    );
  }

  @Post('save')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Lưu điểm danh (UC-11)' })
  async saveAttendance(
    @Body() dto: SaveAttendanceDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.attendanceService.saveAttendance(dto, teacherId);
  }

  @Post('makeup-student')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Thêm học sinh học bù vào buổi học' })
  async addMakeupStudent(
    @Body() dto: AddMakeupStudentDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.attendanceService.addMakeupStudent(dto, teacherId);
  }

  @Patch('makeup-student/cancel')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Hủy học sinh học bù khỏi buổi học' })
  async cancelMakeupStudent(
    @Body() dto: CancelMakeupStudentDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.attendanceService.cancelMakeupStudent(dto, teacherId);
  }

  @Get('my-history')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh: Xem lịch sử điểm danh (UC-15)' })
  async myHistory(@CurrentUser('id') studentId: string) {
    return this.attendanceService.myHistory(studentId);
  }

  @Get('pending-autoclose')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Lấy danh sách chờ tự động chốt' })
  async getPendingAutoClose() {
    return this.attendanceService.getPendingAutoClose();
  }

  @Get('eligible-makeup')
  @Roles(UserRole.TEACHER)
  @ApiOperation({
    summary: 'Lấy danh sách học sinh đủ điều kiện học bù (UC-11)',
  })
  async getEligibleMakeup(@Query('classId') classId: string) {
    return this.attendanceService.getEligibleMakeup(classId);
  }

  @Get('sessions')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Giáo viên: Lịch sử điểm danh theo buổi' })
  async getSessions(
    @Query('classId') classId: string,
    @CurrentUser('id') userId?: string,
    @CurrentUser('role') role?: UserRole,
  ) {
    return this.attendanceService.getSessions(
      classId,
      role === UserRole.TEACHER ? userId : undefined,
    );
  }

  @Patch('not-present/quick-mark')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Chấm nhanh học sinh còn Chưa có mặt' })
  async quickMarkNotPresent(
    @Body() dto: QuickMarkNotPresentDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.attendanceService.quickMarkNotPresent(dto, teacherId);
  }

  @Patch(':id')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Sửa 1 bản ghi điểm danh (trong 24h)' })
  async updateRecord(
    @Param('id') id: string,
    @Body() body: { status?: string; note?: string },
    @CurrentUser('id') userId?: string,
    @CurrentUser('role') role?: UserRole,
  ) {
    return this.attendanceService.updateRecord(
      id,
      body,
      role === UserRole.TEACHER ? userId : undefined,
    );
  }
}
