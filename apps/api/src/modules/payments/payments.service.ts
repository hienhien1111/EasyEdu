import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InquiryStatus,
  InvoicePaymentMode,
  InvoiceStatus,
  LedgerDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  PaymentEventActorType,
  PaymentEventType,
  PaymentCheckStatus,
  PaymentInquiryReason,
  PaymentInquiryResolution,
  PaymentInquirySeverity,
  PaymentLimitRequestStatus,
  PaymentStatus,
} from '@prisma/client';
import { PayOS } from '@payos/node';
import { PrismaService } from '../../database/prisma.service';

export interface InitiateQRPaymentInput {
  invoiceId: string;
  amount?: number;
}

export interface InitiateCashPaymentInput {
  invoiceItemId: string;
  amount: number;
}

export interface ConfirmCashInput {
  paymentId: string;
}

export interface WebhookInput {
  code: string;
  desc: string;
  success: boolean;
  data: Record<string, any>;
  signature: string;
}

export interface ManualApproveInput {
  paymentId: string;
  evidenceUrl: string;
  note?: string;
}

export interface RequeryInput {
  paymentId: string;
}

export interface MarkNotReceivedInput {
  paymentId: string;
  note?: string;
}

export interface OpenSettlementExceptionInput {
  paymentId: string;
  note?: string;
  severity?: PaymentInquirySeverity;
}

export interface PaymentLimitRequestInput {
  invoiceId: string;
  requestedExtraTimes?: number;
  reason?: string;
}

export interface ReviewPaymentLimitRequestInput {
  status: PaymentLimitRequestStatus;
  note?: string;
}

type ConfirmSource =
  | 'WEBHOOK'
  | 'CHECK_STATUS'
  | 'REQUERY'
  | 'MANUAL'
  | 'CASH'
  | 'MOCK';

type ConfirmPaymentOptions = {
  source: ConfirmSource;
  bankTransactionId?: string | null;
  bankResponseRaw?: any;
  webhookReceivedAt?: Date;
  cashConfirmedAt?: Date;
  paymentNote?: string | null;
  actorId?: string | null;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly publicUserSelect = {
    id: true,
    username: true,
    email: true,
    phone: true,
    role: true,
    status: true,
    profile: true,
  } as const;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    @Inject('PAYOS_CLIENT') private readonly payos: PayOS,
  ) {}

  async initiateQR(dto: InitiateQRPaymentInput, studentId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: dto.invoiceId },
      include: { items: true, payments: true },
    });
    if (!invoice || invoice.studentId !== studentId) {
      throw new NotFoundException('Không tìm thấy hóa đơn');
    }
    if (invoice.isPaymentLocked) {
      throw new ForbiddenException(
        'Tài khoản thanh toán đã bị khóa. Vui lòng liên hệ Admin.',
      );
    }
    if (invoice.status === InvoiceStatus.DRAFT) {
      throw new BadRequestException('Hóa đơn nháp chưa thể thanh toán');
    }
    if (invoice.paymentMode === InvoicePaymentMode.CASH) {
      throw new BadRequestException(
        'Hóa đơn đã chọn thanh toán tiền mặt, không thể chuyển khoản',
      );
    }
    const activeCashPayments = invoice.payments.some(
      (payment) => payment.method === 'CASH' && payment.status !== 'CANCELLED',
    );
    if (activeCashPayments) {
      throw new BadRequestException(
        'Hóa đơn đang thanh toán tiền mặt, không thể chuyển khoản',
      );
    }

    const remaining = invoice.totalAmount - invoice.paidAmount;
    if (remaining <= 0) {
      throw new BadRequestException('Hóa đơn đã được thanh toán đủ');
    }
    const successfulQrCount = invoice.payments.filter(
      (payment) =>
        payment.method === 'QR' && payment.status === PaymentStatus.SUCCESS,
    ).length;
    const isLastAllowedTransfer = successfulQrCount >= invoice.maxPaymentTimes - 1;
    const requestedAmount = isLastAllowedTransfer
      ? remaining
      : (dto.amount ?? remaining);
    if (requestedAmount > remaining) {
      throw new BadRequestException(
        'Số tiền thanh toán vượt quá số tiền còn nợ',
      );
    }
    if (requestedAmount <= 0) {
      throw new BadRequestException('Số tiền thanh toán không hợp lệ');
    }

    if (successfulQrCount >= invoice.maxPaymentTimes) {
      await this.prisma.invoice.update({
        where: { id: dto.invoiceId },
        data: { isPaymentLocked: true },
      });
      throw new ForbiddenException(
        `Đã đạt giới hạn ${invoice.maxPaymentTimes} lần nộp. Admin sẽ xử lý.`,
      );
    }

    const orderCode = await this.createUniquePayosOrderCode();
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const description = `EE-${invoice.id.slice(0, 8).toUpperCase()}`;
    const roundedAmount = Math.round(requestedAmount);

    let payosResponse: {
      qrCode: string;
      paymentLinkId: string;
      checkoutUrl: string;
    };

    if (this.isPayosConfigured()) {
      try {
        payosResponse = await this.payos.paymentRequests.create({
          orderCode,
          amount: roundedAmount,
          description,
          returnUrl: `${frontendUrl}/student/payments?payment=success`,
          cancelUrl: `${frontendUrl}/student/payments?payment=cancel`,
        });
      } catch (err) {
        this.logger.error(
          `PayOS createPaymentLink error: ${err?.message}`,
          err?.stack,
        );
        throw new BadRequestException(
          `Không thể tạo link thanh toán PayOS: ${err?.message}`,
        );
      }
    } else {
      payosResponse = this.createMockPaymentLink(
        dto.invoiceId,
        roundedAmount,
        orderCode,
        frontendUrl,
      );
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          invoiceId: dto.invoiceId,
          method: 'QR',
          amount: requestedAmount,
          status: PaymentStatus.PENDING,
          qrCode: payosResponse.qrCode,
          payosOrderCode: BigInt(orderCode),
          payosPaymentLinkId: payosResponse.paymentLinkId,
          checkoutUrl: payosResponse.checkoutUrl,
        },
      });

      await tx.invoice.update({
        where: { id: dto.invoiceId },
        data: {
          paymentMode: InvoicePaymentMode.QR,
        },
      });

      await this.logPaymentEvent(tx, {
        paymentId: created.id,
        invoiceId: dto.invoiceId,
        actorType: PaymentEventActorType.STUDENT,
        actorId: studentId,
        type: PaymentEventType.QR_LINK_CREATED,
        message: 'Học sinh tạo link thanh toán PayOS',
        payload: {
          amount: requestedAmount,
          roundedAmount,
          orderCode: String(orderCode),
          mock: !this.isPayosConfigured(),
        },
      });

      return created;
    });

    return {
      paymentId: payment.id,
      payment: {
        ...payment,
        payosOrderCode: payment.payosOrderCode?.toString(),
      },
      qrCode: payosResponse.qrCode,
      checkoutUrl: payosResponse.checkoutUrl,
      paymentLinkId: payosResponse.paymentLinkId,
      mock: !this.isPayosConfigured(),
    };
  }

  async handleWebhook(body: WebhookInput) {
    this.logger.log(`Webhook received: ${JSON.stringify(body)}`);

    let webhookData: any;
    try {
      webhookData = await this.getVerifiedWebhookData(body);
    } catch (err) {
      this.logger.error(`Webhook verify error: ${err?.message}`);
      return { ok: false, error: 'Invalid signature' };
    }

    const orderCode = webhookData?.orderCode;
    const amount = webhookData?.amount;
    const code = webhookData?.code ?? body?.code;
    const reference = webhookData?.reference ?? webhookData?.transactionId;
    this.logger.log(`Webhook verified. orderCode=${orderCode}, code=${code}`);

    if (!orderCode) {
      this.logger.warn('Webhook ignored because orderCode is missing');
      return { ok: true, ignored: 'missing_order_code' };
    }

    const payment = await this.prisma.payment.findFirst({
      where: { payosOrderCode: BigInt(orderCode) },
      include: { invoice: true },
    });
    if (!payment) {
      this.logger.warn(`No payment found for orderCode ${orderCode}`);
      return { ok: true, ignored: 'payment_not_found' };
    }

    if (
      amount !== undefined &&
      Math.round(Number(amount)) !== Math.round(payment.amount)
    ) {
      this.logger.warn(
        `Webhook amount mismatch for payment ${payment.id}: expected=${payment.amount}, actual=${amount}`,
      );
      await this.prisma.$transaction(async (tx) => {
        await this.upsertInquiry(tx, {
          paymentId: payment.id,
          status: InquiryStatus.NEEDS_MANUAL_REVIEW,
          reason: PaymentInquiryReason.AMOUNT_MISMATCH,
          severity: PaymentInquirySeverity.HIGH,
          lastResponseRaw: webhookData,
          adminNote: `Webhook lệch số tiền: expected=${payment.amount}, actual=${amount}`,
        });
        await this.logPaymentEvent(tx, {
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          actorType: PaymentEventActorType.PAYOS,
          type: PaymentEventType.WEBHOOK_AMOUNT_MISMATCH,
          message: 'Webhook PayOS lệch số tiền thanh toán',
          payload: {
            expectedAmount: payment.amount,
            actualAmount: amount,
            webhookData,
          },
        });
      });
      return { ok: true, ignored: 'amount_mismatch' };
    }

    if (code === '00' || body?.success === true) {
      const result = await this.confirmPaymentSuccess(payment.id, {
        source: 'WEBHOOK',
        bankTransactionId: reference ?? null,
        bankResponseRaw: webhookData,
        webhookReceivedAt: new Date(),
      });
      return { ok: true, alreadyProcessed: result.alreadyProcessed };
    }

    await this.markPaymentNotSuccessful(payment.id, PaymentStatus.FAILED, {
      bankResponseRaw: webhookData,
      actorType: PaymentEventActorType.PAYOS,
      eventType: PaymentEventType.WEBHOOK_FAILED,
      message: 'Webhook PayOS báo giao dịch không thành công',
    });
    return { ok: true };
  }

  async initiateCash(dto: InitiateCashPaymentInput, studentId: string) {
    const invoiceItem = await this.prisma.invoiceItem.findUnique({
      where: { id: dto.invoiceItemId },
      include: {
        invoice: { include: { payments: true, items: true } },
        class: { include: { teacher: true } },
      },
    });
    if (!invoiceItem || invoiceItem.invoice.studentId !== studentId) {
      throw new NotFoundException('Không tìm thấy khoản thanh toán');
    }
    if (invoiceItem.invoice.status === InvoiceStatus.DRAFT) {
      throw new BadRequestException('Hóa đơn nháp chưa thể thanh toán');
    }
    if (invoiceItem.invoice.paymentMode === InvoicePaymentMode.QR) {
      throw new BadRequestException(
        'Hóa đơn đang thanh toán chuyển khoản, không thể chuyển sang tiền mặt',
      );
    }
    const activeQrPayments = invoiceItem.invoice.payments.some(
      (payment) => payment.method === 'QR' && payment.status !== 'CANCELLED',
    );
    if (activeQrPayments) {
      throw new BadRequestException(
        'Hóa đơn đang thanh toán chuyển khoản, không thể chuyển sang tiền mặt',
      );
    }
    if (invoiceItem.isPaid) {
      throw new BadRequestException('Khoản học phí lớp này đã được thanh toán');
    }
    const payableAmount = Math.max(0, invoiceItem.payableAmount || invoiceItem.amount);
    if (payableAmount <= 0) {
      await this.prisma.invoiceItem.update({
        where: { id: invoiceItem.id },
        data: { isPaid: true },
      });
      return { payment: null, message: 'Khoản này đã được trừ hết bằng tiền cọc' };
    }
    if (Math.round(dto.amount) !== Math.round(payableAmount)) {
      throw new BadRequestException(
        'Thanh toán tiền mặt phải trả toàn bộ số tiền của từng lớp trong một lần',
      );
    }
    const pendingCashPayment = invoiceItem.invoice.payments.find(
      (payment) =>
        payment.invoiceItemId === invoiceItem.id &&
        payment.method === 'CASH' &&
        payment.status === PaymentStatus.PENDING,
    );
    if (pendingCashPayment) {
      throw new BadRequestException(
        'Khoản học phí lớp này đang chờ giáo viên xác nhận tiền mặt',
      );
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          invoiceId: invoiceItem.invoiceId,
          invoiceItemId: invoiceItem.id,
          method: 'CASH',
          amount: payableAmount,
          status: PaymentStatus.PENDING,
          cashCollectorId: invoiceItem.class.teacherId,
        },
      });
      await tx.invoice.update({
        where: { id: invoiceItem.invoiceId },
        data: { paymentMode: InvoicePaymentMode.CASH },
      });
      await this.logPaymentEvent(tx, {
        paymentId: created.id,
        invoiceId: invoiceItem.invoiceId,
        actorType: PaymentEventActorType.STUDENT,
        actorId: studentId,
        type: PaymentEventType.CASH_INITIATED,
        message: 'Học sinh gửi yêu cầu thanh toán tiền mặt theo lớp',
        payload: {
          invoiceItemId: invoiceItem.id,
          classId: invoiceItem.classId,
          collectorId: invoiceItem.class.teacherId,
          amount: payableAmount,
        },
      });
      return created;
    });

    this.logger.log(
      `Cash payment pending from student ${studentId} to teacher ${invoiceItem.class.teacherId}`,
    );

    return { payment, message: 'Đã gửi yêu cầu xác nhận đến giáo viên' };
  }

  async confirmCash(dto: ConfirmCashInput, teacherId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
    });
    if (!payment || payment.cashCollectorId !== teacherId) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const result = await this.confirmPaymentSuccess(dto.paymentId, {
      source: 'CASH',
      cashConfirmedAt: new Date(),
      actorId: teacherId,
    });

    return {
      message: result.alreadyProcessed
        ? 'Giao dịch đã được xác nhận thành công!'
        : 'Đã xác nhận nhận tiền mặt thành công',
      alreadyProcessed: result.alreadyProcessed,
    };
  }

  async unlockPaymentLimit(invoiceId: string) {
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        isPaymentLocked: false,
        maxPaymentTimes: { increment: 1 },
      },
    });
  }

  async getInquiries() {
    return this.prisma.paymentInquiry.findMany({
      where: {
        status: { in: [InquiryStatus.PENDING, InquiryStatus.NEEDS_MANUAL_REVIEW] },
      },
      include: {
        payment: {
          include: {
            invoice: {
              include: {
                student: { select: this.publicUserSelect },
                items: { include: { class: true } },
              },
            },
            events: { orderBy: { createdAt: 'desc' }, take: 6 },
          },
        },
      },
      orderBy: [
        { severity: 'desc' },
        { updatedAt: 'desc' },
      ],
    });
  }

  async requestPaymentCheck(paymentId: string, studentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { invoice: true },
    });
    if (!payment) throw new NotFoundException('Không tìm thấy giao dịch');
    if (payment.invoice.studentId !== studentId) {
      throw new ForbiddenException('Bạn không có quyền truy cập giao dịch này');
    }

    const { updated, inquiry } = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          checkStatus: PaymentCheckStatus.REQUESTED,
          studentRequestedCheckAt: new Date(),
        },
      });
      const opened = await this.upsertInquiry(tx, {
        paymentId,
        status: InquiryStatus.PENDING,
        reason: PaymentInquiryReason.STUDENT_REPORTED_MONEY_DEDUCTED,
        severity: PaymentInquirySeverity.NORMAL,
        openedBy: studentId,
        studentNote:
          'Học sinh yêu cầu tra soát vì đã thao tác thanh toán nhưng hệ thống chưa xác nhận.',
      });
      await this.logPaymentEvent(tx, {
        paymentId,
        invoiceId: payment.invoiceId,
        actorType: PaymentEventActorType.STUDENT,
        actorId: studentId,
        type: PaymentEventType.STUDENT_CHECK_REQUESTED,
        message: 'Học sinh yêu cầu admin tra soát lượt thanh toán',
      });

      return { updated: updatedPayment, inquiry: opened };
    });

    return { payment: updated, inquiry };
  }

  async requestPaymentLimit(dto: PaymentLimitRequestInput, studentId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: dto.invoiceId },
      include: { payments: true },
    });
    if (!invoice || invoice.studentId !== studentId) {
      throw new NotFoundException('Không tìm thấy hóa đơn');
    }
    if (invoice.paymentMode === InvoicePaymentMode.CASH) {
      throw new BadRequestException('Hóa đơn tiền mặt không hỗ trợ chia thêm lượt chuyển khoản');
    }
    if (invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Hóa đơn này chưa cần thêm lượt thanh toán');
    }

    const requestedExtraTimes = Math.max(1, Math.min(10, dto.requestedExtraTimes ?? 1));
    return this.prisma.paymentLimitRequest.create({
      data: {
        invoiceId: dto.invoiceId,
        studentId,
        requestedExtraTimes,
        reason: dto.reason,
      },
      include: {
        invoice: true,
        student: { select: this.publicUserSelect },
      },
    });
  }

  async getPaymentLimitRequests(status?: string) {
    return this.prisma.paymentLimitRequest.findMany({
      where: status ? { status: status as PaymentLimitRequestStatus } : undefined,
      include: {
        invoice: true,
        student: { select: this.publicUserSelect },
        reviewer: { select: this.publicUserSelect },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewPaymentLimitRequest(
    id: string,
    adminId: string,
    dto: ReviewPaymentLimitRequestInput,
  ) {
    const request = await this.prisma.paymentLimitRequest.findUnique({
      where: { id },
      include: { invoice: true },
    });
    if (!request) throw new NotFoundException('Không tìm thấy yêu cầu');
    if (request.status !== PaymentLimitRequestStatus.PENDING) {
      throw new BadRequestException('Yêu cầu đã được xử lý');
    }

    return this.prisma.$transaction(async (tx) => {
      const reviewed = await tx.paymentLimitRequest.update({
        where: { id },
        data: {
          status: dto.status,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          reviewNote: dto.note,
        },
      });

      if (dto.status === PaymentLimitRequestStatus.APPROVED) {
        await tx.invoice.update({
          where: { id: request.invoiceId },
          data: {
            maxPaymentTimes: { increment: request.requestedExtraTimes },
            isPaymentLocked: false,
          },
        });
      }

      return reviewed;
    });
  }

  async requery(dto: RequeryInput, adminId?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
    });
    if (!payment) throw new NotFoundException('Không tìm thấy giao dịch');

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: dto.paymentId },
        data: {
          checkStatus: PaymentCheckStatus.CHECKING,
          adminCheckedAt: new Date(),
        },
      });
      await this.upsertInquiry(tx, {
        paymentId: dto.paymentId,
        status: InquiryStatus.PENDING,
        reason: PaymentInquiryReason.WEBHOOK_MISSED,
        severity: PaymentInquirySeverity.NORMAL,
        handledBy: adminId,
      });
      await this.logPaymentEvent(tx, {
        paymentId: dto.paymentId,
        invoiceId: payment.invoiceId,
        actorType: PaymentEventActorType.ADMIN,
        actorId: adminId,
        type: PaymentEventType.PAYOS_REQUERY,
        message: 'Admin truy vấn lại trạng thái thanh toán từ PayOS',
      });
    });

    let gatewayResponse: any = {
      status: 'UNKNOWN',
      message: 'No PayOS orderCode',
    };
    let confirmResult: Awaited<
      ReturnType<typeof this.confirmPaymentSuccess>
    > | null = null;

    if (payment.status === PaymentStatus.SUCCESS) {
      confirmResult = await this.confirmPaymentSuccess(dto.paymentId, {
        source: 'REQUERY',
        actorId: adminId,
      });
      gatewayResponse = { status: 'PAID', message: 'Already confirmed' };
    } else if (!this.isPayosConfigured()) {
      gatewayResponse = { status: 'PAID', message: 'Mock PayOS auto-confirm' };
      confirmResult = await this.confirmPaymentSuccess(dto.paymentId, {
        source: 'MOCK',
        bankResponseRaw: gatewayResponse,
        webhookReceivedAt: new Date(),
        actorId: adminId,
      });
    } else if (payment.payosOrderCode) {
      try {
        gatewayResponse = await this.payos.paymentRequests.get(
          Number(payment.payosOrderCode),
        );
        this.logger.log(
          `PayOS requery for payment ${dto.paymentId}: ${JSON.stringify(gatewayResponse)}`,
        );
      } catch (err) {
        this.logger.error(`PayOS requery error: ${err?.message}`);
        gatewayResponse = { status: 'ERROR', message: err?.message };
      }

      if (gatewayResponse?.status === 'PAID') {
        confirmResult = await this.confirmPaymentSuccess(dto.paymentId, {
          source: 'REQUERY',
          bankTransactionId:
            gatewayResponse.transactions?.[0]?.reference ?? null,
          bankResponseRaw: gatewayResponse,
          webhookReceivedAt: new Date(),
          actorId: adminId,
        });
      } else if (gatewayResponse?.status === 'CANCELLED') {
        await this.markPaymentNotSuccessful(
          dto.paymentId,
          PaymentStatus.CANCELLED,
          {
            bankResponseRaw: gatewayResponse,
            actorType: PaymentEventActorType.ADMIN,
            actorId: adminId,
            eventType: PaymentEventType.PAYOS_REQUERY_CANCELLED,
            message: 'PayOS trả trạng thái đã hủy khi re-query',
          },
        );
      }
    }

    const status = this.resolveInquiryStatusFromGateway(
      gatewayResponse,
      Boolean(confirmResult),
    );
    const reason = this.resolveInquiryReasonFromGateway(gatewayResponse);
    const resolution = this.resolveInquiryResolutionFromGateway(
      gatewayResponse,
      Boolean(confirmResult),
    );
    const severity =
      gatewayResponse?.status === 'ERROR'
        ? PaymentInquirySeverity.HIGH
        : PaymentInquirySeverity.NORMAL;

    const inquiry = await this.prisma.paymentInquiry.upsert({
      where: { paymentId: dto.paymentId },
      update: {
        status,
        reason,
        resolution,
        severity,
        handledBy: adminId,
        handledAt:
          status === InquiryStatus.RESOLVED_AUTO ||
          status === InquiryStatus.NOT_RECEIVED
            ? new Date()
            : undefined,
        requeryCount: { increment: 1 },
        lastRequeryAt: new Date(),
        lastResponseRaw: gatewayResponse,
      },
      create: {
        paymentId: dto.paymentId,
        status,
        reason,
        resolution,
        severity,
        openedBy: adminId,
        handledBy: adminId,
        handledAt:
          status === InquiryStatus.RESOLVED_AUTO ||
          status === InquiryStatus.NOT_RECEIVED
            ? new Date()
            : undefined,
        requeryCount: 1,
        lastRequeryAt: new Date(),
        lastResponseRaw: gatewayResponse,
      },
    });

    await this.logPaymentEvent(this.prisma, {
      paymentId: dto.paymentId,
      invoiceId: payment.invoiceId,
      actorType: PaymentEventActorType.ADMIN,
      actorId: adminId,
      type: this.resolveRequeryEventType(gatewayResponse, Boolean(confirmResult)),
      message: confirmResult
        ? 'PayOS xác nhận thanh toán thành công khi re-query'
        : 'PayOS chưa xác nhận thanh toán khi re-query',
      payload: gatewayResponse,
    });

    return { inquiry, gatewayResponse, confirmed: !!confirmResult };
  }

  async checkPaymentStatus(paymentId: string, studentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { invoice: true },
    });

    if (!payment) throw new NotFoundException('Không tìm thấy giao dịch');
    if (payment.invoice.studentId !== studentId) {
      throw new ForbiddenException('Bạn không có quyền truy cập giao dịch này');
    }

    if (payment.status === PaymentStatus.SUCCESS) {
      return {
        status: PaymentStatus.SUCCESS,
        message: 'Giao dịch đã được xác nhận thành công trước đó',
        alreadyProcessed: true,
      };
    }

    if (!this.isPayosConfigured()) {
      const result = await this.confirmPaymentSuccess(paymentId, {
        source: 'MOCK',
        bankResponseRaw: { status: 'PAID', message: 'Mock PayOS auto-confirm' },
        webhookReceivedAt: new Date(),
        actorId: studentId,
      });

      return {
        status: PaymentStatus.SUCCESS,
        payosStatus: 'PAID',
        amount: result.payment.amount,
        message: 'Thanh toán đã được xác nhận thành công',
        alreadyProcessed: result.alreadyProcessed,
      };
    }

    if (!payment.payosOrderCode) {
      return {
        status: payment.status,
        message: 'Không có mã đơn hàng PayOS để tra cứu',
      };
    }

    let payosData: any;
    try {
      payosData = await this.payos.paymentRequests.get(
        Number(payment.payosOrderCode),
      );
      this.logger.log(
        `CheckStatus paymentId=${paymentId}: PayOS status=${payosData?.status}`,
      );
    } catch (err) {
      this.logger.error(`PayOS get error: ${err?.message}`);
      throw new BadRequestException(`Không thể kết nối PayOS: ${err?.message}`);
    }

    if (payosData?.status === 'PAID') {
      const result = await this.confirmPaymentSuccess(paymentId, {
        source: 'CHECK_STATUS',
        bankTransactionId: payosData.transactions?.[0]?.reference ?? null,
        bankResponseRaw: payosData,
        webhookReceivedAt: new Date(),
        actorId: studentId,
      });

      this.logger.log(
        `Payment ${paymentId} auto-confirmed from PayOS status check`,
      );

      return {
        status: PaymentStatus.SUCCESS,
        payosStatus: payosData.status,
        amount: result.payment.amount,
        message: 'Thanh toán đã được xác nhận thành công',
        alreadyProcessed: result.alreadyProcessed,
      };
    }

    if (payosData?.status === 'CANCELLED') {
      await this.markPaymentNotSuccessful(paymentId, PaymentStatus.CANCELLED, {
        bankResponseRaw: payosData,
        actorType: PaymentEventActorType.STUDENT,
        actorId: studentId,
        eventType: PaymentEventType.PAYMENT_MARKED_NOT_SUCCESSFUL,
        message: 'Học sinh kiểm tra và PayOS trả trạng thái đã hủy',
      });
    }

    return {
      status: payment.status,
      payosStatus: payosData?.status,
      message:
        payosData?.status === 'CANCELLED'
          ? 'Giao dịch đã bị hủy'
          : 'PayOS chưa ghi nhận thanh toán. Hệ thống sẽ tự cập nhật khi webhook về.',
    };
  }

  async manualApprove(dto: ManualApproveInput, adminId: string) {
    if (!dto.evidenceUrl) {
      throw new BadRequestException(
        'Bắt buộc phải đính kèm hình ảnh minh chứng',
      );
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
    });
    if (!payment) throw new NotFoundException('Không tìm thấy giao dịch');

    const result = await this.confirmPaymentSuccess(dto.paymentId, {
      source: 'MANUAL',
      paymentNote: dto.note ?? null,
      bankResponseRaw: { manual: true, evidenceUrl: dto.evidenceUrl, adminId },
      actorId: adminId,
    });

    await this.prisma.paymentInquiry.upsert({
      where: { paymentId: dto.paymentId },
      update: {
        status: InquiryStatus.RESOLVED_MANUAL,
        reason: PaymentInquiryReason.ADMIN_BANK_RECONCILIATION,
        resolution: PaymentInquiryResolution.MANUAL_BANK_CONFIRMED,
        severity: PaymentInquirySeverity.NORMAL,
        handledBy: adminId,
        handledAt: new Date(),
        approvedBy: adminId,
        approvedAt: new Date(),
        evidenceUrl: dto.evidenceUrl,
        approveNote: dto.note,
      },
      create: {
        paymentId: dto.paymentId,
        status: InquiryStatus.RESOLVED_MANUAL,
        reason: PaymentInquiryReason.ADMIN_BANK_RECONCILIATION,
        resolution: PaymentInquiryResolution.MANUAL_BANK_CONFIRMED,
        severity: PaymentInquirySeverity.NORMAL,
        openedBy: adminId,
        handledBy: adminId,
        handledAt: new Date(),
        approvedBy: adminId,
        approvedAt: new Date(),
        evidenceUrl: dto.evidenceUrl,
        approveNote: dto.note,
      },
    });

    return {
      message: result.alreadyProcessed
        ? 'Giao dịch đã được xác nhận trước đó'
        : 'Đã duyệt thủ công thành công',
      alreadyProcessed: result.alreadyProcessed,
    };
  }

  async markInquiryNotReceived(dto: MarkNotReceivedInput, adminId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
    });
    if (!payment) throw new NotFoundException('Không tìm thấy giao dịch');
    if (payment.status === PaymentStatus.SUCCESS) {
      throw new BadRequestException(
        'Giao dịch đã thành công. Hãy mở hồ sơ đối soát thay vì đánh dấu chưa nhận tiền.',
      );
    }

    await this.markPaymentNotSuccessful(dto.paymentId, PaymentStatus.CANCELLED, {
      actorType: PaymentEventActorType.ADMIN,
      actorId: adminId,
      eventType: PaymentEventType.PAYMENT_MARKED_NOT_SUCCESSFUL,
      message: 'Admin kết luận hệ thống chưa nhận được tiền',
      bankResponseRaw: { adminConclusion: 'NOT_RECEIVED', note: dto.note },
    });

    const inquiry = await this.prisma.paymentInquiry.upsert({
      where: { paymentId: dto.paymentId },
      update: {
        status: InquiryStatus.NOT_RECEIVED,
        reason: PaymentInquiryReason.ADMIN_BANK_RECONCILIATION,
        resolution: PaymentInquiryResolution.NOT_RECEIVED,
        handledBy: adminId,
        handledAt: new Date(),
        adminNote: dto.note,
      },
      create: {
        paymentId: dto.paymentId,
        status: InquiryStatus.NOT_RECEIVED,
        reason: PaymentInquiryReason.ADMIN_BANK_RECONCILIATION,
        resolution: PaymentInquiryResolution.NOT_RECEIVED,
        openedBy: adminId,
        handledBy: adminId,
        handledAt: new Date(),
        adminNote: dto.note,
      },
    });

    return { inquiry, message: 'Đã đánh dấu chưa nhận được tiền' };
  }

  async openSettlementException(
    dto: OpenSettlementExceptionInput,
    adminId: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
    });
    if (!payment) throw new NotFoundException('Không tìm thấy giao dịch');
    if (payment.status !== PaymentStatus.SUCCESS) {
      throw new BadRequestException(
        'Chỉ mở hồ sơ đối soát tài khoản gốc cho giao dịch đã thành công trên hệ thống',
      );
    }

    const inquiry = await this.prisma.$transaction(async (tx) => {
      const opened = await this.upsertInquiry(tx, {
        paymentId: dto.paymentId,
        status: InquiryStatus.NEEDS_MANUAL_REVIEW,
        reason: PaymentInquiryReason.ADMIN_BANK_RECONCILIATION,
        severity: dto.severity ?? PaymentInquirySeverity.HIGH,
        openedBy: adminId,
        handledBy: adminId,
        adminNote: dto.note,
      });
      await this.logPaymentEvent(tx, {
        paymentId: dto.paymentId,
        invoiceId: payment.invoiceId,
        actorType: PaymentEventActorType.ADMIN,
        actorId: adminId,
        type: PaymentEventType.SETTLEMENT_EXCEPTION_OPENED,
        message:
          'Admin mở hồ sơ đối soát vì hệ thống đã thành công nhưng cần kiểm tra tiền về tài khoản gốc',
        payload: { note: dto.note, severity: dto.severity },
      });
      return opened;
    });

    return { inquiry, message: 'Đã mở hồ sơ đối soát tài khoản gốc' };
  }

  async findAll(status?: string, method?: string) {
    const where: any = {};
    if (status && status.trim()) where.status = status;
    if (method && method.trim()) where.method = method;

    const payments = await this.prisma.payment.findMany({
      where,
      include: {
        invoice: {
          include: {
            student: { select: this.publicUserSelect },
            items: { include: { class: true } },
            paymentLimitRequests: true,
          },
        },
        invoiceItem: { include: { class: true } },
        cashCollector: { select: this.publicUserSelect },
        inquiry: true,
        events: { orderBy: { createdAt: 'desc' }, take: 6 },
        ledgerEntries: { orderBy: { occurredAt: 'desc' }, take: 3 },
        receipt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return payments.map((payment) => ({
      ...payment,
      payosOrderCode: payment.payosOrderCode?.toString() ?? null,
    }));
  }

  async getPendingCashForTeacher(teacherId: string) {
    const payments = await this.prisma.payment.findMany({
      where: {
        method: 'CASH',
        status: PaymentStatus.PENDING,
        cashCollectorId: teacherId,
      },
      include: {
        invoice: {
          include: {
            student: { select: this.publicUserSelect },
          },
        },
        invoiceItem: { include: { class: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return payments.map((payment) => ({
      ...payment,
      payosOrderCode: payment.payosOrderCode?.toString() ?? null,
    }));
  }

  async confirmPayosWebhookUrl(webhookUrl: string) {
    if (!this.isPayosConfigured()) {
      throw new BadRequestException('Chưa cấu hình PayOS credentials');
    }

    return this.payos.webhooks.confirm(webhookUrl);
  }

  private async confirmPaymentSuccess(
    paymentId: string,
    options: ConfirmPaymentOptions,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updateData: any = {
        status: PaymentStatus.SUCCESS,
      };
      if (options.bankTransactionId !== undefined) {
        updateData.bankTransactionId = options.bankTransactionId;
      }
      if (options.bankResponseRaw !== undefined) {
        updateData.bankResponseRaw = options.bankResponseRaw;
      }
      if (options.webhookReceivedAt !== undefined) {
        updateData.webhookReceivedAt = options.webhookReceivedAt;
      }
      if (options.cashConfirmedAt !== undefined) {
        updateData.cashConfirmedAt = options.cashConfirmedAt;
      }
      if (options.paymentNote !== undefined) {
        updateData.paymentNote = options.paymentNote;
      }

      const claim = await tx.payment.updateMany({
        where: {
          id: paymentId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
        },
        data: updateData,
      });

      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { invoice: { include: { items: true } }, invoiceItem: true, receipt: true },
      });
      if (!payment) throw new NotFoundException('Không tìm thấy giao dịch');

      if (claim.count === 0) {
        return {
          payment,
          invoice: payment.invoice,
          receipt: payment.receipt,
          alreadyProcessed: payment.status === PaymentStatus.SUCCESS,
        };
      }

      const incrementedInvoice = await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          paidAmount: { increment: payment.amount },
          ...(payment.method === 'QR' && {
            paymentCount: { increment: 1 },
          }),
        },
      });
      const paidAmount =
        incrementedInvoice.totalAmount <= 0
          ? 0
          : Math.min(incrementedInvoice.paidAmount, incrementedInvoice.totalAmount);

      if (payment.invoiceItemId) {
        await tx.invoiceItem.update({
          where: { id: payment.invoiceItemId },
          data: { isPaid: true },
        });
      }

      const unpaidItemCount = payment.invoiceItemId
        ? await tx.invoiceItem.count({
            where: { invoiceId: payment.invoiceId, isPaid: false },
          })
        : null;
      const status =
        incrementedInvoice.totalAmount <= 0 ||
        paidAmount >= incrementedInvoice.totalAmount ||
        unpaidItemCount === 0
          ? InvoiceStatus.PAID
          : InvoiceStatus.PARTIALLY_PAID;
      const invoice = await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { paidAmount, status },
      });

      if (status === InvoiceStatus.PAID) {
        await tx.invoiceItem.updateMany({
          where: { invoiceId: payment.invoiceId },
          data: { isPaid: true },
        });
      }

      const receipt = await tx.receipt.upsert({
        where: { paymentId },
        update: {},
        create: {
          invoiceId: payment.invoiceId,
          paymentId,
          receiptNo: this.buildReceiptNo(options.source, paymentId),
        },
      });

      await this.postLedgerForSuccessfulPayment(tx, payment, options);

      if (options.source !== 'MANUAL') {
        await tx.paymentInquiry.updateMany({
          where: {
            paymentId,
            status: {
              in: [InquiryStatus.PENDING, InquiryStatus.NEEDS_MANUAL_REVIEW],
            },
          },
          data: {
            status: InquiryStatus.RESOLVED_AUTO,
            resolution: PaymentInquiryResolution.PAYOS_CONFIRMED,
            handledBy: options.actorId ?? undefined,
            handledAt: new Date(),
            lastResponseRaw: options.bankResponseRaw,
            lastRequeryAt: new Date(),
          },
        });
      }

      await tx.payment.update({
        where: { id: paymentId },
        data: {
          checkStatus: PaymentCheckStatus.CONFIRMED,
          adminCheckedAt:
            options.source === 'REQUERY' || options.source === 'CHECK_STATUS'
              ? new Date()
              : undefined,
        },
      });

      await this.logPaymentEvent(tx, {
        paymentId,
        invoiceId: payment.invoiceId,
        actorType: this.actorTypeFromConfirmSource(options.source),
        actorId: options.actorId ?? undefined,
        type:
          options.source === 'MANUAL'
            ? PaymentEventType.MANUAL_APPROVED
            : options.source === 'CASH'
              ? PaymentEventType.CASH_CONFIRMED
              : PaymentEventType.PAYMENT_CONFIRMED,
        message: 'Hệ thống xác nhận lượt thanh toán thành công',
        payload: {
          source: options.source,
          amount: payment.amount,
          method: payment.method,
          bankTransactionId: options.bankTransactionId,
        },
      });

      return { payment, invoice, receipt, alreadyProcessed: false };
    });
  }

  private async markPaymentNotSuccessful(
    paymentId: string,
    status: PaymentStatus,
    options: {
      bankResponseRaw?: any;
      actorType?: PaymentEventActorType;
      actorId?: string;
      eventType?: PaymentEventType;
      message?: string;
    },
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { id: paymentId, status: PaymentStatus.PENDING },
        data: {
          status,
          checkStatus:
            status === PaymentStatus.FAILED || status === PaymentStatus.CANCELLED
              ? PaymentCheckStatus.NOT_RECEIVED
              : undefined,
          ...(options.bankResponseRaw !== undefined && {
            bankResponseRaw: options.bankResponseRaw,
          }),
        },
      });
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (payment) {
        await this.upsertInquiry(tx, {
          paymentId,
          status: InquiryStatus.NOT_RECEIVED,
          reason:
            status === PaymentStatus.CANCELLED
              ? PaymentInquiryReason.PAYOS_CANCELLED
              : PaymentInquiryReason.GATEWAY_ERROR,
          resolution:
            status === PaymentStatus.CANCELLED
              ? PaymentInquiryResolution.GATEWAY_CANCELLED
              : PaymentInquiryResolution.NOT_RECEIVED,
          handledBy: options.actorId,
          handledAt: new Date(),
          lastResponseRaw: options.bankResponseRaw,
        });
        await this.logPaymentEvent(tx, {
          paymentId,
          invoiceId: payment.invoiceId,
          actorType: options.actorType ?? PaymentEventActorType.SYSTEM,
          actorId: options.actorId,
          type:
            options.eventType ??
            PaymentEventType.PAYMENT_MARKED_NOT_SUCCESSFUL,
          message: options.message ?? 'Lượt thanh toán không thành công',
          payload: { status, bankResponseRaw: options.bankResponseRaw },
        });
      }
    });
  }

  private async upsertInquiry(
    tx: any,
    input: {
      paymentId: string;
      status: InquiryStatus;
      reason?: PaymentInquiryReason;
      resolution?: PaymentInquiryResolution | null;
      severity?: PaymentInquirySeverity;
      openedBy?: string;
      handledBy?: string;
      handledAt?: Date;
      lastResponseRaw?: any;
      studentNote?: string;
      adminNote?: string;
    },
  ) {
    const updateData: any = {
      status: input.status,
    };
    const createData: any = {
      paymentId: input.paymentId,
      status: input.status,
    };

    for (const key of [
      'reason',
      'resolution',
      'severity',
      'openedBy',
      'handledBy',
      'handledAt',
      'lastResponseRaw',
      'studentNote',
      'adminNote',
    ] as const) {
      if (input[key] !== undefined) {
        updateData[key] = input[key];
        createData[key] = input[key];
      }
    }

    return tx.paymentInquiry.upsert({
      where: { paymentId: input.paymentId },
      update: updateData,
      create: createData,
    });
  }

  private async logPaymentEvent(
    tx: any,
    input: {
      paymentId?: string | null;
      invoiceId?: string | null;
      actorType?: PaymentEventActorType;
      actorId?: string | null;
      type: PaymentEventType;
      message?: string;
      payload?: any;
    },
  ) {
    return tx.paymentEvent.create({
      data: {
        paymentId: input.paymentId ?? undefined,
        invoiceId: input.invoiceId ?? undefined,
        actorType: input.actorType ?? PaymentEventActorType.SYSTEM,
        actorId: input.actorId ?? undefined,
        type: input.type,
        message: input.message,
        payload: input.payload,
      },
    });
  }

  private async postLedgerForSuccessfulPayment(
    tx: any,
    payment: any,
    options: ConfirmPaymentOptions,
  ) {
    const type =
      payment.method === 'CASH'
        ? LedgerEntryType.CASH_COLLECTION
        : LedgerEntryType.STUDENT_PAYMENT;
    const existing = await tx.ledgerEntry.findFirst({
      where: {
        paymentId: payment.id,
        type,
        status: { not: LedgerEntryStatus.VOIDED },
      },
    });
    if (existing) return existing;

    const ledger = await tx.ledgerEntry.create({
      data: {
        entryNo: `LED-${payment.method}-${payment.id.slice(-10).toUpperCase()}`,
        type,
        direction: LedgerDirection.IN,
        status: LedgerEntryStatus.POSTED,
        amount: payment.amount,
        invoiceId: payment.invoiceId,
        invoiceItemId: payment.invoiceItemId,
        paymentId: payment.id,
        studentId: payment.invoice?.studentId,
        teacherId: payment.cashCollectorId,
        occurredAt:
          options.cashConfirmedAt ??
          options.webhookReceivedAt ??
          new Date(),
        postedAt: new Date(),
        description:
          payment.method === 'CASH'
            ? `Thu tiền mặt học phí - ${payment.invoice?.periodLabel ?? payment.invoiceId}`
            : `Thu chuyển khoản học phí - ${payment.invoice?.periodLabel ?? payment.invoiceId}`,
        metadata: {
          source: options.source,
          paymentMethod: payment.method,
          bankTransactionId: options.bankTransactionId,
        },
      },
    });

    await this.logPaymentEvent(tx, {
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      actorType: this.actorTypeFromConfirmSource(options.source),
      actorId: options.actorId ?? undefined,
      type: PaymentEventType.LEDGER_POSTED,
      message: 'Đã ghi nhận dòng tiền vào ledger',
      payload: {
        ledgerEntryId: ledger.id,
        entryNo: ledger.entryNo,
        type,
        amount: payment.amount,
      },
    });

    return ledger;
  }

  private actorTypeFromConfirmSource(source: ConfirmSource) {
    if (source === 'MANUAL' || source === 'REQUERY') {
      return PaymentEventActorType.ADMIN;
    }
    if (source === 'CASH') return PaymentEventActorType.TEACHER;
    if (source === 'WEBHOOK') return PaymentEventActorType.PAYOS;
    if (source === 'CHECK_STATUS') return PaymentEventActorType.STUDENT;
    return PaymentEventActorType.SYSTEM;
  }

  private resolveInquiryStatusFromGateway(
    gatewayResponse: any,
    confirmed: boolean,
  ) {
    if (confirmed) return InquiryStatus.RESOLVED_AUTO;
    if (gatewayResponse?.status === 'CANCELLED') {
      return InquiryStatus.NOT_RECEIVED;
    }
    return InquiryStatus.NEEDS_MANUAL_REVIEW;
  }

  private resolveInquiryReasonFromGateway(gatewayResponse: any) {
    if (gatewayResponse?.status === 'CANCELLED') {
      return PaymentInquiryReason.PAYOS_CANCELLED;
    }
    if (gatewayResponse?.status === 'ERROR') {
      return PaymentInquiryReason.GATEWAY_ERROR;
    }
    if (gatewayResponse?.status === 'UNKNOWN') {
      return PaymentInquiryReason.OTHER;
    }
    return PaymentInquiryReason.PAYOS_PENDING;
  }

  private resolveInquiryResolutionFromGateway(
    gatewayResponse: any,
    confirmed: boolean,
  ) {
    if (confirmed) return PaymentInquiryResolution.PAYOS_CONFIRMED;
    if (gatewayResponse?.status === 'CANCELLED') {
      return PaymentInquiryResolution.GATEWAY_CANCELLED;
    }
    return null;
  }

  private resolveRequeryEventType(gatewayResponse: any, confirmed: boolean) {
    if (confirmed) return PaymentEventType.PAYOS_REQUERY_CONFIRMED;
    if (gatewayResponse?.status === 'CANCELLED') {
      return PaymentEventType.PAYOS_REQUERY_CANCELLED;
    }
    return PaymentEventType.PAYOS_REQUERY_PENDING;
  }

  private async getVerifiedWebhookData(body: WebhookInput) {
    if (this.isPayosConfigured()) {
      return this.payos.webhooks.verify(body as any);
    }

    return body?.data ?? body;
  }

  private isPayosConfigured() {
    return Boolean(
      this.configService.get<string>('PAYOS_CLIENT_ID')?.trim() &&
      this.configService.get<string>('PAYOS_API_KEY')?.trim() &&
      this.configService.get<string>('PAYOS_CHECKSUM_KEY')?.trim(),
    );
  }

  private async createUniquePayosOrderCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const orderCode = Date.now() * 1000 + Math.floor(Math.random() * 1000);
      const existing = await this.prisma.payment.findUnique({
        where: { payosOrderCode: BigInt(orderCode) },
        select: { id: true },
      });
      if (!existing) return orderCode;
    }

    throw new BadRequestException('Không thể tạo mã thanh toán duy nhất');
  }

  private createMockPaymentLink(
    invoiceId: string,
    amount: number,
    orderCode: number,
    frontendUrl: string,
  ) {
    return {
      qrCode: `EASYEDU_MOCK|invoice=${invoiceId}|amount=${amount}|orderCode=${orderCode}`,
      paymentLinkId: `mock-${orderCode}`,
      checkoutUrl: `${frontendUrl}/student/payments?mockOrderCode=${orderCode}`,
    };
  }

  private buildReceiptNo(source: ConfirmSource, paymentId: string) {
    return `EE-${source}-${paymentId.slice(-10).toUpperCase()}`;
  }
}
