import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  EnrollmentStatus,
  InvoiceIssueReason,
  InvoicePaymentMode,
  InvoiceStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface CreateInvoiceInput {
  studentId: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
}

export interface InvoiceListInput {
  studentId?: string;
  status?: string;
  archive?: 'active' | 'archived' | 'all';
}

export interface UpdateMonthlyIssueDayInput {
  day?: number | null;
  date?: string | null;
  scheduledIssueAt?: string | null;
}

export interface AddDepositInput {
  amount: number;
}

export interface ScheduleStudentInvoiceInput {
  studentId: string;
  scheduledIssueAt: string;
}

export interface IssueAllInvoicesNowInput {
  password: string;
}

type BuiltInvoiceItem = {
  classId: string;
  description: string;
  sessions: number;
  unitPrice: number;
  grossAmount: number;
  depositApplied: number;
  payableAmount: number;
  amount: number;
  isPaid: boolean;
};

type Period = {
  monthKey: string;
  label: string;
  start: Date;
  end: Date;
};

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  private readonly publicUserSelect = {
    id: true,
    username: true,
    email: true,
    phone: true,
    role: true,
    status: true,
    profile: true,
  } as const;

  async create(dto: CreateInvoiceInput) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    const built = await this.buildInvoice(dto.studentId, periodStart, periodEnd, 0);

    return this.prisma.invoice.create({
      data: {
        studentId: dto.studentId,
        periodLabel: dto.periodLabel,
        periodStart,
        periodEnd,
        monthKey: this.monthKey(periodStart),
        grossAmount: built.grossAmount,
        totalAmount: built.totalAmount,
        depositApplied: built.depositApplied,
        reserveBalance: built.reserveBalance,
        maxPaymentTimes: built.items.length + 1,
        status: built.totalAmount <= 0 ? InvoiceStatus.PAID : InvoiceStatus.ISSUED,
        issueReason: InvoiceIssueReason.MANUAL,
        issuedAt: new Date(),
        dueDate: periodEnd,
        items: { create: built.items },
      },
      include: this.invoiceInclude(),
    });
  }

  async findAll(inputOrStudentId?: InvoiceListInput | string, status?: string) {
    const input: InvoiceListInput =
      typeof inputOrStudentId === 'string'
        ? { studentId: inputOrStudentId, status }
        : (inputOrStudentId ?? {});
    const where: any = {};
    if (input.studentId) where.studentId = input.studentId;
    if (input.status) where.status = input.status;
    if (input.archive === 'archived') {
      where.archivedAt = { not: null };
    } else if (input.archive !== 'all') {
      where.archivedAt = null;
    }

    return this.prisma.invoice.findMany({
      where,
      include: this.invoiceInclude(),
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string, user: any) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: this.invoiceInclude(true),
    });
    if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn');

    if (user.role === 'STUDENT' && invoice.studentId !== user.id) {
      throw new NotFoundException('Không tìm thấy hóa đơn');
    }

    return invoice;
  }

  async myInvoices(studentId: string) {
    return this.prisma.invoice.findMany({
      where: {
        studentId,
        archivedAt: null,
        status: { not: InvoiceStatus.DRAFT },
      },
      include: this.invoiceInclude(true),
      orderBy: { createdAt: 'desc' },
    });
  }

  async dashboard() {
    const now = new Date();
    const setting = await this.getMonthlySetting();
    const [drafts, issued, overdue, paid, activeStudents] = await Promise.all([
      this.prisma.invoice.count({ where: { status: InvoiceStatus.DRAFT, archivedAt: null } }),
      this.prisma.invoice.count({ where: { status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] }, archivedAt: null } }),
      this.prisma.invoice.count({ where: { status: InvoiceStatus.OVERDUE, archivedAt: null } }),
      this.prisma.invoice.count({ where: { status: InvoiceStatus.PAID, archivedAt: null } }),
      this.countStudentsWithApprovedClasses(),
    ]);

    return {
      setting,
      monthKey: this.monthKey(now),
      nextDefaultIssueAt: this.defaultIssueDateForMonth(
        now,
        setting.monthlyIssueDay,
        setting.monthlyIssueTimeMinutes,
      ),
      currentMonth: {
        start: this.getMonthPeriod(now).start,
        end: this.getMonthPeriod(now).end,
        minIssueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      counts: { drafts, issued, overdue, paid, activeStudents },
    };
  }

  async getMonthlySetting() {
    return this.prisma.invoiceScheduleSetting.upsert({
      where: { key: 'monthly' },
      update: {},
      create: { key: 'monthly' },
    });
  }

  async updateMonthlyIssueDay(dto: UpdateMonthlyIssueDayInput) {
    const issue = this.resolveMonthlyIssueDay(dto);

    const setting = await this.prisma.invoiceScheduleSetting.upsert({
      where: { key: 'monthly' },
      update: {
        monthlyIssueDay: issue.day,
        monthlyIssueTimeMinutes: issue.timeMinutes,
      },
      create: {
        key: 'monthly',
        monthlyIssueDay: issue.day,
        monthlyIssueTimeMinutes: issue.timeMinutes,
      },
    });

    await this.syncMonthlyDrafts();
    return setting;
  }

  async shouldPromptMonthlyIssueDay() {
    const setting = await this.getMonthlySetting();
    const monthKey = this.monthKey(new Date());
    return {
      shouldPrompt: setting.lastPromptedMonth !== monthKey,
      monthKey,
      setting,
    };
  }

  async markMonthlyPromptSeen() {
    const monthKey = this.monthKey(new Date());
    return this.prisma.invoiceScheduleSetting.upsert({
      where: { key: 'monthly' },
      update: { lastPromptedMonth: monthKey },
      create: { key: 'monthly', lastPromptedMonth: monthKey },
    });
  }

  async syncMonthlyDrafts(referenceDate = new Date()) {
    const setting = await this.getMonthlySetting();
    const period = this.getMonthPeriod(referenceDate);
    const students = await this.prisma.user.findMany({
      where: {
        role: 'STUDENT',
        status: UserStatus.ACTIVE,
        enrollments: { some: { status: EnrollmentStatus.APPROVED } },
      },
      select: { id: true },
    });

    const invoices = [];
    for (const student of students) {
      invoices.push(
        await this.ensureCurrentDraftForStudent(student.id, period, {
          scheduledIssueAt: this.defaultIssueDateForMonth(
            referenceDate,
            setting.monthlyIssueDay,
            setting.monthlyIssueTimeMinutes,
          ),
        }),
      );
    }

    return { monthKey: period.monthKey, count: invoices.length, invoices };
  }

  async addDeposit(invoiceId: string, dto: AddDepositInput) {
    if (!Number.isFinite(dto.amount) || dto.amount < 0) {
      throw new BadRequestException('Tiền cọc phải là số không âm');
    }
    const invoice = await this.getDraftOrIssued(invoiceId);
    if (invoice.payments.some((payment) => payment.status !== 'CANCELLED')) {
      throw new BadRequestException('Không thể đổi tiền cọc khi hóa đơn đã có lượt thanh toán');
    }

    return this.rebuildInvoice(invoice.id, {
      depositApplied: dto.amount,
      periodEnd: invoice.periodEnd,
    });
  }

  async scheduleStudentInvoice(dto: ScheduleStudentInvoiceInput) {
    const scheduledIssueAt = new Date(dto.scheduledIssueAt);
    if (Number.isNaN(scheduledIssueAt.getTime())) {
      throw new BadRequestException('Ngày hẹn xuất hóa đơn không hợp lệ');
    }
    if (scheduledIssueAt.getTime() - Date.now() < 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Ngày hẹn xuất hóa đơn phải cách hiện tại ít nhất 24 giờ');
    }

    const draft = await this.ensureCurrentDraftForStudent(dto.studentId, this.getMonthPeriod(scheduledIssueAt), {
      scheduledIssueAt,
    });

    return this.prisma.invoice.update({
      where: { id: draft.id },
      data: { scheduledIssueAt, manualIssueAt: scheduledIssueAt },
      include: this.invoiceInclude(),
    });
  }

  async issueStudentNow(studentId: string, reason: InvoiceIssueReason = InvoiceIssueReason.MANUAL) {
    const draft = await this.ensureCurrentDraftForStudent(studentId, this.getMonthPeriod(new Date()));
    return this.issueInvoice(draft.id, reason);
  }

  async issueInvoice(invoiceId: string, reason: InvoiceIssueReason = InvoiceIssueReason.MANUAL) {
    const invoice = await this.getDraftOrIssued(invoiceId);
    if (invoice.status !== InvoiceStatus.DRAFT) {
      return invoice;
    }
    return this.issueDraftInvoice(invoice, reason, true);
  }

  async issueAllDraftsNow(adminId: string, dto: IssueAllInvoicesNowInput) {
    await this.verifyAdminPassword(adminId, dto.password);
    await this.syncMonthlyDrafts();

    const drafts = await this.prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.DRAFT,
        archivedAt: null,
        isCurrentDraft: true,
      },
      include: { payments: true, items: true },
      orderBy: { createdAt: 'asc' },
    });

    const issued = [];
    const skipped = [];
    for (const draft of drafts) {
      const result = await this.issueDraftInvoice(draft, InvoiceIssueReason.MANUAL, false);
      if ('skipped' in result && result.skipped) {
        skipped.push(result);
      } else {
        issued.push(result);
      }
    }

    return {
      issuedCount: issued.length,
      skippedZeroAmountCount: skipped.length,
      issued,
      skipped,
    };
  }

  private async issueDraftInvoice(
    invoice: any,
    reason: InvoiceIssueReason,
    throwOnZeroAmount: boolean,
  ) {

    const now = new Date();
    const closeAt = now < invoice.periodEnd ? now : invoice.periodEnd;
    const rebuilt = await this.rebuildInvoice(invoice.id, {
      depositApplied: invoice.depositApplied,
      periodEnd: closeAt,
    });
    if (rebuilt.totalAmount === 0) {
      if (throwOnZeroAmount) {
        throw new BadRequestException('Hóa đơn có số tiền cần thu bằng 0, không thể xuất');
      }
      return {
        skipped: true,
        reason: 'ZERO_AMOUNT',
        invoice: rebuilt,
      };
    }

    const status =
      rebuilt.paidAmount >= rebuilt.totalAmount
        ? InvoiceStatus.PAID
        : InvoiceStatus.ISSUED;

    const issued = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status,
        issueReason: reason,
        isCurrentDraft: false,
        issuedAt: now,
        dueDate: closeAt,
        scheduledIssueAt: null,
      },
      include: this.invoiceInclude(true),
    });

    const nextStart = this.startOfNextDay(closeAt);
    if (nextStart <= invoice.periodEnd) {
      await this.ensureCurrentDraftForStudent(invoice.studentId, {
        monthKey: invoice.monthKey ?? this.monthKey(invoice.periodStart),
        label: invoice.periodLabel,
        start: nextStart,
        end: invoice.periodEnd,
      });
    } else {
      const nextMonth = new Date(invoice.periodEnd.getFullYear(), invoice.periodEnd.getMonth() + 1, 1);
      await this.ensureCurrentDraftForStudent(invoice.studentId, this.getMonthPeriod(nextMonth));
    }

    return issued;
  }

  async runDueInvoices(now = new Date()) {
    await this.syncMonthlyDrafts(now);
    const dueDrafts = await this.prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.DRAFT,
        archivedAt: null,
        scheduledIssueAt: { lte: now },
      },
      include: { payments: true, items: true },
    });

    const issued = [];
    const skipped = [];
    for (const draft of dueDrafts) {
      const result = await this.issueDraftInvoice(draft, InvoiceIssueReason.MONTHLY, false);
      if ('skipped' in result && result.skipped) {
        skipped.push(result);
      } else {
        issued.push(result);
      }
    }

    return { count: issued.length, skippedZeroAmountCount: skipped.length, issued, skipped };
  }

  async setPaymentMode(invoiceId: string, mode: InvoicePaymentMode) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true },
    });
    if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn');
    const activePayments = invoice.payments.filter((payment) => payment.status !== 'CANCELLED');
    if (
      activePayments.length > 0 &&
      activePayments.some((payment) => payment.method !== mode)
    ) {
      throw new BadRequestException('Không thể đổi phương thức khi hóa đơn đang thanh toán dở');
    }

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { paymentMode: mode },
      include: this.invoiceInclude(true),
    });
  }

  async archiveStudentInvoicesForLock(studentId: string, closeCurrentDraft: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { role: true },
    });
    if (!user || user.role !== 'STUDENT') return { archivedCount: 0, issued: null };

    let issued: any = null;
    if (closeCurrentDraft) {
      const draft = await this.ensureCurrentDraftForStudent(studentId, this.getMonthPeriod(new Date()));
      const result = await this.issueDraftInvoice(draft, InvoiceIssueReason.STUDENT_LOCK, false);
      issued = 'skipped' in result && result.skipped ? null : result;
    }

    const archive = await this.prisma.invoice.updateMany({
      where: {
        studentId,
        archivedAt: null,
        status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
      },
      data: {
        archivedAt: new Date(),
        archiveReason: 'Tài khoản học sinh bị khóa bởi admin',
        isCurrentDraft: false,
      },
    });

    return { archivedCount: archive.count, issued };
  }

  private async ensureCurrentDraftForStudent(
    studentId: string,
    period: Period,
    options: { scheduledIssueAt?: Date } = {},
  ) {
    const existing = await this.prisma.invoice.findFirst({
      where: {
        studentId,
        monthKey: period.monthKey,
        status: InvoiceStatus.DRAFT,
        isCurrentDraft: true,
        archivedAt: null,
      },
      include: { items: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return this.rebuildInvoice(existing.id, {
        periodStart: existing.periodStart,
        periodEnd: existing.periodEnd,
        scheduledIssueAt: existing.manualIssueAt
          ? existing.scheduledIssueAt
          : (options.scheduledIssueAt ?? existing.scheduledIssueAt),
        depositApplied: existing.depositApplied,
      });
    }

    const built = await this.buildInvoice(studentId, period.start, period.end, 0);
    return this.prisma.invoice.create({
      data: {
        studentId,
        periodLabel: period.label,
        periodStart: period.start,
        periodEnd: period.end,
        monthKey: period.monthKey,
        grossAmount: built.grossAmount,
        totalAmount: built.totalAmount,
        depositApplied: built.depositApplied,
        reserveBalance: built.reserveBalance,
        maxPaymentTimes: built.items.length + 1,
        status: InvoiceStatus.DRAFT,
        isCurrentDraft: true,
        scheduledIssueAt:
          options.scheduledIssueAt ?? this.defaultIssueDateForMonth(period.start, null),
        items: { create: built.items },
      },
      include: this.invoiceInclude(),
    });
  }

  private async rebuildInvoice(
    invoiceId: string,
    options: {
      periodStart?: Date;
      periodEnd?: Date;
      scheduledIssueAt?: Date | null;
      depositApplied?: number;
    },
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true },
    });
    if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn');

    const depositApplied = options.depositApplied ?? invoice.depositApplied;
    const periodStart = options.periodStart ?? invoice.periodStart;
    const periodEnd = options.periodEnd ?? invoice.periodEnd;
    const built = await this.buildInvoice(invoice.studentId, periodStart, periodEnd, depositApplied);

    return this.prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId } });
      return tx.invoice.update({
        where: { id: invoiceId },
        data: {
          periodStart,
          periodEnd,
          monthKey: invoice.monthKey ?? this.monthKey(periodStart),
          grossAmount: built.grossAmount,
          totalAmount: built.totalAmount,
          depositApplied: built.depositApplied,
          reserveBalance: built.reserveBalance,
          maxPaymentTimes: built.items.length + 1,
          ...(options.scheduledIssueAt !== undefined && {
            scheduledIssueAt: options.scheduledIssueAt,
          }),
          items: { create: built.items },
        },
        include: this.invoiceInclude(true),
      });
    });
  }

  private async buildInvoice(
    studentId: string,
    periodStart: Date,
    periodEnd: Date,
    depositApplied: number,
  ) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, status: EnrollmentStatus.APPROVED },
      include: { class: true },
      orderBy: { approvedAt: 'asc' },
    });

    if (enrollments.length === 0) {
      throw new BadRequestException('Học sinh chưa có lớp học nào được duyệt');
    }

    const rawItems: Array<Omit<BuiltInvoiceItem, 'depositApplied' | 'payableAmount' | 'amount' | 'isPaid'>> = [];
    for (const enrollment of enrollments) {
      const cls = enrollment.class;
      const attendedCount = await this.calculateBillableSessions(
        studentId,
        cls.id,
        periodStart,
        periodEnd,
      );
      const grossAmount = attendedCount * cls.tuitionPerSession;
      rawItems.push({
        classId: cls.id,
        description: `${cls.name} - ${attendedCount} buổi`,
        sessions: attendedCount,
        unitPrice: cls.tuitionPerSession,
        grossAmount,
      });
    }

    const grossAmount = rawItems.reduce((sum, item) => sum + item.grossAmount, 0);
    const safeDeposit = Math.max(0, Number(depositApplied) || 0);
    let remainingDeposit = safeDeposit;
    const items = rawItems.map((item, index) => {
      const isLast = index === rawItems.length - 1;
      const itemDeposit = isLast
        ? remainingDeposit
        : Math.min(remainingDeposit, item.grossAmount);
      remainingDeposit -= itemDeposit;
      const payableAmount = item.grossAmount - itemDeposit;
      return {
        ...item,
        depositApplied: itemDeposit,
        payableAmount,
        amount: payableAmount,
        isPaid: payableAmount <= 0,
      };
    });

    return {
      grossAmount,
      depositApplied: safeDeposit,
      reserveBalance: Math.max(safeDeposit - grossAmount, 0),
      totalAmount: grossAmount - safeDeposit,
      items,
    };
  }

  private async calculateBillableSessions(
    studentId: string,
    classId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const regularBillableCount = await this.prisma.attendance.count({
      where: {
        studentId,
        classId,
        sessionDate: { gte: periodStart, lte: periodEnd },
        status: { in: ['PRESENT', 'ABSENT_UNEXCUSED', 'MAKEUP'] },
      },
    });

    const excusedAbsences = await this.prisma.attendance.findMany({
      where: {
        studentId,
        classId,
        sessionDate: { gte: periodStart, lte: periodEnd },
        status: 'ABSENT_EXCUSED',
      },
      select: { id: true },
    });
    if (excusedAbsences.length === 0) return regularBillableCount;

    const madeUpExcusedCount = await this.prisma.attendance.count({
      where: {
        studentId,
        status: { in: ['PRESENT', 'MAKEUP'] },
        makeupSourceId: { in: excusedAbsences.map((record) => record.id) },
      },
    });

    return regularBillableCount + madeUpExcusedCount;
  }

  private async getDraftOrIssued(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true, items: true },
    });
    if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn');
    if (
      invoice.status !== InvoiceStatus.DRAFT &&
      invoice.status !== InvoiceStatus.ISSUED
    ) {
      throw new BadRequestException('Chỉ có thể thao tác với hóa đơn nháp hoặc mới xuất');
    }
    return invoice;
  }

  private async verifyAdminPassword(adminId: string, password?: string) {
    if (!password?.trim()) {
      throw new BadRequestException('Vui lòng nhập mật khẩu admin');
    }

    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { role: true, passwordHash: true },
    });
    if (!admin || admin.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Tài khoản admin không hợp lệ');
    }

    const isValid = await bcrypt.compare(password, admin.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Mật khẩu admin không đúng');
    }
  }

  private resolveMonthlyIssueDay(dto: UpdateMonthlyIssueDayInput) {
    if (dto.scheduledIssueAt === null || dto.scheduledIssueAt === '') {
      return { day: null, timeMinutes: null };
    }
    if (dto.scheduledIssueAt !== undefined) {
      const selected = new Date(dto.scheduledIssueAt);
      this.validateCurrentMonthIssueDate(selected);
      return {
        day: selected.getDate(),
        timeMinutes: selected.getHours() * 60 + selected.getMinutes(),
      };
    }

    if (dto.date === null || dto.date === '') {
      return { day: null, timeMinutes: null };
    }
    if (dto.date !== undefined) {
      const selected = this.parseLocalDate(dto.date);
      this.validateCurrentMonthIssueDate(selected);
      return {
        day: selected.getDate(),
        timeMinutes: selected.getHours() * 60 + selected.getMinutes(),
      };
    }

    if (dto.day === null || dto.day === undefined) {
      return { day: null, timeMinutes: null };
    }
    if (!Number.isInteger(dto.day) || dto.day < 1) {
      throw new BadRequestException('Ngày xuất hóa đơn không hợp lệ');
    }

    const now = new Date();
    const maxDay = this.daysInMonth(now.getFullYear(), now.getMonth());
    if (dto.day > maxDay) {
      throw new BadRequestException(`Tháng hiện tại chỉ có ${maxDay} ngày`);
    }

    const selected = new Date(now.getFullYear(), now.getMonth(), dto.day, 23, 59, 59, 999);
    this.validateCurrentMonthIssueDate(selected);
    return { day: dto.day, timeMinutes: 23 * 60 + 59 };
  }

  private validateCurrentMonthIssueDate(selected: Date) {
    if (Number.isNaN(selected.getTime())) {
      throw new BadRequestException('Ngày xuất hóa đơn không hợp lệ');
    }

    const now = new Date();
    if (
      selected.getFullYear() !== now.getFullYear() ||
      selected.getMonth() !== now.getMonth()
    ) {
      throw new BadRequestException('Chỉ được chọn ngày trong tháng hiện tại');
    }

    if (selected.getTime() - now.getTime() < 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Ngày xuất hóa đơn phải cách hiện tại ít nhất 24 giờ');
    }
  }

  private parseLocalDate(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      const parsed = new Date(value);
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 23, 59, 59, 999);
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const parsed = new Date(year, monthIndex, day, 23, 59, 59, 999);
    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== monthIndex ||
      parsed.getDate() !== day
    ) {
      throw new BadRequestException('Ngày xuất hóa đơn không hợp lệ');
    }
    return parsed;
  }

  private async countStudentsWithApprovedClasses() {
    return this.prisma.user.count({
      where: {
        role: 'STUDENT',
        status: UserStatus.ACTIVE,
        enrollments: { some: { status: EnrollmentStatus.APPROVED } },
      },
    });
  }

  private invoiceInclude(withPayments = false) {
    return {
      student: { select: this.publicUserSelect },
      items: {
        include: {
          class: { include: { teacher: { select: this.publicUserSelect } } },
          ...(withPayments && { payments: true }),
        },
      },
      ...(withPayments && {
        payments: { include: { receipt: true, inquiry: true, invoiceItem: true } },
        receipts: true,
        paymentLimitRequests: true,
      }),
    } as const;
  }

  private getMonthPeriod(date: Date): Period {
    const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    return {
      monthKey: this.monthKey(date),
      label: `Tháng ${date.getMonth() + 1}/${date.getFullYear()}`,
      start,
      end,
    };
  }

  private monthKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private defaultIssueDateForMonth(
    date: Date,
    day?: number | null,
    timeMinutes?: number | null,
  ) {
    const maxDay = this.daysInMonth(date.getFullYear(), date.getMonth());
    const issueDay = Math.min(day ?? maxDay, maxDay);
    const minutes = timeMinutes ?? (23 * 60 + 59);
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return new Date(date.getFullYear(), date.getMonth(), issueDay, hour, minute, 0, 0);
  }

  private daysInMonth(year: number, monthIndex: number) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  private startOfNextDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
  }
}
