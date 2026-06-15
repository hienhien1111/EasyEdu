import {
  InquiryStatus,
  InvoicePaymentMode,
  InvoiceStatus,
  LedgerDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  PaymentCheckStatus,
  PaymentEventActorType,
  PaymentEventType,
  PaymentInquiryReason,
  PaymentInquiryResolution,
  PaymentInquirySeverity,
  PaymentStatus,
  PrismaClient,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://tominhhien@localhost:5432/easyedu?schema=public';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as any);

const PASSWORD = 'Student@123';
const STUDENT = {
  username: 'reconcile.test1',
  email: 'reconcile.test1@student.edu.vn',
  phone: '0902888101',
  fullName: 'Reconciliation Test Student',
};

const CLASSES = [
  {
    name: 'Reconcile Test - Toan 2K',
    subject: 'Toan',
    sessions: 2,
    tuitionPerSession: 2_000,
  },
  {
    name: 'Reconcile Test - Anh 2K',
    subject: 'Anh',
    sessions: 3,
    tuitionPerSession: 2_000,
  },
];

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function currentPeriod() {
  const now = new Date();
  return {
    monthKey: monthKey(now),
    label: `Reconcile test Thang ${now.getMonth() + 1}/${now.getFullYear()}`,
    start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
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
    (await prisma.user.findFirst({
      where: { username: 'thang.tran', role: 'TEACHER' },
    })) ??
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
  for (const input of CLASSES) {
    const cls = await prisma.class.upsert({
      where: { name: input.name },
      update: {
        teacherId,
        subject: input.subject,
        grade: 'Test',
        maxStudents: 30,
        tuitionPerSession: input.tuitionPerSession,
        isActive: true,
        description: 'Low-value class for payment reconciliation tests.',
      },
      create: {
        name: input.name,
        teacherId,
        subject: input.subject,
        grade: 'Test',
        maxStudents: 30,
        tuitionPerSession: input.tuitionPerSession,
        isActive: true,
        description: 'Low-value class for payment reconciliation tests.',
      },
    });
    classes.push({ ...cls, sessions: input.sessions });
  }
  return classes;
}

async function clearOldData(studentId: string) {
  const oldInvoices = await prisma.invoice.findMany({
    where: {
      studentId,
      periodLabel: { startsWith: 'Reconcile test' },
    },
    select: { id: true },
  });
  const invoiceIds = oldInvoices.map((invoice) => invoice.id);
  if (invoiceIds.length === 0) return;

  await prisma.$transaction([
    prisma.paymentEvent.deleteMany({ where: { invoiceId: { in: invoiceIds } } }),
    prisma.ledgerEntry.deleteMany({ where: { invoiceId: { in: invoiceIds } } }),
    prisma.receipt.deleteMany({ where: { invoiceId: { in: invoiceIds } } }),
    prisma.paymentInquiry.deleteMany({
      where: { payment: { invoiceId: { in: invoiceIds } } },
    }),
    prisma.paymentLimitRequest.deleteMany({ where: { invoiceId: { in: invoiceIds } } }),
    prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } }),
    prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } }),
    prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } }),
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

async function seed() {
  const [admin, teacher, student] = await Promise.all([
    findAdmin(),
    findTeacher(),
    ensureStudent(),
  ]);
  const classes = await ensureClasses(teacher.id);
  await seedEnrollments(student.id, admin.id, classes);
  await clearOldData(student.id);

  const period = currentPeriod();
  const items = classes.map((cls) => ({
    classId: cls.id,
    description: `${cls.name} - ${cls.sessions} buoi reconciliation test`,
    sessions: cls.sessions,
    unitPrice: cls.tuitionPerSession,
    grossAmount: cls.sessions * cls.tuitionPerSession,
    depositApplied: 0,
    payableAmount: cls.sessions * cls.tuitionPerSession,
    amount: cls.sessions * cls.tuitionPerSession,
    isPaid: false,
  }));
  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

  const invoice = await prisma.invoice.create({
    data: {
      studentId: student.id,
      periodLabel: period.label,
      periodStart: period.start,
      periodEnd: period.end,
      monthKey: period.monthKey,
      grossAmount: totalAmount,
      totalAmount,
      paidAmount: 4_000,
      depositApplied: 0,
      reserveBalance: 0,
      status: InvoiceStatus.PARTIALLY_PAID,
      paymentMode: InvoicePaymentMode.QR,
      issueReason: 'MANUAL',
      maxPaymentTimes: items.length + 2,
      paymentCount: 1,
      issuedAt: new Date(),
      dueDate: period.end,
      items: { create: items },
    },
    include: { items: true },
  });

  const successPayment = await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      method: 'QR',
      amount: 4_000,
      status: PaymentStatus.SUCCESS,
      checkStatus: PaymentCheckStatus.CHECKING,
      payosOrderCode: BigInt('881406140001'),
      payosPaymentLinkId: 'reconcile-success-link',
      checkoutUrl: 'https://pay.payos.vn/web/reconcile-success-link',
      qrCode: 'RECONCILE_SUCCESS_QR',
      bankTransactionId: 'RCN-SUCCESS-0001',
      webhookReceivedAt: new Date(),
      bankResponseRaw: {
        status: 'PAID',
        note: 'Seeded success payment with settlement exception',
      },
    },
  });

  const studentRequestedPayment = await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      method: 'QR',
      amount: 3_000,
      status: PaymentStatus.PENDING,
      checkStatus: PaymentCheckStatus.REQUESTED,
      studentRequestedCheckAt: new Date(),
      payosOrderCode: BigInt('881406140002'),
      payosPaymentLinkId: 'reconcile-student-request-link',
      checkoutUrl: 'https://pay.payos.vn/web/reconcile-student-request-link',
      qrCode: 'RECONCILE_STUDENT_REQUEST_QR',
    },
  });

  const payosPendingPayment = await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      method: 'QR',
      amount: 3_000,
      status: PaymentStatus.PENDING,
      checkStatus: PaymentCheckStatus.CHECKING,
      adminCheckedAt: new Date(),
      payosOrderCode: BigInt('881406140003'),
      payosPaymentLinkId: 'reconcile-payos-pending-link',
      checkoutUrl: 'https://pay.payos.vn/web/reconcile-payos-pending-link',
      qrCode: 'RECONCILE_PAYOS_PENDING_QR',
      bankResponseRaw: { status: 'PENDING', note: 'Seeded PayOS pending case' },
    },
  });

  await prisma.receipt.create({
    data: {
      invoiceId: invoice.id,
      paymentId: successPayment.id,
      receiptNo: `RCN-${successPayment.id.slice(-8).toUpperCase()}`,
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      entryNo: `LED-QR-${successPayment.id.slice(-10).toUpperCase()}`,
      type: LedgerEntryType.STUDENT_PAYMENT,
      direction: LedgerDirection.IN,
      status: LedgerEntryStatus.POSTED,
      amount: successPayment.amount,
      invoiceId: invoice.id,
      paymentId: successPayment.id,
      studentId: student.id,
      occurredAt: new Date(),
      postedAt: new Date(),
      description: `Thu chuyen khoan hoc phi - ${invoice.periodLabel}`,
      metadata: {
        seed: true,
        source: 'SEED_RECONCILIATION_TEST',
      },
    },
  });

  await prisma.paymentInquiry.createMany({
    data: [
      {
        paymentId: successPayment.id,
        status: InquiryStatus.NEEDS_MANUAL_REVIEW,
        reason: PaymentInquiryReason.ADMIN_BANK_RECONCILIATION,
        severity: PaymentInquirySeverity.HIGH,
        openedBy: admin.id,
        handledBy: admin.id,
        adminNote:
          'Seed: he thong da SUCCESS nhung admin can doi soat tien ve tai khoan goc.',
        lastResponseRaw: { payosStatus: 'PAID', settlement: 'needs_manual_check' },
      },
      {
        paymentId: studentRequestedPayment.id,
        status: InquiryStatus.PENDING,
        reason: PaymentInquiryReason.STUDENT_REPORTED_MONEY_DEDUCTED,
        severity: PaymentInquirySeverity.NORMAL,
        openedBy: student.id,
        studentNote: 'Seed: hoc sinh bao da bi tru tien nhung he thong van pending.',
      },
      {
        paymentId: payosPendingPayment.id,
        status: InquiryStatus.NEEDS_MANUAL_REVIEW,
        reason: PaymentInquiryReason.PAYOS_PENDING,
        severity: PaymentInquirySeverity.NORMAL,
        openedBy: admin.id,
        handledBy: admin.id,
        requeryCount: 1,
        lastRequeryAt: new Date(),
        lastResponseRaw: { status: 'PENDING', message: 'PayOS chua ghi nhan tien' },
        adminNote: 'Seed: admin da re-query nhung PayOS van pending.',
      },
    ],
  });

  await prisma.paymentEvent.createMany({
    data: [
      {
        paymentId: successPayment.id,
        invoiceId: invoice.id,
        actorType: PaymentEventActorType.PAYOS,
        type: PaymentEventType.PAYMENT_CONFIRMED,
        message: 'Seed: PayOS da xac nhan thanh toan',
        payload: { status: 'PAID' },
      },
      {
        paymentId: successPayment.id,
        invoiceId: invoice.id,
        actorType: PaymentEventActorType.ADMIN,
        actorId: admin.id,
        type: PaymentEventType.SETTLEMENT_EXCEPTION_OPENED,
        message: 'Seed: admin mo ho so doi soat tai khoan goc',
      },
      {
        paymentId: studentRequestedPayment.id,
        invoiceId: invoice.id,
        actorType: PaymentEventActorType.STUDENT,
        actorId: student.id,
        type: PaymentEventType.STUDENT_CHECK_REQUESTED,
        message: 'Seed: hoc sinh yeu cau tra soat',
      },
      {
        paymentId: payosPendingPayment.id,
        invoiceId: invoice.id,
        actorType: PaymentEventActorType.ADMIN,
        actorId: admin.id,
        type: PaymentEventType.PAYOS_REQUERY_PENDING,
        message: 'Seed: PayOS van pending sau re-query',
        payload: { status: 'PENDING' },
      },
    ],
  });

  console.log('Seeded reconciliation workflow test data:');
  console.log({
    student: {
      username: STUDENT.username,
      password: PASSWORD,
      id: student.id,
    },
    invoice: {
      id: invoice.id,
      totalAmount,
      paidAmount: 4_000,
      remaining: totalAmount - 4_000,
      itemCount: items.length,
    },
    payments: {
      successWithSettlementException: successPayment.id,
      studentRequestedCheck: studentRequestedPayment.id,
      payosPendingNeedsManualReview: payosPendingPayment.id,
    },
  });
}

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
