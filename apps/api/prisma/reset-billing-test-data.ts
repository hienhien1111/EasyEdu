import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as any);

const TEST_CLASS_NAME = 'PayOS Test - Hoc phi 2K';
const STUDENT_PASSWORD = 'Student@123';
const LOW_TUITION = 2_000;

const TEST_STUDENTS = [
  {
    username: 'payos.test1',
    email: 'payos.test1@student.edu.vn',
    phone: '0902999001',
    fullName: 'PayOS Test Student 01',
    billableStatuses: ['PRESENT', 'PRESENT', 'ABSENT_UNEXCUSED'],
  },
  {
    username: 'payos.test2',
    email: 'payos.test2@student.edu.vn',
    phone: '0902999002',
    fullName: 'PayOS Test Student 02',
    billableStatuses: ['PRESENT', 'ABSENT_UNEXCUSED'],
  },
  {
    username: 'payos.test3',
    email: 'payos.test3@student.edu.vn',
    phone: '0902999003',
    fullName: 'PayOS Test Student 03',
    billableStatuses: ['PRESENT'],
  },
];

type Period = {
  monthKey: string;
  label: string;
  start: Date;
  end: Date;
};

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthPeriod(date: Date): Period {
  return {
    monthKey: monthKey(date),
    label: `Thang ${date.getMonth() + 1}/${date.getFullYear()}`,
    start: new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0),
    end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999),
  };
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

function startOfNextDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
}

function buildHistoryPeriod(now: Date): Period {
  const current = monthPeriod(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
  if (yesterday >= current.start) {
    return {
      ...current,
      label: `PayOS test ${current.label}`,
      end: yesterday,
    };
  }

  const previous = monthPeriod(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  return {
    ...previous,
    label: `PayOS test ${previous.label}`,
  };
}

async function resetBillingData() {
  await prisma.$transaction([
    prisma.receipt.deleteMany({}),
    prisma.paymentInquiry.deleteMany({}),
    prisma.paymentLimitRequest.deleteMany({}),
    prisma.payment.deleteMany({}),
    prisma.invoiceItem.deleteMany({}),
    prisma.invoice.deleteMany({}),
  ]);
}

async function findAdmin() {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) {
    throw new Error('Khong tim thay admin ACTIVE. Hay chay seed chinh truoc.');
  }
  return admin;
}

async function findTeacher() {
  const teacher =
    (await prisma.user.findFirst({
      where: { username: 'thang.tran', role: 'TEACHER' },
    })) ??
    (await prisma.user.findFirst({
      where: { role: 'TEACHER', status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    }));

  if (!teacher) {
    throw new Error('Khong tim thay teacher ACTIVE. Hay chay seed chinh truoc.');
  }
  return teacher;
}

async function ensureTestClass(teacherId: string) {
  return prisma.class.upsert({
    where: { name: TEST_CLASS_NAME },
    update: {
      teacherId,
      subject: 'PayOS Test',
      grade: 'Test',
      tuitionPerSession: LOW_TUITION,
      isActive: true,
      maxStudents: 30,
      description: 'Lop hoc phi thap de test thanh toan PayOS bang tien that.',
    },
    create: {
      name: TEST_CLASS_NAME,
      subject: 'PayOS Test',
      grade: 'Test',
      teacherId,
      maxStudents: 30,
      tuitionPerSession: LOW_TUITION,
      isActive: true,
      description: 'Lop hoc phi thap de test thanh toan PayOS bang tien that.',
    },
  });
}

async function ensureTestStudents(classId: string, adminId: string) {
  const passwordHash = await bcrypt.hash(STUDENT_PASSWORD, 10);
  const students = [];

  for (const input of TEST_STUDENTS) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { username: input.username },
          { email: input.email },
          { phone: input.phone },
        ],
      },
    });

    const student = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            username: input.username,
            email: input.email,
            phone: input.phone,
            passwordHash,
            role: 'STUDENT',
            status: 'ACTIVE',
          },
        })
      : await prisma.user.create({
          data: {
            username: input.username,
            email: input.email,
            phone: input.phone,
            passwordHash,
            role: 'STUDENT',
            status: 'ACTIVE',
          },
        });

    await prisma.profile.upsert({
      where: { userId: student.id },
      update: { fullName: input.fullName },
      create: { userId: student.id, fullName: input.fullName },
    });
    await prisma.studentProfile.upsert({
      where: { userId: student.id },
      update: {},
      create: { userId: student.id },
    });
    await prisma.enrollment.upsert({
      where: { studentId_classId: { studentId: student.id, classId } },
      update: {
        status: 'APPROVED',
        approvedBy: adminId,
        approvedAt: new Date(),
        removedAt: null,
        removeReason: null,
      },
      create: {
        studentId: student.id,
        classId,
        status: 'APPROVED',
        approvedBy: adminId,
        approvedAt: new Date(),
      },
    });

    students.push({ ...student, billableStatuses: input.billableStatuses });
  }

  return students;
}

function sessionDateFor(period: Period, index: number) {
  const periodDay = period.start.getDate();
  const lastDay = period.end.getDate();
  const day = Math.min(periodDay + index * 2, lastDay);
  return new Date(period.start.getFullYear(), period.start.getMonth(), day, 0, 0, 0, 0);
}

async function seedAttendanceHistory(students: Array<any>, classId: string, teacherId: string, period: Period) {
  await prisma.attendance.deleteMany({
    where: {
      classId,
      studentId: { in: students.map((student) => student.id) },
    },
  });

  for (const student of students) {
    for (const [index, status] of student.billableStatuses.entries()) {
      const sessionDate = sessionDateFor(period, index);
      const sessionStartAt = new Date(
        sessionDate.getFullYear(),
        sessionDate.getMonth(),
        sessionDate.getDate(),
        19,
        0,
        0,
        0,
      );
      const sessionEndAt = new Date(
        sessionDate.getFullYear(),
        sessionDate.getMonth(),
        sessionDate.getDate(),
        20,
        0,
        0,
        0,
      );

      await prisma.attendance.create({
        data: {
          classId,
          teacherId,
          studentId: student.id,
          sessionDate,
          sessionStartAt,
          sessionEndAt,
          status,
          savedAt: sessionEndAt,
          editDeadlineAt: new Date(sessionEndAt.getTime() + 24 * 60 * 60 * 1000),
          isLocked: true,
          note: 'Seed PayOS billing test',
        },
      });
    }
  }
}

async function calculateBillableSessions(studentId: string, classId: string, periodStart: Date, periodEnd: Date) {
  const regularBillableCount = await prisma.attendance.count({
    where: {
      studentId,
      classId,
      sessionDate: { gte: periodStart, lte: periodEnd },
      status: { in: ['PRESENT', 'ABSENT_UNEXCUSED', 'MAKEUP'] },
    },
  });

  const excusedAbsences = await prisma.attendance.findMany({
    where: {
      studentId,
      classId,
      sessionDate: { gte: periodStart, lte: periodEnd },
      status: 'ABSENT_EXCUSED',
    },
    select: { id: true },
  });
  if (excusedAbsences.length === 0) return regularBillableCount;

  const madeUpExcusedCount = await prisma.attendance.count({
    where: {
      studentId,
      status: { in: ['PRESENT', 'MAKEUP'] },
      makeupSourceId: { in: excusedAbsences.map((record) => record.id) },
    },
  });

  return regularBillableCount + madeUpExcusedCount;
}

async function buildInvoiceItems(studentId: string, periodStart: Date, periodEnd: Date) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId, status: 'APPROVED' },
    include: { class: true },
    orderBy: { approvedAt: 'asc' },
  });

  const items = [];
  for (const enrollment of enrollments) {
    const sessions = await calculateBillableSessions(
      studentId,
      enrollment.classId,
      periodStart,
      periodEnd,
    );
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
  return { items, grossAmount, totalAmount: grossAmount };
}

async function createIssuedInvoices(students: Array<any>, period: Period) {
  const invoices = [];
  for (const student of students) {
    const built = await buildInvoiceItems(student.id, period.start, period.end);
    const invoice = await prisma.invoice.create({
      data: {
        studentId: student.id,
        periodLabel: period.label,
        periodStart: period.start,
        periodEnd: period.end,
        monthKey: period.monthKey,
        grossAmount: built.grossAmount,
        totalAmount: built.totalAmount,
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
      include: { student: { include: { profile: true } }, items: true },
    });
    invoices.push(invoice);
  }
  return invoices;
}

async function createCurrentDrafts(issuedStudents: Array<any>, issuedPeriod: Period) {
  const now = new Date();
  const currentPeriod = monthPeriod(now);
  const setting = await prisma.invoiceScheduleSetting.upsert({
    where: { key: 'monthly' },
    update: {},
    create: { key: 'monthly' },
  });
  const scheduledIssueAt = defaultIssueDateForMonth(
    currentPeriod.start,
    setting.monthlyIssueDay,
    setting.monthlyIssueTimeMinutes,
  );
  const issuedStudentIds = new Set(issuedStudents.map((student) => student.id));
  const draftStartForIssued =
    issuedPeriod.monthKey === currentPeriod.monthKey
      ? startOfNextDay(issuedPeriod.end)
      : currentPeriod.start;

  const activeStudents = await prisma.user.findMany({
    where: {
      role: 'STUDENT',
      status: 'ACTIVE',
      enrollments: { some: { status: 'APPROVED' } },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  const drafts = [];
  for (const student of activeStudents) {
    const periodStart = issuedStudentIds.has(student.id)
      ? draftStartForIssued
      : currentPeriod.start;
    const built = await buildInvoiceItems(student.id, periodStart, currentPeriod.end);
    const draft = await prisma.invoice.create({
      data: {
        studentId: student.id,
        periodLabel: currentPeriod.label,
        periodStart,
        periodEnd: currentPeriod.end,
        monthKey: currentPeriod.monthKey,
        grossAmount: built.grossAmount,
        totalAmount: built.totalAmount,
        depositApplied: 0,
        reserveBalance: 0,
        status: 'DRAFT',
        paymentMode: 'UNDECIDED',
        maxPaymentTimes: built.items.length + 1,
        paymentCount: 0,
        isPaymentLocked: false,
        isCurrentDraft: true,
        scheduledIssueAt,
        items: { create: built.items },
      },
      include: { student: { include: { profile: true } }, items: true },
    });
    drafts.push(draft);
  }

  return drafts;
}

async function main() {
  console.log('Reset billing data and seed PayOS-friendly invoices...');

  await resetBillingData();
  const admin = await findAdmin();
  const teacher = await findTeacher();
  const testClass = await ensureTestClass(teacher.id);
  const students = await ensureTestStudents(testClass.id, admin.id);
  const historyPeriod = buildHistoryPeriod(new Date());

  await seedAttendanceHistory(students, testClass.id, teacher.id, historyPeriod);
  const issuedInvoices = await createIssuedInvoices(students, historyPeriod);
  const drafts = await createCurrentDrafts(students, historyPeriod);

  console.log('');
  console.log(`Deleted old billing data.`);
  console.log(`Test class: ${testClass.name} (${LOW_TUITION.toLocaleString('vi-VN')} VND/buoi)`);
  console.log(`Attendance period: ${historyPeriod.start.toLocaleDateString('vi-VN')} - ${historyPeriod.end.toLocaleDateString('vi-VN')}`);
  console.log(`Draft invoices created: ${drafts.length}`);
  console.log('');
  console.log('Issued PayOS test invoices:');
  for (const invoice of issuedInvoices) {
    console.log(
      `- ${invoice.student.profile?.fullName ?? invoice.student.email}: ${invoice.totalAmount.toLocaleString('vi-VN')} VND (${invoice.id})`,
    );
  }
  console.log('');
  console.log('Student accounts for testing:');
  for (const student of TEST_STUDENTS) {
    console.log(`- ${student.username} / ${STUDENT_PASSWORD}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
