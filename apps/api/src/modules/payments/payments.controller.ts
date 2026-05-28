import {
  Controller, Get, Post, Patch, Body, Param, Query,
  NotFoundException, BadRequestException, ForbiddenException, Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsPositive, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class InitiateQRPaymentDto {
  @ApiProperty() @IsNotEmpty() @IsString() invoiceId: string;
  @ApiProperty() @IsNumber() @IsPositive() amount: number; // Partial payment allowed
}

class InitiateCashPaymentDto {
  @ApiProperty() @IsNotEmpty() @IsString() invoiceItemId: string; // Specific class payment
  @ApiProperty() @IsNumber() @IsPositive() amount: number;
}

class ConfirmCashDto {
  @ApiProperty() @IsNotEmpty() @IsString() paymentId: string;
}

class WebhookDto {
  @IsNotEmpty() @IsString() transactionId: string;
  @IsNumber() amount: number;
  @IsString() description: string;
  @IsString() status: string; // 'SUCCESS' | 'FAILED'
}

class ManualApproveDto {
  @ApiProperty() @IsNotEmpty() @IsString() paymentId: string;
  @ApiProperty() @IsNotEmpty() @IsString() evidenceUrl: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class RequeryDto {
  @ApiProperty() @IsNotEmpty() @IsString() paymentId: string;
}

const MOCK_QR_BASE = 'https://img.vietqr.io/image/MB-0123456789-compact2.jpg?amount=';

@ApiTags('Payments - Thanh toán học phí')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private prisma: PrismaService) {}

  // Student: Initiate QR payment (UC-07 Luồng 1)
  @Post('qr/initiate')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh: Tạo mã QR thanh toán (UC-07)' })
  async initiateQR(@Body() dto: InitiateQRPaymentDto, @CurrentUser('id') studentId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: dto.invoiceId },
      include: { items: true },
    });
    if (!invoice || invoice.studentId !== studentId) throw new NotFoundException('Không tìm thấy hóa đơn');
    if (invoice.isPaymentLocked) {
      throw new ForbiddenException('Tài khoản thanh toán đã bị khóa. Vui lòng liên hệ Admin.');
    }

    const remaining = invoice.totalAmount - invoice.paidAmount;
    if (dto.amount > remaining) throw new BadRequestException('Số tiền thanh toán vượt quá số tiền còn nợ');

    // Check payment limit
    if (invoice.paymentCount >= invoice.maxPaymentTimes) {
      await this.prisma.invoice.update({ where: { id: dto.invoiceId }, data: { isPaymentLocked: true } });
      throw new ForbiddenException(`Đã đạt giới hạn ${invoice.maxPaymentTimes} lần nộp. Admin sẽ xử lý.`);
    }

    // Generate mock QR (in production, call PayOS/VietQR API)
    const qrCode = `${MOCK_QR_BASE}${dto.amount}&addInfo=EASYEDU-${invoice.id.slice(0, 8).toUpperCase()}`;

    const payment = await this.prisma.payment.create({
      data: {
        invoiceId: dto.invoiceId,
        method: 'QR',
        amount: dto.amount,
        status: 'PENDING',
        qrCode,
      },
    });

    await this.prisma.invoice.update({
      where: { id: dto.invoiceId },
      data: { paymentCount: { increment: 1 } },
    });

    return { payment, qrCode };
  }

  // Webhook: Receive payment result from bank (UC-07 Luồng 1)
  @Post('webhook')
  @ApiOperation({ summary: 'Webhook ngân hàng (UC-07)' })
  async handleWebhook(@Body() dto: WebhookDto) {
    this.logger.log(`Webhook received: ${JSON.stringify(dto)}`);

    const payment = await this.prisma.payment.findFirst({
      where: { status: 'PENDING', method: 'QR' },
      include: { invoice: true },
    });

    if (!payment) {
      this.logger.warn('No matching pending payment found for webhook');
      return { ok: true };
    }

    if (dto.status === 'SUCCESS') {
      const newPaid = payment.invoice.paidAmount + payment.amount;
      const newStatus = newPaid >= payment.invoice.totalAmount ? 'PAID' : 'PARTIALLY_PAID';

      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'SUCCESS',
            bankTransactionId: dto.transactionId,
            bankResponseRaw: dto as any,
            webhookReceivedAt: new Date(),
          },
        }),
        this.prisma.invoice.update({
          where: { id: payment.invoiceId },
          data: { paidAmount: newPaid, status: newStatus as any },
        }),
        this.prisma.receipt.create({
          data: {
            invoiceId: payment.invoiceId,
            paymentId: payment.id,
            receiptNo: `EE-${Date.now()}`,
          },
        }),
      ]);
    } else {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', bankResponseRaw: dto as any },
      });
    }

    return { ok: true };
  }

  // Student: Initiate cash payment for a class (UC-07 Luồng 2)
  @Post('cash/initiate')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh: Xác nhận đã nộp tiền mặt (UC-07)' })
  async initiateCash(@Body() dto: InitiateCashPaymentDto, @CurrentUser('id') studentId: string) {
    const invoiceItem = await this.prisma.invoiceItem.findUnique({
      where: { id: dto.invoiceItemId },
      include: {
        invoice: true,
        class: { include: { teacher: true } },
      },
    });
    if (!invoiceItem || invoiceItem.invoice.studentId !== studentId) {
      throw new NotFoundException('Không tìm thấy khoản thanh toán');
    }

    const payment = await this.prisma.payment.create({
      data: {
        invoiceId: invoiceItem.invoiceId,
        method: 'CASH',
        amount: dto.amount,
        status: 'PENDING',
        cashCollectorId: invoiceItem.class.teacherId,
      },
    });

    // TODO: Push notification to teacher
    this.logger.log(`Cash payment pending from student ${studentId} to teacher ${invoiceItem.class.teacherId}`);

    return { payment, message: 'Đã gửi yêu cầu xác nhận đến giáo viên' };
  }

  // Teacher: Confirm cash received (UC-07 Luồng 2)
  @Patch('cash/confirm')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Xác nhận đã nhận tiền mặt (UC-07)' })
  async confirmCash(@Body() dto: ConfirmCashDto, @CurrentUser('id') teacherId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
      include: { invoice: true },
    });
    if (!payment || payment.cashCollectorId !== teacherId) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }
    if (payment.status !== 'PENDING') throw new BadRequestException('Giao dịch đã được xử lý');

    const newPaid = payment.invoice.paidAmount + payment.amount;
    const newStatus = newPaid >= payment.invoice.totalAmount ? 'PAID' : 'PARTIALLY_PAID';

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: dto.paymentId },
        data: { status: 'SUCCESS', cashConfirmedAt: new Date() },
      }),
      this.prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: { paidAmount: newPaid, status: newStatus as any },
      }),
      this.prisma.receipt.create({
        data: {
          invoiceId: payment.invoiceId,
          paymentId: dto.paymentId,
          receiptNo: `EE-CASH-${Date.now()}`,
        },
      }),
    ]);

    return { message: 'Đã xác nhận nhận tiền mặt thành công' };
  }

  // Admin: Unlock payment limit (UC-07 Luồng 3)
  @Patch('unlock-limit/:invoiceId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Cấp thêm lượt nộp tiền (UC-07)' })
  async unlockPaymentLimit(@Param('invoiceId') invoiceId: string) {
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        isPaymentLocked: false,
        maxPaymentTimes: { increment: 1 },
      },
    });
  }

  // Admin: Get inquiries list (UC-08)
  @Get('inquiries')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Danh sách giao dịch cần tra soát (UC-08)' })
  async getInquiries() {
    return this.prisma.paymentInquiry.findMany({
      where: { status: 'PENDING' },
      include: {
        payment: { include: { invoice: { include: { student: { include: { profile: true } } } } } },
      },
    });
  }

  // Admin: Re-query payment (UC-08)
  @Post('inquiries/requery')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Truy vấn lại trạng thái giao dịch (UC-08)' })
  async requery(@Body() dto: RequeryDto) {
    const payment = await this.prisma.payment.findUnique({ where: { id: dto.paymentId } });
    if (!payment) throw new NotFoundException('Không tìm thấy giao dịch');

    // Mock: In production, call payment gateway API
    const mockGatewayResponse = { status: 'PENDING', message: 'Transaction not found' };
    this.logger.log(`Re-querying payment ${dto.paymentId}...`);

    const inquiry = await this.prisma.paymentInquiry.upsert({
      where: { paymentId: dto.paymentId },
      update: {
        requeryCount: { increment: 1 },
        lastRequeryAt: new Date(),
        lastResponseRaw: mockGatewayResponse as any,
      },
      create: {
        paymentId: dto.paymentId,
        requeryCount: 1,
        lastRequeryAt: new Date(),
        lastResponseRaw: mockGatewayResponse as any,
      },
    });

    return { inquiry, gatewayResponse: mockGatewayResponse };
  }

  // Admin: Manual approve with bill evidence (UC-08)
  @Patch('inquiries/manual-approve')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Duyệt thủ công thanh toán (UC-08)' })
  async manualApprove(@Body() dto: ManualApproveDto, @CurrentUser('id') adminId: string) {
    if (!dto.evidenceUrl) {
      throw new BadRequestException('Bắt buộc phải đính kèm hình ảnh minh chứng');
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
      include: { invoice: true },
    });
    if (!payment) throw new NotFoundException('Không tìm thấy giao dịch');

    const newPaid = payment.invoice.paidAmount + payment.amount;
    const newStatus = newPaid >= payment.invoice.totalAmount ? 'PAID' : 'PARTIALLY_PAID';

    await this.prisma.$transaction([
      this.prisma.payment.update({ where: { id: dto.paymentId }, data: { status: 'SUCCESS' } }),
      this.prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: { paidAmount: newPaid, status: newStatus as any },
      }),
      this.prisma.paymentInquiry.upsert({
        where: { paymentId: dto.paymentId },
        update: {
          status: 'RESOLVED_MANUAL',
          approvedBy: adminId,
          approvedAt: new Date(),
          evidenceUrl: dto.evidenceUrl,
          approveNote: dto.note,
        },
        create: {
          paymentId: dto.paymentId,
          status: 'RESOLVED_MANUAL',
          approvedBy: adminId,
          approvedAt: new Date(),
          evidenceUrl: dto.evidenceUrl,
          approveNote: dto.note,
        },
      }),
      this.prisma.receipt.create({
        data: {
          invoiceId: payment.invoiceId,
          paymentId: dto.paymentId,
          receiptNo: `EE-MANUAL-${Date.now()}`,
        },
      }),
    ]);

    return { message: 'Đã duyệt thủ công thành công' };
  }

  // Admin: Get all payments
  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Danh sách tất cả giao dịch' })
  async findAll(@Query('status') status?: string, @Query('method') method?: string) {
    const where: any = {};
    if (status && status.trim()) where.status = status;
    if (method && method.trim()) where.method = method;

    return this.prisma.payment.findMany({
      where,
      include: {
        invoice: { include: { student: { include: { profile: true } } } },
        cashCollector: { include: { profile: true } },
        receipts: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
