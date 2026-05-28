import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log('🌱 Seeding EasyEdu database...');

  const hash = (pw: string) => bcrypt.hash(pw, 12);

  // ─── Rooms ───────────────────────────────────────────────────
  const rooms = await Promise.all(
    Array.from({ length: 7 }, (_, i) =>
      prisma.room.upsert({
        where: { name: `Phòng ${i + 1}` },
        update: {},
        create: { name: `Phòng ${i + 1}`, capacity: 35 },
      }),
    ),
  );
  console.log('✅ Rooms created');

  // ─── Time Slots ──────────────────────────────────────────────
  const dayMap: Record<string, any> = {
    '2': 'MON', '3': 'TUE', '4': 'WED', '5': 'THU', '6': 'FRI', '7': 'SAT', 'CN': 'SUN',
  };
  const timeRanges = ['08:00-10:00', '10:00-12:00', '14:00-16:00', '16:00-18:00', '18:00-20:00'];
  const days = ['2', '3', '4', '5', '6', '7'];
  let sortOrder = 0;
  for (const day of days) {
    for (const range of timeRanges) {
      const [start, end] = range.split('-');
      const label = `Thứ ${day} - ${range}`;
      await prisma.timeSlot.upsert({
        where: { dayOfWeek_startTime: { dayOfWeek: dayMap[day], startTime: start } },
        update: {},
        create: { dayOfWeek: dayMap[day], startTime: start, endTime: end, label, sortOrder: sortOrder++ },
      });
    }
  }
  console.log('✅ Time slots created');

  // ─── Admin ───────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: 'admin@easyedu.vn' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@easyedu.vn',
      phone: '0900000000',
      passwordHash: await hash('Admin@123'),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      profile: { create: { fullName: 'Quản trị viên EasyEdu', avatarUrl: null } },
    },
  });
  console.log('✅ Admin created: admin@easyedu.vn / Admin@123');

  // ─── Teachers ────────────────────────────────────────────────
  const teacherData = [
    { name: 'Nguyễn Thị Hương', email: 'huong.nguyen@easyedu.vn', phone: '0901111001', subjects: ['Văn'], grades: ['6', '7', '8'] },
    { name: 'Trần Văn Thắng', email: 'thang.tran@easyedu.vn', phone: '0901111002', subjects: ['Toán'], grades: ['6', '7'] },
    { name: 'Lê Thị Mai', email: 'mai.le@easyedu.vn', phone: '0901111003', subjects: ['Anh văn'], grades: ['8', '9'] },
  ];

  const teachers = [];
  for (const t of teacherData) {
    const teacher = await prisma.user.upsert({
      where: { email: t.email },
      update: {},
      create: {
        username: t.email.split('@')[0],
        email: t.email,
        phone: t.phone,
        passwordHash: await hash('Teacher@123'),
        role: UserRole.TEACHER,
        status: UserStatus.ACTIVE,
        profile: { create: { fullName: t.name } },
        teacherProfile: {
          create: {
            subjectsTaught: t.subjects,
            gradesHandled: t.grades,
            salaryPercentage: 40,
            profileCompleteness: 20,
          },
        },
      },
    });
    teachers.push(teacher);
  }
  console.log('✅ Teachers created: teacher email / Teacher@123');

  // ─── Students ────────────────────────────────────────────────
  const studentData = [
    { name: 'Phạm Văn An', email: 'an.pham@student.edu.vn', phone: '0902221001' },
    { name: 'Trần Thị Bình', email: 'binh.tran@student.edu.vn', phone: '0902221002' },
    { name: 'Nguyễn Văn Cường', email: 'cuong.nguyen@student.edu.vn', phone: '0902221003' },
    { name: 'Lê Thị Dung', email: 'dung.le@student.edu.vn', phone: '0902221004' },
    { name: 'Hoàng Văn Em', email: 'em.hoang@student.edu.vn', phone: '0902221005' },
    { name: 'Vũ Thị Phương', email: 'phuong.vu@student.edu.vn', phone: '0902221006' },
    { name: 'Đặng Văn Giang', email: 'giang.dang@student.edu.vn', phone: '0902221007' },
    { name: 'Bùi Thị Hoa', email: 'hoa.bui@student.edu.vn', phone: '0902221008' },
    { name: 'Phan Văn Inh', email: 'inh.phan@student.edu.vn', phone: '0902221009' },
    { name: 'Lý Thị Kim', email: 'kim.ly@student.edu.vn', phone: '0902221010' },
  ];

  const students = [];
  for (const s of studentData) {
    const student = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        username: s.email.split('@')[0],
        email: s.email,
        phone: s.phone,
        passwordHash: await hash('Student@123'),
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
        profile: { create: { fullName: s.name } },
        studentProfile: {
          create: {
            grade: '6',
            school: 'THCS Nguyễn Trãi',
            guardianRole: 'FATHER',
            guardianName: `Phụ huynh ${s.name}`,
            guardianPhone: s.phone.replace('0902', '0903'),
            guardianDateOfBirth: new Date('1975-01-01'),
          },
        },
      },
    });
    students.push(student);
  }
  console.log('✅ Students created: student email / Student@123');

  // ─── Classes ─────────────────────────────────────────────────
  const classData = [
    { name: 'Toán 6.1', subject: 'Toán', grade: '6', teacherIdx: 1, tuition: 100000 },
    { name: 'Toán 6.2', subject: 'Toán', grade: '6', teacherIdx: 1, tuition: 100000 },
    { name: 'Văn 6.1', subject: 'Văn', grade: '6', teacherIdx: 0, tuition: 90000 },
    { name: 'Anh Văn 8.1', subject: 'Anh văn', grade: '8', teacherIdx: 2, tuition: 120000 },
    { name: 'Toán 7.1', subject: 'Toán', grade: '7', teacherIdx: 1, tuition: 110000 },
  ];

  const classes: any[] = [];
  for (const c of classData) {
    const cls = await prisma.class.upsert({
      where: { name: c.name },
      update: {},
      create: {
        name: c.name,
        subject: c.subject,
        grade: c.grade,
        teacherId: teachers[c.teacherIdx].id,
        maxStudents: 20,
        tuitionPerSession: c.tuition,
        isActive: true,
      },
    });
    classes.push(cls);
  }
  console.log('✅ Classes created');

  // ─── Enrollments ─────────────────────────────────────────────
  // Enroll students[0-4] in class[0] (Toán 6.1), students[5-9] in class[1] (Toán 6.2)
  // And students[0,2,4] also in class[2] (Văn 6.1)
  const enrollments = [
    ...students.slice(0, 5).map((s) => ({ studentId: s.id, classId: classes[0].id })),
    ...students.slice(5, 10).map((s) => ({ studentId: s.id, classId: classes[1].id })),
    ...students.filter((_, i) => [0, 2, 4].includes(i)).map((s) => ({ studentId: s.id, classId: classes[2].id })),
  ];

  for (const e of enrollments) {
    await prisma.enrollment.upsert({
      where: { studentId_classId: { studentId: e.studentId, classId: e.classId } },
      update: {},
      create: { ...e, status: 'APPROVED', approvedAt: new Date() },
    });
  }
  console.log('✅ Enrollments created');

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📋 Login credentials:');
  console.log('  Admin:    admin@easyedu.vn    / Admin@123');
  console.log('  Teacher:  huong.nguyen@easyedu.vn / Teacher@123');
  console.log('  Student:  an.pham@student.edu.vn  / Student@123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
