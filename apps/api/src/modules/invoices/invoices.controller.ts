import {
  Controller, Get, Post, Patch, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InvoicePaymentMode, UserRole } from '@prisma/client';
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsNumber,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InvoicesService } from './invoices.service';

class CreateInvoiceDto {
  @ApiProperty() @IsNotEmpty() @IsString() studentId: string;
  @ApiProperty() @IsNotEmpty() @IsString() periodLabel: string;
  @ApiProperty() @IsNotEmpty() @IsDateString() periodStart: string;
  @ApiProperty() @IsNotEmpty() @IsDateString() periodEnd: string;
}

class MonthlyIssueDayDto {
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
  scheduledIssueAt?: string | null;
}

class DepositDto {
  @ApiProperty()
  @IsNumber()
  amount: number;
}

class ScheduleStudentInvoiceDto {
  @ApiProperty() @IsNotEmpty() @IsString() studentId: string;
  @ApiProperty() @IsNotEmpty() @IsDateString() scheduledIssueAt: string;
}

class IssueAllInvoicesNowDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  password: string;
}

class PaymentModeDto {
  @ApiProperty({ enum: InvoicePaymentMode })
  @IsEnum(InvoicePaymentMode)
  mode: InvoicePaymentMode;
}

@ApiTags('Invoices - Hóa đơn học phí')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get('admin/dashboard')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Tổng quan hóa đơn nháp/tháng' })
  async dashboard() {
    return this.invoicesService.dashboard();
  }

  @Get('admin/monthly-setting')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Cấu hình ngày xuất hóa đơn tháng' })
  async getMonthlySetting() {
    return this.invoicesService.getMonthlySetting();
  }

  @Patch('admin/monthly-setting')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Cập nhật ngày xuất hóa đơn tháng' })
  async updateMonthlySetting(@Body() dto: MonthlyIssueDayDto) {
    return this.invoicesService.updateMonthlyIssueDay(dto);
  }

  @Get('admin/monthly-prompt')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Kiểm tra popup chọn ngày xuất hóa đơn tháng mới' })
  async monthlyPrompt() {
    return this.invoicesService.shouldPromptMonthlyIssueDay();
  }

  @Post('admin/monthly-prompt/seen')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Đánh dấu đã thấy popup chọn ngày tháng mới' })
  async markMonthlyPromptSeen() {
    return this.invoicesService.markMonthlyPromptSeen();
  }

  @Post('admin/sync-drafts')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Đồng bộ/tạo bản nháp hóa đơn tháng cho học sinh đang học' })
  async syncDrafts() {
    return this.invoicesService.syncMonthlyDrafts();
  }

  @Post('admin/run-due')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Xuất các hóa đơn đã đến ngày hẹn' })
  async runDue() {
    return this.invoicesService.runDueInvoices();
  }

  @Post('admin/issue-all-now')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Xuất tất cả hóa đơn nháp có số tiền cần thu' })
  async issueAllNow(
    @CurrentUser('id') adminId: string,
    @Body() dto: IssueAllInvoicesNowDto,
  ) {
    return this.invoicesService.issueAllDraftsNow(adminId, dto);
  }

  @Post('admin/schedule-student')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Hẹn ngày xuất hóa đơn riêng cho học sinh' })
  async scheduleStudent(@Body() dto: ScheduleStudentInvoiceDto) {
    return this.invoicesService.scheduleStudentInvoice(dto);
  }

  @Post('admin/issue-student/:studentId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Xuất hóa đơn ngay cho một học sinh' })
  async issueStudentNow(@Param('studentId') studentId: string) {
    return this.invoicesService.issueStudentNow(studentId);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo hóa đơn học phí (UC-07)' })
  async create(@Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách hóa đơn' })
  async findAll(
    @Query('studentId') studentId?: string,
    @Query('status') status?: string,
    @Query('archive') archive?: 'active' | 'archived' | 'all',
  ) {
    return this.invoicesService.findAll({ studentId, status, archive });
  }

  @Get('my/invoices')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh: Xem hóa đơn của mình (UC-16)' })
  async myInvoices(@CurrentUser('id') studentId: string) {
    return this.invoicesService.myInvoices(studentId);
  }

  @Patch(':id/deposit')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Cập nhật tiền cọc trừ vào hóa đơn' })
  async addDeposit(@Param('id') id: string, @Body() dto: DepositDto) {
    return this.invoicesService.addDeposit(id, dto);
  }

  @Patch(':id/issue')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Xuất một hóa đơn nháp' })
  async issue(@Param('id') id: string) {
    return this.invoicesService.issueInvoice(id);
  }

  @Patch(':id/payment-mode')
  @ApiOperation({ summary: 'Chọn phương thức thanh toán cho hóa đơn' })
  async setPaymentMode(@Param('id') id: string, @Body() dto: PaymentModeDto) {
    return this.invoicesService.setPaymentMode(id, dto.mode);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết hóa đơn' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.invoicesService.findOne(id, user);
  }
}
