import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface CreateClassInput {
  name: string;
  subject: string;
  grade: string;
  teacherId: string;
  maxStudents?: number;
  tuitionPerSession?: number;
  description?: string;
}

export interface UpdateClassInput {
  name?: string;
  subject?: string;
  grade?: string;
  teacherId?: string;
  maxStudents?: number;
  tuitionPerSession?: number;
  isActive?: boolean;
  description?: string;
}

@Injectable()
export class ClassesService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    page: number | string,
    limit: number | string,
    search?: string,
    teacherId?: string,
    isActive?: string,
  ) {
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(200, parseInt(String(limit), 10) || 20);
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (teacherId) where.teacherId = teacherId;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [total, classes] = await Promise.all([
      this.prisma.class.count({ where }),
      this.prisma.class.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        include: {
          teacher: { include: { profile: true } },
          _count: { select: { enrollments: { where: { status: 'APPROVED' } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: classes.map((c) => ({
        ...c,
        studentCount: c._count.enrollments,
        teacherName: c.teacher.profile?.fullName,
      })),
      meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    };
  }

  async findOne(id: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id },
      include: {
        teacher: { include: { profile: true } },
        enrollments: {
          where: { status: 'APPROVED' },
          include: { student: { include: { profile: true } } },
        },
        schedules: { include: { room: true, timeSlot: true } },
      },
    });
    if (!cls) throw new NotFoundException('Không tìm thấy lớp học');
    return cls;
  }

  async create(dto: CreateClassInput) {
    if (!dto.teacherId) throw new BadRequestException('Lớp học bắt buộc phải có giáo viên phụ trách');

    const existing = await this.prisma.class.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Tên lớp học đã tồn tại');

    const teacher = await this.prisma.user.findFirst({
      where: { id: dto.teacherId, role: 'TEACHER' },
    });
    if (!teacher) throw new BadRequestException('Giáo viên không hợp lệ');

    return this.prisma.class.create({
      data: {
        name: dto.name, subject: dto.subject, grade: dto.grade,
        teacherId: dto.teacherId, maxStudents: dto.maxStudents || 30,
        tuitionPerSession: dto.tuitionPerSession || 0,
        description: dto.description,
      },
      include: { teacher: { include: { profile: true } } },
    });
  }

  async update(id: string, dto: UpdateClassInput) {
    const cls = await this.prisma.class.findUnique({ where: { id } });
    if (!cls) throw new NotFoundException('Không tìm thấy lớp học');

    if (dto.name && dto.name !== cls.name) {
      const existing = await this.prisma.class.findUnique({ where: { name: dto.name } });
      if (existing) throw new ConflictException('Tên lớp học đã tồn tại');
    }

    return this.prisma.class.update({
      where: { id },
      data: dto,
      include: { teacher: { include: { profile: true } } },
    });
  }

  async remove(id: string) {
    await this.prisma.class.delete({ where: { id } });
  }

  async myClasses(teacherId: string) {
    const classes = await this.prisma.class.findMany({
      where: { teacherId, isActive: true },
      include: {
        _count: { select: { enrollments: { where: { status: 'APPROVED' } } } },
        enrollments: {
          where: { status: { in: ['APPROVED', 'PENDING'] } },
          include: { student: { include: { profile: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return classes.map((cls) => ({
      ...cls,
      studentCount: cls._count.enrollments,
      approvedEnrollments: cls.enrollments.filter((e) => e.status === 'APPROVED'),
      pendingEnrollments: cls.enrollments.filter((e) => e.status === 'PENDING'),
    }));
  }
}
