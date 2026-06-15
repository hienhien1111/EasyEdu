import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceStatus,
  LedgerDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  Prisma,
  SalaryStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface CalculateSalaryInput {
  teacherId: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
}

export interface UpdateSalaryInput {
  salaryPercentage?: number;
  manualAdjustment?: number;
  note?: string;
}

export interface UpdateMonthlyFinalizeDayInput {
  day?: number | null;
  date?: string | null;
  scheduledFinalizeAt?: string | null;
}

export interface ScheduleTeacherSalaryInput {
  teacherId: string;
  scheduledFinalizeAt: string;
}

type SalaryClassMetrics = {
  sessionsTaught: number;
  primarySessionsTaught: number;
  extraSessionsTaught: number;
  presentCount: number;
  absentUnexcusedCount: number;
  billableStudentSessions: number;
  revenueAmount: number;
  salaryAmount: number;
  cashCollected: number;
  note: string;
};

type Period = {
  monthKey: string;
  label: string;
  start: Date;
  end: Date;
};

type BuiltSalary = {
  totals: {
    totalPrimarySessions: number;
    totalExtraSessions: number;
    totalPresentCount: number;
    totalAbsentUnexcusedCount: number;
    totalBillableStudentSessions: number;
    totalRevenue: number;
    salaryPercentage: number;
    grossSalary: number;
    cashDeduction: number;
    netSalary: number;
    manualAdjustment: number;
  };
  items: Array<{
    classId: string;
    sessionsTaught: number;
    primarySessionsTaught: number;
    extraSessionsTaught: number;
    presentCount: number;
    absentUnexcusedCount: number;
    billableStudentSessions: number;
    tuitionPerSession: number;
    revenueAmount: number;
    salaryAmount: number;
    cashCollected: number;
    note: string;
  }>;
};

type SalaryForFinalize = {
  id: string;
  teacherId: string;
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  monthKey: string | null;
  salaryPercentage: number;
  manualAdjustment: number;
};

type ClosedSalaryForContinuation = SalaryForFinalize & {
  status: SalaryStatus;
  updatedAt: Date;
  finalizedAt: Date | null;
  paidAt: Date | null;
};

type SalaryWithDetails = Prisma.SalaryGetPayload<{
  include: {
    teacher: { include: { profile: true; teacherProfile: true } };
    items: { include: { class: true } };
  };
}>;

@Injectable()
export class SalariesService {
  constructor(private prisma: PrismaService) {}

  async calculate(dto: CalculateSalaryInput) {
    const periodStart = this.parseDate(dto.periodStart, 'Ngày bắt đầu');
    const periodEnd = this.endOfDay(
      this.parseDate(dto.periodEnd, 'Ngày kết thúc'),
    );
    this.assertValidPeriod(periodStart, periodEnd);

    return this.ensureCurrentDraftForTeacher(dto.teacherId, {
      monthKey: this.monthKey(periodStart),
      label: dto.periodLabel,
      start: periodStart,
      end: periodEnd,
    });
  }

  async findAll(teacherId?: string, period?: string, status?: string) {
    await this.syncMonthlyDrafts();

    const where: Prisma.SalaryWhereInput = {};
    if (teacherId) where.teacherId = teacherId;
    if (period) where.periodLabel = period;
    if (status && status !== 'ALL') {
      where.status =
        status === 'PAID'
          ? { in: [SalaryStatus.PAID, SalaryStatus.FINALIZED] }
          : (status as SalaryStatus);
    }

    return this.prisma.salary.findMany({
      where,
      include: this.salaryInclude(),
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async dashboard() {
    const now = new Date();
    const setting = await this.getMonthlySetting();
    const [drafts, needsPayment, paid, activeTeachers] = await Promise.all([
      this.prisma.salary.count({ where: { status: SalaryStatus.DRAFT } }),
      this.prisma.salary.count({
        where: { status: SalaryStatus.NEEDS_PAYMENT },
      }),
      this.prisma.salary.count({
        where: { status: { in: [SalaryStatus.PAID, SalaryStatus.FINALIZED] } },
      }),
      this.countTeachersWithActiveClasses(),
    ]);

    return {
      setting,
      monthKey: this.monthKey(now),
      nextDefaultFinalizeAt: this.defaultFinalizeDateForMonth(
        now,
        setting.monthlyFinalizeDay,
        setting.monthlyFinalizeTimeMinutes,
      ),
      currentMonth: {
        start: this.getMonthPeriod(now).start,
        end: this.getMonthPeriod(now).end,
        minFinalizeAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      counts: { drafts, needsPayment, paid, activeTeachers },
    };
  }

  async getMonthlySetting() {
    return this.prisma.salaryScheduleSetting.upsert({
      where: { key: 'monthly' },
      update: {},
      create: { key: 'monthly' },
    });
  }

  async updateMonthlyFinalizeDay(dto: UpdateMonthlyFinalizeDayInput) {
    const finalize = this.resolveMonthlyFinalizeDay(dto);

    const setting = await this.prisma.salaryScheduleSetting.upsert({
      where: { key: 'monthly' },
      update: {
        monthlyFinalizeDay: finalize.day,
        monthlyFinalizeTimeMinutes: finalize.timeMinutes,
      },
      create: {
        key: 'monthly',
        monthlyFinalizeDay: finalize.day,
        monthlyFinalizeTimeMinutes: finalize.timeMinutes,
      },
    });

    await this.syncMonthlyDrafts();
    return setting;
  }

  async shouldPromptMonthlyFinalizeDay() {
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
    return this.prisma.salaryScheduleSetting.upsert({
      where: { key: 'monthly' },
      update: { lastPromptedMonth: monthKey },
      create: { key: 'monthly', lastPromptedMonth: monthKey },
    });
  }

  async syncMonthlyDrafts(referenceDate = new Date()) {
    const setting = await this.getMonthlySetting();
    const period = this.getMonthPeriod(referenceDate);
    const scheduledFinalizeAt = this.defaultFinalizeDateForMonth(
      referenceDate,
      setting.monthlyFinalizeDay,
      setting.monthlyFinalizeTimeMinutes,
    );
    const teachers = await this.prisma.user.findMany({
      where: {
        role: 'TEACHER',
        status: UserStatus.ACTIVE,
        classesAsTeacher: { some: { isActive: true } },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    const salaries = [];
    for (const teacher of teachers) {
      salaries.push(
        await this.ensureCurrentDraftForTeacher(teacher.id, period, {
          scheduledFinalizeAt,
        }),
      );
    }

    return {
      monthKey: period.monthKey,
      count: salaries.filter((salary) => salary?.status === SalaryStatus.DRAFT)
        .length,
      salaries,
    };
  }

  async scheduleTeacherSalary(dto: ScheduleTeacherSalaryInput) {
    const scheduledFinalizeAt = new Date(dto.scheduledFinalizeAt);
    if (Number.isNaN(scheduledFinalizeAt.getTime())) {
      throw new BadRequestException('Ngày hẹn chốt lương không hợp lệ');
    }
    if (scheduledFinalizeAt.getTime() - Date.now() < 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        'Ngày hẹn chốt lương phải cách hiện tại ít nhất 24 giờ',
      );
    }

    const draft = await this.ensureCurrentDraftForTeacher(
      dto.teacherId,
      this.getMonthPeriod(scheduledFinalizeAt),
      { scheduledFinalizeAt },
    );

    return this.prisma.salary.update({
      where: { id: draft.id },
      data: { scheduledFinalizeAt, manualFinalizeAt: scheduledFinalizeAt },
      include: this.salaryInclude(),
    });
  }

  async finalizeTeacherNow(teacherId: string, adminId?: string) {
    const draft = await this.ensureCurrentDraftForTeacher(
      teacherId,
      this.getMonthPeriod(new Date()),
    );
    return this.markNeedsPayment(draft.id, adminId);
  }

  async finalizeAllDraftsNow(adminId?: string) {
    await this.syncMonthlyDrafts();

    const drafts = await this.prisma.salary.findMany({
      where: {
        status: SalaryStatus.DRAFT,
        isCurrentDraft: true,
      },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });

    const finalized = [];
    for (const draft of drafts) {
      finalized.push(await this.markNeedsPayment(draft.id, adminId));
    }

    return { finalizedCount: finalized.length, finalized };
  }

  async runDueSalaries(now = new Date()) {
    await this.syncMonthlyDrafts(now);

    const dueDrafts = await this.prisma.salary.findMany({
      where: {
        status: SalaryStatus.DRAFT,
        scheduledFinalizeAt: { lte: now },
      },
      include: { items: true },
      orderBy: { scheduledFinalizeAt: 'asc' },
    });

    const finalized = [];
    for (const draft of dueDrafts) {
      finalized.push(await this.markNeedsPayment(draft.id));
    }

    return { count: finalized.length, finalized };
  }

  async update(id: string, dto: UpdateSalaryInput) {
    const salary = await this.prisma.salary.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!salary) throw new NotFoundException('Không tìm thấy bảng lương');
    if (this.isPaidSalaryStatus(salary.status)) {
      throw new BadRequestException(
        'Bảng lương đã thanh toán, không thể chỉnh sửa',
      );
    }

    const salaryPercentage =
      dto.salaryPercentage !== undefined
        ? this.normalizeSalaryPercentage(dto.salaryPercentage)
        : salary.salaryPercentage;
    const manualAdjustment =
      dto.manualAdjustment !== undefined
        ? Number(dto.manualAdjustment)
        : salary.manualAdjustment;
    if (!Number.isFinite(manualAdjustment)) {
      throw new BadRequestException('Điều chỉnh thủ công không hợp lệ');
    }

    const grossSalary = (salary.totalRevenue * salaryPercentage) / 100;
    const netSalary = grossSalary - salary.cashDeduction + manualAdjustment;

    return this.prisma.$transaction(async (tx) => {
      for (const item of salary.items) {
        await tx.salaryItem.update({
          where: { id: item.id },
          data: {
            salaryAmount: (item.revenueAmount * salaryPercentage) / 100,
          },
        });
      }

      return tx.salary.update({
        where: { id },
        data: {
          salaryPercentage,
          grossSalary,
          netSalary,
          manualAdjustment,
          ...(dto.note !== undefined && { note: dto.note }),
        },
        include: this.salaryInclude(),
      });
    });
  }

  async markNeedsPayment(id: string, adminId?: string) {
    const salary = await this.prisma.salary.findUnique({ where: { id } });
    if (!salary) throw new NotFoundException('Không tìm thấy bảng lương');
    if (this.isPaidSalaryStatus(salary.status)) {
      throw new BadRequestException('Bảng lương đã thanh toán');
    }
    if (salary.status === SalaryStatus.NEEDS_PAYMENT) {
      return this.prisma.salary.findUnique({
        where: { id },
        include: this.salaryInclude(),
      });
    }

    return this.finalizeDraftSalary(salary, adminId);
  }

  async markPaid(id: string, adminId: string) {
    const salary = await this.prisma.salary.findUnique({
      where: { id },
      include: this.salaryInclude(),
    });
    if (!salary) throw new NotFoundException('Không tìm thấy bảng lương');
    if (this.isPaidSalaryStatus(salary.status)) {
      throw new BadRequestException('Bảng lương đã thanh toán trước đó');
    }
    if (salary.status !== SalaryStatus.NEEDS_PAYMENT) {
      throw new BadRequestException(
        'Chỉ có thể xác nhận thanh toán bảng lương ở trạng thái cần thanh toán',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const paid = await tx.salary.update({
        where: { id },
        data: {
          status: SalaryStatus.PAID,
          paidAt: now,
          paidBy: adminId,
          finalizedAt: salary.finalizedAt ?? now,
          finalizedBy: salary.finalizedBy ?? adminId,
        },
        include: this.salaryInclude(),
      });

      const entryNo = `LED-SAL-${id.slice(-10).toUpperCase()}`;
      const existingLedger = await tx.ledgerEntry.findUnique({
        where: { entryNo },
      });
      if (!existingLedger) {
        await tx.ledgerEntry.create({
          data: {
            entryNo,
            type: LedgerEntryType.TEACHER_SALARY_PAYOUT,
            direction: LedgerDirection.OUT,
            status: LedgerEntryStatus.POSTED,
            amount: salary.netSalary,
            teacherId: salary.teacherId,
            occurredAt: now,
            postedAt: now,
            description: `Thanh toán lương giáo viên - ${salary.periodLabel}`,
            metadata: {
              salaryId: salary.id,
              periodLabel: salary.periodLabel,
              totalRevenue: salary.totalRevenue,
              salaryPercentage: salary.salaryPercentage,
              cashDeduction: salary.cashDeduction,
              manualAdjustment: salary.manualAdjustment,
            },
          },
        });
      }

      return paid;
    });
  }

  private async ensureCurrentDraftForTeacher(
    teacherId: string,
    period: Period,
    options: { scheduledFinalizeAt?: Date } = {},
  ): Promise<SalaryWithDetails> {
    await this.assertTeacherCanHaveSalary(teacherId);

    const existing = await this.prisma.salary.findFirst({
      where: {
        teacherId,
        monthKey: period.monthKey,
        status: SalaryStatus.DRAFT,
        isCurrentDraft: true,
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return this.rebuildSalary(existing.id, {
        periodStart: existing.periodStart,
        periodEnd: existing.periodEnd,
        scheduledFinalizeAt: existing.manualFinalizeAt
          ? existing.scheduledFinalizeAt
          : (options.scheduledFinalizeAt ?? existing.scheduledFinalizeAt),
        salaryPercentage: existing.salaryPercentage,
        manualAdjustment: existing.manualAdjustment,
      });
    }

    const sameStart = await this.prisma.salary.findUnique({
      where: {
        teacherId_periodStart: { teacherId, periodStart: period.start },
      },
      include: { items: true },
    });

    if (sameStart) {
      if (
        this.isPaidSalaryStatus(sameStart.status) ||
        sameStart.status === SalaryStatus.NEEDS_PAYMENT
      ) {
        return this.ensureDraftAfterClosedSalary(sameStart, period, options);
      }
      return this.rebuildSalary(sameStart.id, {
        periodStart: sameStart.periodStart,
        periodEnd: sameStart.periodEnd,
        scheduledFinalizeAt: sameStart.manualFinalizeAt
          ? sameStart.scheduledFinalizeAt
          : (options.scheduledFinalizeAt ?? sameStart.scheduledFinalizeAt),
        salaryPercentage: sameStart.salaryPercentage,
        manualAdjustment: sameStart.manualAdjustment,
        forceCurrentDraft: true,
      });
    }

    const built = await this.buildSalary(
      teacherId,
      period.start,
      period.end,
      undefined,
      0,
    );

    return this.prisma.salary.create({
      data: {
        teacherId,
        periodLabel: period.label,
        periodStart: period.start,
        periodEnd: period.end,
        monthKey: period.monthKey,
        ...built.totals,
        status: SalaryStatus.DRAFT,
        isCurrentDraft: true,
        scheduledFinalizeAt:
          options.scheduledFinalizeAt ??
          this.defaultFinalizeDateForMonth(period.start, null),
        items: { create: built.items },
      },
      include: this.salaryInclude(),
    });
  }

  private async ensureDraftAfterClosedSalary(
    salary: ClosedSalaryForContinuation,
    period: Period,
    options: { scheduledFinalizeAt?: Date } = {},
  ): Promise<SalaryWithDetails> {
    const closedAt = this.resolveClosedSalaryDate(salary, period);
    const nextStart = this.startOfNextDay(closedAt);

    if (nextStart <= period.end) {
      return this.ensureCurrentDraftForTeacher(
        salary.teacherId,
        {
          monthKey: period.monthKey,
          label: period.label,
          start: nextStart,
          end: period.end,
        },
        options,
      );
    }

    const nextMonth = new Date(
      period.end.getFullYear(),
      period.end.getMonth() + 1,
      1,
    );
    return this.ensureCurrentDraftForTeacher(
      salary.teacherId,
      this.getMonthPeriod(nextMonth),
      options,
    );
  }

  private resolveClosedSalaryDate(
    salary: ClosedSalaryForContinuation,
    period: Period,
  ) {
    const closedAt =
      salary.finalizedAt ??
      salary.paidAt ??
      salary.updatedAt ??
      salary.periodEnd;
    if (closedAt < period.start) return period.start;
    if (closedAt > period.end) return period.end;
    return closedAt;
  }

  private async rebuildSalary(
    salaryId: string,
    options: {
      periodStart?: Date;
      periodEnd?: Date;
      scheduledFinalizeAt?: Date | null;
      salaryPercentage?: number;
      manualAdjustment?: number;
      forceCurrentDraft?: boolean;
    },
  ): Promise<SalaryWithDetails> {
    const salary = await this.prisma.salary.findUnique({
      where: { id: salaryId },
    });
    if (!salary) throw new NotFoundException('Không tìm thấy bảng lương');

    const periodStart = options.periodStart ?? salary.periodStart;
    const periodEnd = options.periodEnd ?? salary.periodEnd;
    this.assertValidPeriod(periodStart, periodEnd);
    const built = await this.buildSalary(
      salary.teacherId,
      periodStart,
      periodEnd,
      options.salaryPercentage ?? salary.salaryPercentage,
      options.manualAdjustment ?? salary.manualAdjustment,
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.salaryItem.deleteMany({ where: { salaryId } });
      return tx.salary.update({
        where: { id: salaryId },
        data: {
          periodStart,
          periodEnd,
          monthKey: salary.monthKey ?? this.monthKey(periodStart),
          ...built.totals,
          ...(options.forceCurrentDraft !== undefined && {
            isCurrentDraft: options.forceCurrentDraft,
          }),
          ...(options.scheduledFinalizeAt !== undefined && {
            scheduledFinalizeAt: options.scheduledFinalizeAt,
          }),
          items: { create: built.items },
        },
        include: this.salaryInclude(),
      });
    });
  }

  private async finalizeDraftSalary(
    salary: SalaryForFinalize,
    adminId?: string,
  ) {
    const now = new Date();
    const closeAt = now < salary.periodEnd ? now : salary.periodEnd;
    const rebuilt = await this.rebuildSalary(salary.id, {
      periodEnd: closeAt,
      scheduledFinalizeAt: null,
      salaryPercentage: salary.salaryPercentage,
      manualAdjustment: salary.manualAdjustment,
    });

    const finalized = await this.prisma.salary.update({
      where: { id: salary.id },
      data: {
        status: SalaryStatus.NEEDS_PAYMENT,
        isCurrentDraft: false,
        finalizedAt: now,
        finalizedBy: adminId,
        scheduledFinalizeAt: null,
      },
      include: this.salaryInclude(),
    });

    const nextStart = this.startOfNextDay(closeAt);
    if (nextStart <= salary.periodEnd) {
      await this.ensureCurrentDraftForTeacher(salary.teacherId, {
        monthKey: salary.monthKey ?? this.monthKey(salary.periodStart),
        label: salary.periodLabel,
        start: nextStart,
        end: salary.periodEnd,
      });
    } else {
      const nextMonth = new Date(
        salary.periodEnd.getFullYear(),
        salary.periodEnd.getMonth() + 1,
        1,
      );
      await this.ensureCurrentDraftForTeacher(
        salary.teacherId,
        this.getMonthPeriod(nextMonth),
      );
    }

    void rebuilt;
    return finalized;
  }

  private async buildSalary(
    teacherId: string,
    periodStart: Date,
    periodEnd: Date,
    salaryPercentageInput?: number,
    manualAdjustmentInput = 0,
  ): Promise<BuiltSalary> {
    const teacher = await this.prisma.user.findFirst({
      where: { id: teacherId, role: 'TEACHER' },
      include: { teacherProfile: true, profile: true },
    });
    if (!teacher) throw new NotFoundException('Không tìm thấy giáo viên');

    const salaryPercentage = this.normalizeSalaryPercentage(
      salaryPercentageInput ?? teacher.teacherProfile?.salaryPercentage ?? 40,
    );
    const manualAdjustment = Number(manualAdjustmentInput) || 0;
    const classes = await this.prisma.class.findMany({
      where: { teacherId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    const items: BuiltSalary['items'] = [];
    let totalRevenue = 0;
    let totalPrimarySessions = 0;
    let totalExtraSessions = 0;
    let totalPresentCount = 0;
    let totalAbsentUnexcusedCount = 0;
    let totalBillableStudentSessions = 0;
    let cashDeduction = 0;

    for (const cls of classes) {
      const metrics = await this.calculateClassMetrics(
        teacherId,
        cls.id,
        cls.tuitionPerSession,
        salaryPercentage,
        periodStart,
        periodEnd,
      );

      totalRevenue += metrics.revenueAmount;
      totalPrimarySessions += metrics.primarySessionsTaught;
      totalExtraSessions += metrics.extraSessionsTaught;
      totalPresentCount += metrics.presentCount;
      totalAbsentUnexcusedCount += metrics.absentUnexcusedCount;
      totalBillableStudentSessions += metrics.billableStudentSessions;
      cashDeduction += metrics.cashCollected;

      items.push({
        classId: cls.id,
        sessionsTaught: metrics.sessionsTaught,
        primarySessionsTaught: metrics.primarySessionsTaught,
        extraSessionsTaught: metrics.extraSessionsTaught,
        presentCount: metrics.presentCount,
        absentUnexcusedCount: metrics.absentUnexcusedCount,
        billableStudentSessions: metrics.billableStudentSessions,
        tuitionPerSession: cls.tuitionPerSession,
        revenueAmount: metrics.revenueAmount,
        salaryAmount: metrics.salaryAmount,
        cashCollected: metrics.cashCollected,
        note: metrics.note,
      });
    }

    const grossSalary = (totalRevenue * salaryPercentage) / 100;
    const netSalary = grossSalary - cashDeduction + manualAdjustment;

    return {
      totals: {
        totalPrimarySessions,
        totalExtraSessions,
        totalPresentCount,
        totalAbsentUnexcusedCount,
        totalBillableStudentSessions,
        totalRevenue,
        salaryPercentage,
        grossSalary,
        cashDeduction,
        netSalary,
        manualAdjustment,
      },
      items,
    };
  }

  private async calculateClassMetrics(
    teacherId: string,
    classId: string,
    tuitionPerSession: number,
    salaryPercentage: number,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<SalaryClassMetrics> {
    const attendances = await this.prisma.attendance.findMany({
      where: {
        classId,
        teacherId,
        sessionDate: { gte: periodStart, lte: periodEnd },
      },
      include: {
        schedule: { select: { id: true, type: true } },
        weeklyOverride: { select: { id: true, scheduleId: true } },
      },
    });

    const sessionTypes = new Map<string, 'primary' | 'extra'>();
    let presentCount = 0;
    let absentUnexcusedCount = 0;

    for (const attendance of attendances) {
      if (attendance.status === AttendanceStatus.PRESENT) presentCount += 1;
      if (attendance.status === AttendanceStatus.ABSENT_UNEXCUSED) {
        absentUnexcusedCount += 1;
      }

      const sessionKey =
        attendance.weeklyOverrideId ??
        attendance.scheduleId ??
        attendance.sessionDate.toISOString();
      if (!sessionTypes.has(sessionKey)) {
        const isExtra =
          attendance.schedule?.type === 'MAKEUP' ||
          (attendance.weeklyOverrideId &&
            !attendance.weeklyOverride?.scheduleId);
        sessionTypes.set(sessionKey, isExtra ? 'extra' : 'primary');
      }
    }

    const primarySessionsTaught = [...sessionTypes.values()].filter(
      (type) => type === 'primary',
    ).length;
    const extraSessionsTaught = [...sessionTypes.values()].filter(
      (type) => type === 'extra',
    ).length;
    const billableStudentSessions = presentCount + absentUnexcusedCount;
    const revenueAmount = billableStudentSessions * tuitionPerSession;
    const salaryAmount = (revenueAmount * salaryPercentage) / 100;
    const cashCollected = await this.calculateCashCollectedForClass(
      teacherId,
      classId,
      periodStart,
      periodEnd,
    );

    return {
      sessionsTaught: primarySessionsTaught + extraSessionsTaught,
      primarySessionsTaught,
      extraSessionsTaught,
      presentCount,
      absentUnexcusedCount,
      billableStudentSessions,
      revenueAmount,
      salaryAmount,
      cashCollected,
      note: `${primarySessionsTaught} buổi chính, ${extraSessionsTaught} buổi mở rộng, ${presentCount} có mặt, ${absentUnexcusedCount} vắng không phép`,
    };
  }

  private async calculateCashCollectedForClass(
    teacherId: string,
    classId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const cash = await this.prisma.payment.aggregate({
      where: {
        cashCollectorId: teacherId,
        method: 'CASH',
        status: 'SUCCESS',
        invoiceItem: { classId },
        OR: [
          { cashConfirmedAt: { gte: periodStart, lte: periodEnd } },
          {
            cashConfirmedAt: null,
            createdAt: { gte: periodStart, lte: periodEnd },
          },
        ],
      },
      _sum: { amount: true },
    });

    return cash._sum.amount ?? 0;
  }

  private async countTeachersWithActiveClasses() {
    return this.prisma.user.count({
      where: {
        role: 'TEACHER',
        status: UserStatus.ACTIVE,
        classesAsTeacher: { some: { isActive: true } },
      },
    });
  }

  private async assertTeacherCanHaveSalary(teacherId: string) {
    const teacher = await this.prisma.user.findFirst({
      where: { id: teacherId, role: 'TEACHER' },
      select: { id: true },
    });
    if (!teacher) throw new NotFoundException('Không tìm thấy giáo viên');
  }

  private resolveMonthlyFinalizeDay(dto: UpdateMonthlyFinalizeDayInput) {
    if (dto.scheduledFinalizeAt === null || dto.scheduledFinalizeAt === '') {
      return { day: null, timeMinutes: null };
    }
    if (dto.scheduledFinalizeAt !== undefined) {
      const selected = new Date(dto.scheduledFinalizeAt);
      this.validateCurrentMonthFinalizeDate(selected);
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
      this.validateCurrentMonthFinalizeDate(selected);
      return {
        day: selected.getDate(),
        timeMinutes: selected.getHours() * 60 + selected.getMinutes(),
      };
    }

    if (dto.day === null || dto.day === undefined) {
      return { day: null, timeMinutes: null };
    }
    if (!Number.isInteger(dto.day) || dto.day < 1) {
      throw new BadRequestException('Ngày chốt lương không hợp lệ');
    }

    const now = new Date();
    const maxDay = this.daysInMonth(now.getFullYear(), now.getMonth());
    if (dto.day > maxDay) {
      throw new BadRequestException(`Tháng hiện tại chỉ có ${maxDay} ngày`);
    }

    const selected = new Date(
      now.getFullYear(),
      now.getMonth(),
      dto.day,
      23,
      59,
      0,
      0,
    );
    this.validateCurrentMonthFinalizeDate(selected);
    return { day: dto.day, timeMinutes: 23 * 60 + 59 };
  }

  private validateCurrentMonthFinalizeDate(selected: Date) {
    if (Number.isNaN(selected.getTime())) {
      throw new BadRequestException('Ngày chốt lương không hợp lệ');
    }

    const now = new Date();
    if (
      selected.getFullYear() !== now.getFullYear() ||
      selected.getMonth() !== now.getMonth()
    ) {
      throw new BadRequestException('Chỉ được chọn ngày trong tháng hiện tại');
    }

    if (selected.getTime() - now.getTime() < 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        'Ngày chốt lương phải cách hiện tại ít nhất 24 giờ',
      );
    }
  }

  private getMonthPeriod(referenceDate: Date): Period {
    const start = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );
    const end = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    return {
      monthKey: this.monthKey(referenceDate),
      label: `Tháng ${referenceDate.getMonth() + 1}/${referenceDate.getFullYear()}`,
      start,
      end,
    };
  }

  private defaultFinalizeDateForMonth(
    referenceDate: Date,
    day?: number | null,
    timeMinutes?: number | null,
  ) {
    const maxDay = this.daysInMonth(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
    );
    const actualDay = day ? Math.min(day, maxDay) : maxDay;
    const minutes = timeMinutes ?? 23 * 60 + 59;
    return new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      actualDay,
      Math.floor(minutes / 60),
      minutes % 60,
      0,
      0,
    );
  }

  private monthKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private daysInMonth(year: number, monthIndex: number) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  private parseLocalDate(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Ngày chốt lương không hợp lệ');
    }
    return parsed;
  }

  private startOfNextDay(date: Date) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + 1,
      0,
      0,
      0,
      0,
    );
  }

  private salaryInclude() {
    return {
      teacher: {
        include: {
          profile: true,
          teacherProfile: true,
        },
      },
      items: { include: { class: true } },
    } as const;
  }

  private parseDate(value: string, label: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${label} không hợp lệ`);
    }
    return date;
  }

  private endOfDay(date: Date) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23,
      59,
      59,
      999,
    );
  }

  private assertValidPeriod(periodStart: Date, periodEnd: Date) {
    if (periodStart > periodEnd) {
      throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
    }
  }

  private normalizeSalaryPercentage(value: number) {
    const salaryPercentage = Number(value);
    if (
      !Number.isFinite(salaryPercentage) ||
      salaryPercentage < 0 ||
      salaryPercentage > 100
    ) {
      throw new BadRequestException('Hệ số lương phải nằm trong khoảng 0-100%');
    }
    return salaryPercentage;
  }

  private isPaidSalaryStatus(status: SalaryStatus) {
    return status === SalaryStatus.PAID || status === SalaryStatus.FINALIZED;
  }
}
