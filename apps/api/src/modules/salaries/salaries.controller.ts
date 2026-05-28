import {
  Controller, Get, Post, Patch, Body, Param, Query, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsString, IsNotEmpty, IsDateString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class CalculateSalaryDto {
  @ApiProperty() @IsNotEmpty() @IsString() teacherId: string;
  @ApiProperty() @IsNotEmpty() @IsString() periodLabel: string;
  @ApiProperty() @IsNotEmpty() @IsDateString() periodStart: string;
  @ApiProperty() @IsNotEmpty() @IsDateString() periodEnd: string;
}

class UpdateSalaryDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() manualAdjustment?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

@ApiTags('Salaries - Tính lương giáo viên')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('salaries')
export class SalariesController {
  constructor(private prisma: PrismaService) {}

  // Admin: Calculate salary for a teacher (UC-09)
  @Post('calculate')
  @ApiOperation({ summary: 'Tính lương giáo viên (UC-09)' })
  async calculate(@Body() dto: CalculateSalaryDto) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);

    const teacher = await this.prisma.user.findUnique({
      where: { id: dto.teacherId, role: 'TEACHER' },
      include: { teacherProfile: true },
    });
    if (!teacher) throw new NotFoundException('Không tìm thấy giáo viên');

    const salaryPct = teacher.teacherProfile?.salaryPercentage || 40;

    // Get teacher's classes
    const classes = await this.prisma.class.findMany({
      where: { teacherId: dto.teacherId, isActive: true },
    });

    let totalRevenue = 0;
    const salaryItems = [];

    for (const cls of classes) {
      // Count sessions taught (not CANCELLED)
      const sessionsTaught = await this.prisma.schedule.count({
        where: {
          classId: cls.id,
          teacherId: dto.teacherId,
          type: { not: 'CANCELLED' },
          effectiveDate: { gte: periodStart, lte: periodEnd },
        },
      });

      // Count students in class
      const studentCount = await this.prisma.enrollment.count({
        where: { classId: cls.id, status: 'APPROVED' },
      });

      // Revenue = sessions * tuition * students (minus absent_excused without makeup)
      const absentExcusedNoMakeup = await this.prisma.attendance.count({
        where: {
          schedule: {
            classId: cls.id,
            effectiveDate: { gte: periodStart, lte: periodEnd },
          },
          status: 'ABSENT_EXCUSED',
          makeupSourceId: null,
        },
      });

      const billableStudentSessions =
        sessionsTaught * studentCount - absentExcusedNoMakeup;
      const revenueAmount = Math.max(0, billableStudentSessions * cls.tuitionPerSession);
      totalRevenue += revenueAmount;

      salaryItems.push({
        classId: cls.id,
        sessionsTaught,
        revenueAmount,
        note: `${sessionsTaught} buổi x ${studentCount} hs - ${absentExcusedNoMakeup} vắng có phép`,
      });
    }

    // Cash already collected by teacher
    const cashCollected = await this.prisma.payment.aggregate({
      where: {
        cashCollectorId: dto.teacherId,
        method: 'CASH',
        status: 'SUCCESS',
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amount: true },
    });
    const cashDeduction = cashCollected._sum.amount || 0;

    const grossSalary = (totalRevenue * salaryPct) / 100;
    const netSalary = grossSalary - cashDeduction;

    // Create or update draft salary
    const existing = await this.prisma.salary.findUnique({
      where: { teacherId_periodStart: { teacherId: dto.teacherId, periodStart } },
    });

    if (existing) {
      return this.prisma.salary.update({
        where: { id: existing.id },
        data: {
          totalRevenue, salaryPercentage: salaryPct,
          grossSalary, cashDeduction, netSalary,
          items: { deleteMany: {}, create: salaryItems },
        },
        include: { items: { include: { class: true } }, teacher: { include: { profile: true } } },
      });
    }

    return this.prisma.salary.create({
      data: {
        teacherId: dto.teacherId, periodLabel: dto.periodLabel,
        periodStart, periodEnd, totalRevenue,
        salaryPercentage: salaryPct, grossSalary, cashDeduction, netSalary,
        items: { create: salaryItems },
      },
      include: { items: { include: { class: true } }, teacher: { include: { profile: true } } },
    });
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách bảng lương' })
  async findAll(@Query('teacherId') teacherId?: string, @Query('period') period?: string) {
    return this.prisma.salary.findMany({
      where: { teacherId, periodLabel: period },
      include: {
        teacher: { include: { profile: true } },
        items: { include: { class: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật thủ công bảng lương nháp (UC-09)' })
  async update(@Param('id') id: string, @Body() dto: UpdateSalaryDto) {
    const salary = await this.prisma.salary.findUnique({ where: { id } });
    if (!salary) throw new NotFoundException('Không tìm thấy bảng lương');
    if (salary.status === 'FINALIZED') throw new BadRequestException('Bảng lương đã chốt, không thể chỉnh sửa');

    const newNet = salary.grossSalary - salary.cashDeduction + (dto.manualAdjustment ?? salary.manualAdjustment);
    return this.prisma.salary.update({
      where: { id },
      data: { manualAdjustment: dto.manualAdjustment, note: dto.note, netSalary: newNet },
    });
  }

  @Patch(':id/finalize')
  @ApiOperation({ summary: 'Chốt bảng lương (UC-09)' })
  async finalize(@Param('id') id: string, @CurrentUser('id') adminId: string) {
    const salary = await this.prisma.salary.findUnique({ where: { id } });
    if (!salary) throw new NotFoundException('Không tìm thấy bảng lương');
    if (salary.status === 'FINALIZED') throw new BadRequestException('Bảng lương đã được chốt');

    return this.prisma.salary.update({
      where: { id },
      data: { status: 'FINALIZED', finalizedAt: new Date(), finalizedBy: adminId },
    });
  }
}
