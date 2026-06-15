import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EnrollmentsService } from './enrollments.service';

class EnrollDto {
  @ApiProperty() @IsNotEmpty() @IsString() classId: string;
}

class RemoveStudentDto {
  @ApiProperty() @IsNotEmpty() @IsString() enrollmentId: string;
  @ApiProperty() @IsNotEmpty() @IsString() reason: string;
}

@ApiTags('Enrollments - Đăng ký học')
@ApiBearerAuth()
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post()
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh đăng ký lớp học (UC-19)' })
  async register(@CurrentUser('id') studentId: string, @Body() dto: EnrollDto) {
    return this.enrollmentsService.register(studentId, dto.classId);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh hủy yêu cầu đăng ký (UC-19)' })
  async cancel(@Param('id') id: string, @CurrentUser('id') studentId: string) {
    return this.enrollmentsService.cancel(id, studentId);
  }

  @Patch(':id/approve')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Duyệt học sinh vào lớp (UC-12)' })
  async approve(@Param('id') id: string, @CurrentUser('id') teacherId: string) {
    return this.enrollmentsService.approve(id, teacherId);
  }

  @Patch(':id/remove')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Loại học sinh khỏi lớp (UC-12)' })
  async remove(@Param('id') id: string, @Body() dto: RemoveStudentDto) {
    return this.enrollmentsService.remove(id, dto.reason);
  }

  @Get('class/:classId')
  @ApiOperation({ summary: 'Danh sách đăng ký của lớp' })
  async getByClass(@Param('classId') classId: string, @Query('status') status?: string) {
    return this.enrollmentsService.getByClass(classId, status);
  }

  @Get('my')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh: Xem danh sách đăng ký của mình' })
  async myEnrollments(@CurrentUser('id') studentId: string) {
    return this.enrollmentsService.myEnrollments(studentId);
  }

  @Post('admin-add')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Thêm trực tiếp học sinh vào lớp (UC-04)' })
  async adminAdd(@Body() dto: { studentId: string; classId: string }) {
    return this.enrollmentsService.adminAdd(dto.studentId, dto.classId);
  }

  @Patch('admin-remove/:enrollmentId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Xóa học sinh khỏi lớp trực tiếp (UC-04)' })
  async adminRemove(@Param('enrollmentId') enrollmentId: string) {
    return this.enrollmentsService.adminRemove(enrollmentId);
  }
}
