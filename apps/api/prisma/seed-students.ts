/**
 * Seed 30 học sinh để test phân trang
 * Chạy: npx ts-node -r tsconfig-paths/register prisma/seed-students.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as any);

const STUDENTS = [
  { fullName: 'Nguyễn Thị Bích', phone: '0901000001' },
  { fullName: 'Trần Văn Cường', phone: '0901000002' },
  { fullName: 'Lê Thị Dung', phone: '0901000003' },
  { fullName: 'Phạm Văn Đức', phone: '0901000004' },
  { fullName: 'Hoàng Thị Giang', phone: '0901000005' },
  { fullName: 'Vũ Văn Hùng', phone: '0901000006' },
  { fullName: 'Đặng Thị Hoa', phone: '0901000007' },
  { fullName: 'Bùi Văn Khoa', phone: '0901000008' },
  { fullName: 'Ngô Thị Lan', phone: '0901000009' },
  { fullName: 'Dương Văn Long', phone: '0901000010' },
  { fullName: 'Đinh Thị Mai', phone: '0901000011' },
  { fullName: 'Phan Văn Nam', phone: '0901000012' },
  { fullName: 'Lý Thị Ngọc', phone: '0901000013' },
  { fullName: 'Tô Văn Phong', phone: '0901000014' },
  { fullName: 'Trịnh Thị Quỳnh', phone: '0901000015' },
  { fullName: 'Đỗ Văn Sơn', phone: '0901000016' },
  { fullName: 'Cao Thị Thanh', phone: '0901000017' },
  { fullName: 'Lưu Văn Thắng', phone: '0901000018' },
  { fullName: 'Hồ Thị Thu', phone: '0901000019' },
  { fullName: 'Mai Văn Tùng', phone: '0901000020' },
  { fullName: 'Vương Thị Uyên', phone: '0901000021' },
  { fullName: 'Tống Văn Việt', phone: '0901000022' },
  { fullName: 'Châu Thị Xuân', phone: '0901000023' },
  { fullName: 'Kiều Văn Yên', phone: '0901000024' },
  { fullName: 'La Thị Ánh', phone: '0901000025' },
  { fullName: 'Đoàn Văn Bình', phone: '0901000026' },
  { fullName: 'Tạ Thị Chi', phone: '0901000027' },
  { fullName: 'Mạc Văn Dần', phone: '0901000028' },
  { fullName: 'Quách Thị Em', phone: '0901000029' },
  { fullName: 'Liêu Văn Phát', phone: '0901000030' },
];

async function main() {
  console.log('🌱 Seeding 30 students for pagination test...\n');

  const passwordHash = await bcrypt.hash('Student@123', 10);
  let created = 0, skipped = 0;

  for (const s of STUDENTS) {
    const slug = s.fullName
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/\s+/g, '.')
      .replace(/[^a-z.]/g, '');
    const email = `${slug}@student.edu.vn`;

    const exists = await prisma.user.findFirst({ where: { OR: [{ email }, { phone: s.phone }] } });
    if (exists) { skipped++; continue; }

    const username = slug + '_' + Date.now().toString().slice(-6);
    await prisma.user.create({
      data: {
        username, email, phone: s.phone,
        passwordHash, role: 'STUDENT', status: 'ACTIVE',
        profile: { create: { fullName: s.fullName } },
        studentProfile: { create: {} },
      },
    });
    created++;
    process.stdout.write(`  ✅ ${s.fullName} (${email})\n`);
  }

  console.log(`\n✨ Done: ${created} created, ${skipped} skipped (already exist)`);
  console.log('📋 Password cho tất cả: Student@123');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
