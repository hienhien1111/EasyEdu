import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as any);

const TEST_PERIODS = [
  {
    label: 'PayOS Test 1 - Tháng 6/2026',
    start: new Date('2026-06-01T00:00:00+07:00'),
    end: new Date('2026-06-30T23:59:59+07:00'),
    due: new Date('2026-06-30T23:59:59+07:00'),
    sessions: 2,
  },
  {
    label: 'PayOS Test 2 - Tháng 7/2026',
    start: new Date('2026-07-01T00:00:00+07:00'),
    end: new Date('2026-07-31T23:59:59+07:00'),
    due: new Date('2026-07-31T23:59:59+07:00'),
    sessions: 1,
  },
];

async function main() {
  const student = await prisma.user.findUnique({
    where: { username: 'an.pham' },
  });
  if (!student) {
    throw new Error('Không tìm thấy student an.pham');
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: student.id, status: 'APPROVED' },
    include: { class: true },
    orderBy: { createdAt: 'asc' },
  });
  if (enrollments.length === 0) {
    throw new Error('Student an.pham chưa có lớp APPROVED');
  }

  const oldInvoices = await prisma.invoice.findMany({
    where: {
      studentId: student.id,
      periodLabel: { in: TEST_PERIODS.map((p) => p.label) },
    },
    select: { id: true },
  });
  const oldInvoiceIds = oldInvoices.map((invoice) => invoice.id);
  if (oldInvoiceIds.length > 0) {
    await prisma.$transaction([
      prisma.receipt.deleteMany({
        where: { invoiceId: { in: oldInvoiceIds } },
      }),
      prisma.paymentInquiry.deleteMany({
        where: { payment: { invoiceId: { in: oldInvoiceIds } } },
      }),
      prisma.payment.deleteMany({
        where: { invoiceId: { in: oldInvoiceIds } },
      }),
      prisma.invoiceItem.deleteMany({
        where: { invoiceId: { in: oldInvoiceIds } },
      }),
      prisma.invoice.deleteMany({ where: { id: { in: oldInvoiceIds } } }),
    ]);
  }

  const created = [];
  for (const period of TEST_PERIODS) {
    const selectedEnrollments = enrollments.slice(
      0,
      Math.min(2, enrollments.length),
    );
    const items = selectedEnrollments.map((enrollment) => ({
      classId: enrollment.classId,
      description: `${enrollment.class.name} - ${period.sessions} buổi test PayOS`,
      sessions: period.sessions,
      unitPrice: enrollment.class.tuitionPerSession,
      amount: period.sessions * enrollment.class.tuitionPerSession,
      isPaid: false,
    }));
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

    const invoice = await prisma.invoice.create({
      data: {
        studentId: student.id,
        periodLabel: period.label,
        periodStart: period.start,
        periodEnd: period.end,
        totalAmount,
        paidAmount: 0,
        status: 'ISSUED',
        maxPaymentTimes: Math.max(items.length + 1, 2),
        paymentCount: 0,
        isPaymentLocked: false,
        issuedAt: new Date(),
        dueDate: period.due,
        items: { create: items },
      },
      include: { items: true },
    });

    created.push(invoice);
  }

  console.log('Created PayOS webhook test invoices:');
  for (const invoice of created) {
    console.log(
      `- ${invoice.periodLabel}: ${invoice.totalAmount.toLocaleString('vi-VN')} VND (${invoice.id})`,
    );
  }
  console.log('Student login: an.pham / Student@123');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
