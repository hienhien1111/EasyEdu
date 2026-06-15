import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class EnrollmentsService {
  constructor(private prisma: PrismaService) {}

  async register(studentId: string, classId: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        _count: { select: { enrollments: { where: { status: 'APPROVED' } } } },
      },
    });
    if (!cls || !cls.isActive) throw new NotFoundException('Lớp học không tồn tại hoặc đã đóng');

    const existing = await this.prisma.enrollment.findUnique({
      where: { studentId_classId: { studentId, classId } },
    });
    if (existing) {
      if (existing.status === 'PENDING') throw new BadRequestException('Đã có yêu cầu đăng ký đang chờ duyệt');
      if (existing.status === 'APPROVED') throw new BadRequestException('Đã là thành viên lớp này');
    }

    return this.prisma.enrollment.create({
      data: { studentId, classId, status: 'PENDING' },
      include: { class: true },
    });
  }

  async cancel(id: string, studentId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id } });
    if (!enrollment || enrollment.studentId !== studentId) throw new NotFoundException('Không tìm thấy yêu cầu');
    if (enrollment.status !== 'PENDING') throw new BadRequestException('Chỉ có thể hủy yêu cầu đang chờ duyệt');
    return this.prisma.enrollment.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  async approve(id: string, teacherId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id },
      include: { class: { include: { _count: { select: { enrollments: { where: { status: 'APPROVED' } } } } } } },
    });
    if (!enrollment) throw new NotFoundException('Không tìm thấy yêu cầu đăng ký');

    const cls = enrollment.class;
    if (cls._count.enrollments >= cls.maxStudents) {
      throw new ForbiddenException(`Lớp đã đạt sĩ số tối đa (${cls.maxStudents} học sinh)`);
    }

    return this.prisma.enrollment.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: teacherId, approvedAt: new Date() },
    });
  }

  async remove(id: string, reason: string) {
    return this.prisma.enrollment.update({
      where: { id },
      data: { status: 'REMOVED', removedAt: new Date(), removeReason: reason },
    });
  }

  async getByClass(classId: string, status?: string) {
    return this.prisma.enrollment.findMany({
      where: { classId, status: status as any },
      include: { student: { include: { profile: true, studentProfile: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async myEnrollments(studentId: string) {
    return this.prisma.enrollment.findMany({
      where: { studentId },
      include: {
        class: { include: { teacher: { include: { profile: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async adminAdd(studentId: string, classId: string) {
    if (!studentId || !classId) throw new BadRequestException('studentId và classId là bắt buộc');

    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      include: { _count: { select: { enrollments: { where: { status: 'APPROVED' } } } } },
    });
    if (!cls || !cls.isActive) throw new NotFoundException('Lớp học không tồn tại hoặc đã đóng');
    if (cls._count.enrollments >= cls.maxStudents) {
      throw new ForbiddenException(`Lớp đã đạt sĩ số tối đa (${cls.maxStudents} học sinh)`);
    }

    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    if (!student || student.role !== 'STUDENT') throw new NotFoundException('Không tìm thấy học sinh');

    const existing = await this.prisma.enrollment.findUnique({
      where: { studentId_classId: { studentId, classId } },
    });

    if (existing) {
      if (existing.status === 'APPROVED') throw new BadRequestException('Học sinh đã ở trong lớp này');
      return this.prisma.enrollment.update({
        where: { id: existing.id },
        data: { status: 'APPROVED', approvedAt: new Date() },
        include: { student: { include: { profile: true } } },
      });
    }

    return this.prisma.enrollment.create({
      data: { studentId, classId, status: 'APPROVED', approvedAt: new Date() },
      include: { student: { include: { profile: true } } },
    });
  }

  async adminRemove(enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) throw new NotFoundException('Không tìm thấy enrollment');
    return this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { status: 'REMOVED', removedAt: new Date() },
    });
  }
}
