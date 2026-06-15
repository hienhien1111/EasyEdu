/**
 * Script seed hóa đơn test cho PayOS
 * Chạy: npx ts-node prisma/seed-invoice-test.ts
 *
 * Sinh viên test: an.pham@student.edu.vn / Student@123
 * Hóa đơn: Tháng 6/2026 – gồm 2 khoản (Toán 6.1 x8 buổi + Văn 6.1 x8 buổi)
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log('🌱 Seeding test invoice for PayOS...\n');

  // 1. Lấy sinh viên đầu tiên (an.pham@student.edu.vn)
  const student = await prisma.user.findUnique({
    where: { email: 'an.pham@student.edu.vn' },
  });
  if (!student) {
    throw new Error('❌ Không tìm thấy student an.pham@student.edu.vn. Hãy chạy seed chính trước.');
  }

  // 2. Lấy các lớp mà sinh viên đã enroll
  const enrolledClasses = await prisma.enrollment.findMany({
    where: { studentId: student.id, status: 'APPROVED' },
    include: { class: true },
  });

  if (enrolledClasses.length === 0) {
    throw new Error('❌ Sinh viên chưa có enrollment. Hãy chạy seed chính trước.');
  }

  console.log(`✅ Tìm thấy sinh viên: ${student.email}`);
  console.log(`   Đã enroll ${enrolledClasses.length} lớp:`);
  enrolledClasses.forEach(e => console.log(`   - ${e.class.name} (${e.class.tuitionPerSession.toLocaleString('vi-VN')} đ/buổi)`));

  // 3. Xóa invoice cũ của tháng 6/2026 nếu có (để re-seed)
  const existingInvoice = await prisma.invoice.findFirst({
    where: { studentId: student.id, periodLabel: 'Tháng 6/2026' },
  });
  if (existingInvoice) {
    await prisma.payment.deleteMany({ where: { invoiceId: existingInvoice.id } });
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: existingInvoice.id } });
    await prisma.invoice.delete({ where: { id: existingInvoice.id } });
    console.log('\n🗑️  Đã xóa invoice cũ để tạo lại.');
  }

  // 4. Tính toán hóa đơn
  const SESSIONS_PER_CLASS = 8; // 8 buổi / tháng

  const items = enrolledClasses.map(e => ({
    classId: e.class.id,
    className: e.class.name,
    sessions: SESSIONS_PER_CLASS,
    unitPrice: e.class.tuitionPerSession,
    amount: SESSIONS_PER_CLASS * e.class.tuitionPerSession,
    description: `${e.class.name} - ${SESSIONS_PER_CLASS} buổi`,
  }));

  const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);
  const maxPaymentTimes = enrolledClasses.length + 1; // số lớp + 1

  // 5. Tạo invoice
  const invoice = await prisma.invoice.create({
    data: {
      studentId: student.id,
      periodLabel: 'Tháng 6/2026',
      periodStart: new Date('2026-06-01'),
      periodEnd: new Date('2026-06-30'),
      totalAmount,
      paidAmount: 0,
      status: 'ISSUED',
      maxPaymentTimes,
      paymentCount: 0,
      isPaymentLocked: false,
      issuedAt: new Date(),
      dueDate: new Date('2026-06-30'),
      items: {
        create: items.map(i => ({
          classId: i.classId,
          description: i.description,
          sessions: i.sessions,
          unitPrice: i.unitPrice,
          amount: i.amount,
          isPaid: false,
        })),
      },
    },
    include: { items: true },
  });

  console.log('\n✅ Hóa đơn đã tạo:');
  console.log(`   Invoice ID : ${invoice.id}`);
  console.log(`   Kỳ        : ${invoice.periodLabel}`);
  console.log(`   Tổng tiền  : ${invoice.totalAmount.toLocaleString('vi-VN')} đ`);
  console.log(`   Hạn nộp    : ${invoice.dueDate?.toLocaleDateString('vi-VN')}`);
  console.log(`   Số lần nộp : tối đa ${invoice.maxPaymentTimes} lần\n`);
  console.log('   Chi tiết hóa đơn:');
  invoice.items.forEach(item => {
    console.log(`   - [${item.id}] ${item.description}: ${item.amount.toLocaleString('vi-VN')} đ`);
  });

  console.log('\n─────────────────────────────────────────────────');
  console.log('📋 Thông tin test PayOS:');
  console.log('');
  console.log('  Login student:');
  console.log('    Email   : an.pham@student.edu.vn');
  console.log('    Password: Student@123');
  console.log('');
  console.log('  Tạo QR thanh toán:');
  console.log('    POST /api/payments/qr/initiate');
  console.log('    Body: {');
  console.log(`      "invoiceId": "${invoice.id}",`);
  console.log(`      "amount": ${Math.round(totalAmount / 2)}   ← (nộp 1 phần, hoặc ${totalAmount} để thanh toán hết)`);
  console.log('    }');
  console.log('─────────────────────────────────────────────────\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
