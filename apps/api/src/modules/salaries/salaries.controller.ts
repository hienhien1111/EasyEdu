import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SalaryStatus, UserRole } from '@prisma/client';
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsNumber,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SalariesService } from './salaries.service';

class CalculateSalaryDto {
  @ApiProperty() @IsNotEmpty() @IsString() teacherId: string;
  @ApiProperty() @IsNotEmpty() @IsString() periodLabel: string;
  @ApiProperty() @IsNotEmpty() @IsDateString() periodStart: string;
  @ApiProperty() @IsNotEmpty() @IsDateString() periodEnd: string;
}

class UpdateSalaryDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() salaryPercentage?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() manualAdjustment?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class MonthlyFinalizeDayDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  day?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  date?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  scheduledFinalizeAt?: string | null;
}

class ScheduleTeacherSalaryDto {
  @ApiProperty() @IsNotEmpty() @IsString() teacherId: string;
  @ApiProperty() @IsNotEmpty() @IsDateString() scheduledFinalizeAt: string;
}

@ApiTags('Salaries - Tính lương giáo viên')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('salaries')
export class SalariesController {
  constructor(private readonly salariesService: SalariesService) {}

  @Get('admin/dashboard')
  @ApiOperation({ summary: 'Admin: Tổng quan bảng lương nháp/tháng' })
  async dashboard() {
    return this.salariesService.dashboard();
  }

  @Get('admin/monthly-setting')
  @ApiOperation({ summary: 'Admin: Cấu hình ngày chốt lương tháng' })
  async getMonthlySetting() {
    return this.salariesService.getMonthlySetting();
  }

  @Patch('admin/monthly-setting')
  @ApiOperation({ summary: 'Admin: Cập nhật ngày chốt lương tháng' })
  async updateMonthlySetting(@Body() dto: MonthlyFinalizeDayDto) {
    return this.salariesService.updateMonthlyFinalizeDay(dto);
  }

  @Get('admin/monthly-prompt')
  @ApiOperation({ summary: 'Admin: Kiểm tra popup chọn ngày chốt lương tháng mới' })
  async monthlyPrompt() {
    return this.salariesService.shouldPromptMonthlyFinalizeDay();
  }

  @Post('admin/monthly-prompt/seen')
  @ApiOperation({ summary: 'Admin: Đánh dấu đã thấy popup chọn ngày chốt lương' })
  async markMonthlyPromptSeen() {
    return this.salariesService.markMonthlyPromptSeen();
  }

  @Post('admin/sync-drafts')
  @ApiOperation({ summary: 'Admin: Đồng bộ/tạo bản nháp lương tháng cho giáo viên hiện tại' })
  async syncDrafts() {
    return this.salariesService.syncMonthlyDrafts();
  }

  @Post('admin/run-due')
  @ApiOperation({ summary: 'Admin: Chốt các bảng lương đã đến ngày hẹn' })
  async runDue() {
    return this.salariesService.runDueSalaries();
  }

  @Post('admin/finalize-all-now')
  @ApiOperation({ summary: 'Admin: Chốt tất cả bảng lương nháp hiện tại' })
  async finalizeAllNow(@CurrentUser('id') adminId: string) {
    return this.salariesService.finalizeAllDraftsNow(adminId);
  }

  @Post('admin/schedule-teacher')
  @ApiOperation({ summary: 'Admin: Hẹn ngày chốt lương riêng cho giáo viên' })
  async scheduleTeacher(@Body() dto: ScheduleTeacherSalaryDto) {
    return this.salariesService.scheduleTeacherSalary(dto);
  }

  @Post('admin/finalize-teacher/:teacherId')
  @ApiOperation({ summary: 'Admin: Chốt lương ngay cho một giáo viên' })
  async finalizeTeacherNow(
    @Param('teacherId') teacherId: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.salariesService.finalizeTeacherNow(teacherId, adminId);
  }

  @Post('calculate')
  @ApiOperation({ summary: 'Tính lương giáo viên (UC-09)' })
  async calculate(@Body() dto: CalculateSalaryDto) {
    return this.salariesService.calculate(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách bảng lương' })
  async findAll(
    @Query('teacherId') teacherId?: string,
    @Query('period') period?: string,
    @Query('status') status?: SalaryStatus | 'ALL',
  ) {
    return this.salariesService.findAll(teacherId, period, status);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật thủ công bảng lương nháp (UC-09)' })
  async update(@Param('id') id: string, @Body() dto: UpdateSalaryDto) {
    return this.salariesService.update(id, dto);
  }

  @Patch(':id/issue')
  @ApiOperation({ summary: 'Chuyển bảng lương sang trạng thái cần thanh toán' })
  async issue(@Param('id') id: string, @CurrentUser('id') adminId: string) {
    return this.salariesService.markNeedsPayment(id, adminId);
  }

  @Patch(':id/pay')
  @ApiOperation({ summary: 'Xác nhận đã thanh toán lương giáo viên' })
  async pay(@Param('id') id: string, @CurrentUser('id') adminId: string) {
    return this.salariesService.markPaid(id, adminId);
  }

  @Patch(':id/finalize')
  @ApiOperation({ summary: 'Alias cũ: chuyển bảng lương sang cần thanh toán' })
  async finalize(@Param('id') id: string, @CurrentUser('id') adminId: string) {
    return this.salariesService.markNeedsPayment(id, adminId);
  }
}
