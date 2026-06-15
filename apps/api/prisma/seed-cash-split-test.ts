import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as any);

const PASSWORD = 'Student@123';
const STUDENT = {
  username: 'cash.split1',
  email: 'cash.split1@student.edu.vn',
  phone: '0902999011',
  fullName: 'Cash Split Test Student',
};

const TEST_CLASSES = [
  {
    name: 'Cash Split Test - Toan 2K',
    subject: 'Toan',
    tuitionPerSession: 2_000,
    statuses: ['PRESENT', 'ABSENT_UNEXCUSED'],
  },
  {
    name: 'Cash Split Test - Van 3K',
    subject: 'Van',
    tuitionPerSession: 3_000,
    statuses: ['PRESENT'],
  },
];

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthPeriod(date: Date) {
  return {
    monthKey: monthKey(date),
    label: `Thang ${date.getMonth() + 1}/${date.getFullYear()}`,
    start: new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0),
    end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

function historyPeriod() {
  const now = new Date();
  const current = monthPeriod(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
  if (yesterday >= current.start) {
    return {
      ...current,
      label: `Cash split test ${current.label}`,
      end: yesterday,
    };
  }

  const previous = monthPeriod(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  return {
    ...previous,
    label: `Cash split test ${previous.label}`,
  };
}

function sessionDateFor(period: ReturnType<typeof historyPeriod>, index: number) {
  const day = Math.min(period.start.getDate() + index * 2, period.end.getDate());
  return new Date(period.start.getFullYear(), period.start.getMonth(), day, 0, 0, 0, 0);
}

function startOfNextDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
}

function defaultIssueDateForMonth(date: Date, day?: number | null, timeMinutes?: number | null) {
  const maxDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const issueDay = Math.min(day ?? maxDay, maxDay);
  const minutes = timeMinutes ?? (23 * 60 + 59);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    issueDay,
    Math.floor(minutes / 60),
    minutes % 60,
    0,
    0,
  );
}

async function findAdmin() {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) throw new Error('Khong tim thay admin ACTIVE. Hay chay seed chinh truoc.');
  return admin;
}

async function findTeacher() {
  const teacher =
    (await prisma.user.findFirst({ where: { username: 'thang.tran', role: 'TEACHER' } })) ??
    (await prisma.user.findFirst({
      where: { role: 'TEACHER', status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    }));
  if (!teacher) throw new Error('Khong tim thay teacher ACTIVE. Hay chay seed chinh truoc.');
  return teacher;
}

async function ensureStudent() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { username: STUDENT.username },
        { email: STUDENT.email },
        { phone: STUDENT.phone },
      ],
    },
  });

  const student = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          username: STUDENT.username,
          email: STUDENT.email,
          phone: STUDENT.phone,
          passwordHash,
          role: 'STUDENT',
          status: 'ACTIVE',
        },
      })
    : await prisma.user.create({
        data: {
          username: STUDENT.username,
          email: STUDENT.email,
          phone: STUDENT.phone,
          passwordHash,
          role: 'STUDENT',
          status: 'ACTIVE',
        },
      });

  await prisma.profile.upsert({
    where: { userId: student.id },
    update: { fullName: STUDENT.fullName },
    create: { userId: student.id, fullName: STUDENT.fullName },
  });
  await prisma.studentProfile.upsert({
    where: { userId: student.id },
    update: {},
    create: { userId: student.id },
  });

  return student;
}

async function ensureClasses(teacherId: string) {
  const classes = [];
  for (const input of TEST_CLASSES) {
    const cls = await prisma.class.upsert({
      where: { name: input.name },
      update: {
        teacherId,
        subject: input.subject,
        grade: 'Test',
        tuitionPerSession: input.tuitionPerSession,
        maxStudents: 30,
        isActive: true,
        description: 'Lop hoc phi thap de test thanh toan tien mat tach theo lop.',
      },
      create: {
        name: input.name,
        subject: input.subject,
        grade: 'Test',
        teacherId,
        tuitionPerSession: input.tuitionPerSession,
        maxStudents: 30,
        isActive: true,
        description: 'Lop hoc phi thap de test thanh toan tien mat tach theo lop.',
      },
    });
    classes.push({ ...cls, statuses: input.statuses });
  }
  return classes;
}

async function clearOldCashSplitInvoices(studentId: string) {
  const oldInvoices = await prisma.invoice.findMany({
    where: {
      studentId,
      OR: [
        { periodLabel: { startsWith: 'Cash split test' } },
        { status: 'DRAFT', isCurrentDraft: true },
      ],
    },
    select: { id: true },
  });
  const ids = oldInvoices.map((invoice) => invoice.id);
  if (ids.length === 0) return;

  await prisma.$transaction([
    prisma.receipt.deleteMany({ where: { invoiceId: { in: ids } } }),
    prisma.paymentInquiry.deleteMany({
      where: { payment: { invoiceId: { in: ids } } },
    }),
    prisma.paymentLimitRequest.deleteMany({ where: { invoiceId: { in: ids } } }),
    prisma.payment.deleteMany({ where: { invoiceId: { in: ids } } }),
    prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: ids } } }),
    prisma.invoice.deleteMany({ where: { id: { in: ids } } }),
  ]);
}

async function seedEnrollments(studentId: string, adminId: string, classes: Array<any>) {
  for (const cls of classes) {
    await prisma.enrollment.upsert({
      where: { studentId_classId: { studentId, classId: cls.id } },
      update: {
        status: 'APPROVED',
        approvedBy: adminId,
        approvedAt: new Date(),
        removedAt: null,
        removeReason: null,
      },
      create: {
        studentId,
        classId: cls.id,
        status: 'APPROVED',
        approvedBy: adminId,
        approvedAt: new Date(),
      },
    });
  }
}

async function seedAttendance(studentId: string, teacherId: string, classes: Array<any>, period: ReturnType<typeof historyPeriod>) {
  await prisma.attendance.deleteMany({
    where: {
      studentId,
      classId: { in: classes.map((cls) => cls.id) },
    },
  });

  for (const cls of classes) {
    for (const [index, status] of cls.statuses.entries()) {
      const sessionDate = sessionDateFor(period, index);
      const sessionStartAt = new Date(
        sessionDate.getFullYear(),
        sessionDate.getMonth(),
        sessionDate.getDate(),
        18 + index,
        0,
        0,
        0,
      );
      const sessionEndAt = new Date(
        sessionDate.getFullYear(),
        sessionDate.getMonth(),
        sessionDate.getDate(),
        19 + index,
        0,
        0,
        0,
      );
      await prisma.attendance.create({
        data: {
          classId: cls.id,
          teacherId,
          studentId,
          sessionDate,
          sessionStartAt,
          sessionEndAt,
          status,
          savedAt: sessionEndAt,
          editDeadlineAt: new Date(sessionEndAt.getTime() + 24 * 60 * 60 * 1000),
          isLocked: true,
          note: 'Seed cash split billing test',
        },
      });
    }
  }
}

async function buildItems(studentId: string, periodStart: Date, periodEnd: Date) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId,
      status: 'APPROVED',
      class: { name: { in: TEST_CLASSES.map((cls) => cls.name) } },
    },
    include: { class: true },
    orderBy: { approvedAt: 'asc' },
  });

  const items = [];
  for (const enrollment of enrollments) {
    const sessions = await prisma.attendance.count({
      where: {
        studentId,
        classId: enrollment.classId,
        sessionDate: { gte: periodStart, lte: periodEnd },
        status: { in: ['PRESENT', 'ABSENT_UNEXCUSED', 'MAKEUP'] },
      },
    });
    const grossAmount = sessions * enrollment.class.tuitionPerSession;
    items.push({
      classId: enrollment.classId,
      description: `${enrollment.class.name} - ${sessions} buoi`,
      sessions,
      unitPrice: enrollment.class.tuitionPerSession,
      grossAmount,
      depositApplied: 0,
      payableAmount: grossAmount,
      amount: grossAmount,
      isPaid: grossAmount <= 0,
    });
  }

  const grossAmount = items.reduce((sum, item) => sum + item.grossAmount, 0);
  return { items, grossAmount };
}

async function createIssuedInvoice(studentId: string, period: ReturnType<typeof historyPeriod>) {
  const built = await buildItems(studentId, period.start, period.end);
  return prisma.invoice.create({
    data: {
      studentId,
      periodLabel: period.label,
      periodStart: period.start,
      periodEnd: period.end,
      monthKey: period.monthKey,
      grossAmount: built.grossAmount,
      totalAmount: built.grossAmount,
      depositApplied: 0,
      reserveBalance: 0,
      status: 'ISSUED',
      paymentMode: 'UNDECIDED',
      issueReason: 'MANUAL',
      maxPaymentTimes: built.items.length + 1,
      paymentCount: 0,
      isPaymentLocked: false,
      isCurrentDraft: false,
      issuedAt: new Date(),
      dueDate: period.end,
      items: { create: built.items },
    },
    include: {
      student: { include: { profile: true } },
      items: { include: { class: true } },
    },
  });
}

async function createCurrentDraft(studentId: string, issuedPeriod: ReturnType<typeof historyPeriod>) {
  const now = new Date();
  const current = monthPeriod(now);
  const start =
    issuedPeriod.monthKey === current.monthKey
      ? startOfNextDay(issuedPeriod.end)
      : current.start;
  const setting = await prisma.invoiceScheduleSetting.upsert({
    where: { key: 'monthly' },
    update: {},
    create: { key: 'monthly' },
  });
  const built = await buildItems(studentId, start, current.end);

  return prisma.invoice.create({
    data: {
      studentId,
      periodLabel: current.label,
      periodStart: start,
      periodEnd: current.end,
      monthKey: current.monthKey,
      grossAmount: built.grossAmount,
      totalAmount: built.grossAmount,
      depositApplied: 0,
      reserveBalance: 0,
      status: 'DRAFT',
      paymentMode: 'UNDECIDED',
      maxPaymentTimes: built.items.length + 1,
      paymentCount: 0,
      isPaymentLocked: false,
      isCurrentDraft: true,
      scheduledIssueAt: defaultIssueDateForMonth(
        current.start,
        setting.monthlyIssueDay,
        setting.monthlyIssueTimeMinutes,
      ),
      items: { create: built.items },
    },
  });
}

async function main() {
  console.log('Seeding cash split invoice test data...');
  const [admin, teacher] = await Promise.all([findAdmin(), findTeacher()]);
  const student = await ensureStudent();
  const classes = await ensureClasses(teacher.id);
  const period = historyPeriod();

  await clearOldCashSplitInvoices(student.id);
  await seedEnrollments(student.id, admin.id, classes);
  await seedAttendance(student.id, teacher.id, classes, period);
  const invoice = await createIssuedInvoice(student.id, period);
  await createCurrentDraft(student.id, period);

  console.log('');
  console.log(`Student: ${STUDENT.username} / ${PASSWORD}`);
  console.log(`Issued invoice: ${invoice.id}`);
  console.log(`Total: ${invoice.totalAmount.toLocaleString('vi-VN')} VND`);
  console.log('Items:');
  for (const item of invoice.items) {
    console.log(
      `- ${item.class.name}: ${item.payableAmount.toLocaleString('vi-VN')} VND (${item.sessions} buoi x ${item.unitPrice.toLocaleString('vi-VN')})`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
