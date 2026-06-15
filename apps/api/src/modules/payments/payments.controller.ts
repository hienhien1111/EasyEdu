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
import {
  PaymentInquirySeverity,
  PaymentLimitRequestStatus,
  UserRole,
} from '@prisma/client';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsPositive,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';

class InitiateQRPaymentDto {
  @ApiProperty() @IsNotEmpty() @IsString() invoiceId: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() amount?: number;
}

class InitiateCashPaymentDto {
  @ApiProperty() @IsNotEmpty() @IsString() invoiceItemId: string;
  @ApiProperty() @IsNumber() @IsPositive() amount: number;
}

class ConfirmCashDto {
  @ApiProperty() @IsNotEmpty() @IsString() paymentId: string;
}

class ManualApproveDto {
  @ApiProperty() @IsNotEmpty() @IsString() paymentId: string;
  @ApiProperty() @IsNotEmpty() @IsString() evidenceUrl: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class RequeryDto {
  @ApiProperty() @IsNotEmpty() @IsString() paymentId: string;
}

class MarkNotReceivedDto {
  @ApiProperty() @IsNotEmpty() @IsString() paymentId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class OpenSettlementExceptionDto {
  @ApiProperty() @IsNotEmpty() @IsString() paymentId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional({ enum: PaymentInquirySeverity })
  @IsOptional()
  @IsEnum(PaymentInquirySeverity)
  severity?: PaymentInquirySeverity;
}

class ConfirmWebhookDto {
  @ApiProperty() @IsNotEmpty() @IsString() webhookUrl: string;
}

class PaymentLimitRequestDto {
  @ApiProperty() @IsNotEmpty() @IsString() invoiceId: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() requestedExtraTimes?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

class ReviewPaymentLimitRequestDto {
  @ApiProperty({ enum: PaymentLimitRequestStatus })
  @IsNotEmpty()
  @IsEnum(PaymentLimitRequestStatus)
  status: PaymentLimitRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

@ApiTags('Payments - Thanh toán học phí')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('qr/initiate')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh: Tạo link thanh toán PayOS (UC-07)' })
  async initiateQR(
    @Body() dto: InitiateQRPaymentDto,
    @CurrentUser('id') studentId: string,
  ) {
    return this.paymentsService.initiateQR(dto, studentId);
  }

  /**
   * Webhook PayOS gọi server – KHÔNG yêu cầu JWT
   */
  @Post('webhook')
  @Public()
  @ApiOperation({ summary: 'Webhook PayOS (UC-07) – public endpoint' })
  async handleWebhook(@Body() body: any) {
    return this.paymentsService.handleWebhook(body);
  }

  @Post('webhook/confirm')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Đăng ký URL webhook PayOS' })
  async confirmWebhook(@Body() dto: ConfirmWebhookDto) {
    return this.paymentsService.confirmPayosWebhookUrl(dto.webhookUrl);
  }

  @Post('cash/initiate')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh: Xác nhận đã nộp tiền mặt (UC-07)' })
  async initiateCash(
    @Body() dto: InitiateCashPaymentDto,
    @CurrentUser('id') studentId: string,
  ) {
    return this.paymentsService.initiateCash(dto, studentId);
  }

  @Get('cash/pending')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Danh sách hóa đơn tiền mặt chờ xác nhận' })
  async pendingCash(@CurrentUser('id') teacherId: string) {
    return this.paymentsService.getPendingCashForTeacher(teacherId);
  }

  @Patch('cash/confirm')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Xác nhận đã nhận tiền mặt (UC-07)' })
  async confirmCash(
    @Body() dto: ConfirmCashDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.paymentsService.confirmCash(dto, teacherId);
  }

  @Patch('unlock-limit/:invoiceId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Cấp thêm lượt nộp tiền (UC-07)' })
  async unlockPaymentLimit(@Param('invoiceId') invoiceId: string) {
    return this.paymentsService.unlockPaymentLimit(invoiceId);
  }

  @Post(':paymentId/check-request')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh: Yêu cầu admin tra soát một lượt thanh toán' })
  async requestPaymentCheck(
    @Param('paymentId') paymentId: string,
    @CurrentUser('id') studentId: string,
  ) {
    return this.paymentsService.requestPaymentCheck(paymentId, studentId);
  }

  @Post('limit-requests')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh: Yêu cầu thêm lượt chuyển khoản cho hóa đơn' })
  async requestPaymentLimit(
    @Body() dto: PaymentLimitRequestDto,
    @CurrentUser('id') studentId: string,
  ) {
    return this.paymentsService.requestPaymentLimit(dto, studentId);
  }

  @Get('limit-requests')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Danh sách yêu cầu thêm lượt chuyển khoản' })
  async getPaymentLimitRequests(@Query('status') status?: string) {
    return this.paymentsService.getPaymentLimitRequests(status);
  }

  @Patch('limit-requests/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Duyệt/từ chối yêu cầu thêm lượt chuyển khoản' })
  async reviewPaymentLimitRequest(
    @Param('id') id: string,
    @Body() dto: ReviewPaymentLimitRequestDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.paymentsService.reviewPaymentLimitRequest(id, adminId, dto);
  }

  @Get('inquiries')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Danh sách giao dịch cần tra soát (UC-08)' })
  async getInquiries() {
    return this.paymentsService.getInquiries();
  }

  @Post('inquiries/requery')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Admin: Truy vấn lại trạng thái giao dịch từ PayOS (UC-08)',
  })
  async requery(
    @Body() dto: RequeryDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.paymentsService.requery(dto, adminId);
  }

  @Patch('inquiries/manual-approve')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Duyệt thủ công thanh toán (UC-08)' })
  async manualApprove(
    @Body() dto: ManualApproveDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.paymentsService.manualApprove(dto, adminId);
  }

  @Patch('inquiries/not-received')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Kết luận chưa nhận được tiền' })
  async markNotReceived(
    @Body() dto: MarkNotReceivedDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.paymentsService.markInquiryNotReceived(dto, adminId);
  }

  @Post('inquiries/settlement-exception')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Admin: Mở hồ sơ đối soát khi hệ thống báo thành công nhưng cần kiểm tra tiền về tài khoản gốc',
  })
  async openSettlementException(
    @Body() dto: OpenSettlementExceptionDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.paymentsService.openSettlementException(dto, adminId);
  }

  /**
   * Student tự kiểm tra trạng thái thanh toán – gọi PayOS và tự cập nhật nếu đã thanh toán.
   * Dùng khi webhook localhost chưa nhận được (test environment).
   */
  @Get('check-status/:paymentId')
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary:
      'Học sinh: Kiểm tra & tự xác nhận trạng thái thanh toán PayOS (UC-07)',
  })
  async checkPaymentStatus(
    @Param('paymentId') paymentId: string,
    @CurrentUser('id') studentId: string,
  ) {
    return this.paymentsService.checkPaymentStatus(paymentId, studentId);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Danh sách tất cả giao dịch' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'method', required: false })
  async findAll(
    @Query('status') status?: string,
    @Query('method') method?: string,
  ) {
    return this.paymentsService.findAll(status, method);
  }
}
