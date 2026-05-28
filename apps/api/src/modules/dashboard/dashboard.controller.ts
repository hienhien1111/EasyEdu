import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Dashboard - Báo cáo & Thống kê')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('dashboard')
export class DashboardController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Dashboard tổng quan (UC-17)' })
  async getDashboard() {
    const [
      totalRevenue,
      totalClasses,
      totalStudents,
      totalTeachers,
      pendingPayments,
      pendingEnrollments,
      recentPayments,
    ] = await Promise.all([
      // Total successful revenue
      this.prisma.payment.aggregate({
        where: { status: 'SUCCESS' },
        _sum: { amount: true },
      }),
      this.prisma.class.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { role: 'TEACHER', status: 'ACTIVE' } }),
      this.prisma.invoice.count({ where: { status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] } } }),
      this.prisma.enrollment.count({ where: { status: 'PENDING' } }),
      this.prisma.payment.findMany({
        where: { status: 'SUCCESS' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { invoice: { include: { student: { include: { profile: true } } } } },
      }),
    ]);

    return {
      totalRevenue: totalRevenue._sum.amount || 0,
      totalClasses,
      totalStudents,
      totalTeachers,
      pendingPayments,
      pendingEnrollments,
      recentPayments,
    };
  }

  @Get('class-rankings')
  @ApiOperation({ summary: 'Xếp hạng tỷ lệ thu tiền lớp học (UC-17)' })
  async classRankings() {
    const classes = await this.prisma.class.findMany({
      where: { isActive: true },
      include: {
        teacher: { include: { profile: true } },
        _count: { select: { enrollments: { where: { status: 'APPROVED' } } } },
        invoiceItems: {
          include: {
            invoice: true,
          },
        },
      },
    });

    const rankings = classes.map((cls) => {
      const totalBilled = cls.invoiceItems.reduce((sum, item) => sum + item.amount, 0);
      const totalPaid = cls.invoiceItems.reduce((sum, item) => {
        return sum + (item.isPaid ? item.amount : 0);
      }, 0);
      const paymentRate = totalBilled > 0 ? (totalPaid / totalBilled) * 100 : 100;

      return {
        classId: cls.id,
        className: cls.name,
        subject: cls.subject,
        teacherName: cls.teacher.profile?.fullName,
        studentCount: cls._count.enrollments,
        totalBilled,
        totalPaid,
        paymentRate: Math.round(paymentRate),
      };
    });

    return rankings.sort((a, b) => b.paymentRate - a.paymentRate);
  }

  @Get('class/:classId/debtors')
  @ApiOperation({ summary: 'Danh sách học sinh nợ tiền của lớp (UC-17)' })
  async classDebtors(@Param('classId') classId: string) {
    const unpaidItems = await this.prisma.invoiceItem.findMany({
      where: { classId, isPaid: false, invoice: { status: { not: 'DRAFT' } } },
      include: {
        invoice: {
          include: {
            student: { include: { profile: true, studentProfile: true } },
          },
        },
      },
    });

    return unpaidItems.map((item) => ({
      studentId: item.invoice.studentId,
      studentName: item.invoice.student.profile?.fullName,
      phone: item.invoice.student.phone,
      guardianPhone: item.invoice.student.studentProfile?.guardianPhone,
      amount: item.amount,
      paidAmount: item.invoice.paidAmount,
      remaining: item.invoice.totalAmount - item.invoice.paidAmount,
      dueDate: item.invoice.dueDate,
    }));
  }

  @Get('cash-flow')
  @ApiOperation({ summary: 'Dòng tiền theo thời gian (UC-17)' })
  async cashFlow(@Query('period') period: string = 'monthly') {
    const now = new Date();
    const startDate = period === 'monthly'
      ? new Date(now.getFullYear(), now.getMonth() - 5, 1)
      : new Date(now.getFullYear() - 1, 0, 1);

    const payments = await this.prisma.payment.findMany({
      where: {
        status: 'SUCCESS',
        createdAt: { gte: startDate },
      },
      select: { amount: true, method: true, createdAt: true },
    });

    // Group by month
    const grouped: Record<string, { qr: number; cash: number; total: number }> = {};
    for (const p of payments) {
      const key = `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (!grouped[key]) grouped[key] = { qr: 0, cash: 0, total: 0 };
      if (p.method === 'QR') grouped[key].qr += p.amount;
      else grouped[key].cash += p.amount;
      grouped[key].total += p.amount;
    }

    return Object.entries(grouped).map(([month, data]) => ({ month, ...data }));
  }
}
