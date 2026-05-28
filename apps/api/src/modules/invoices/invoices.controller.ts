import {
  Controller, Get, Post, Body, Param, Query, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class CreateInvoiceDto {
  @ApiProperty() @IsNotEmpty() @IsString() studentId: string;
  @ApiProperty() @IsNotEmpty() @IsString() periodLabel: string;
  @ApiProperty() @IsNotEmpty() @IsDateString() periodStart: string;
  @ApiProperty() @IsNotEmpty() @IsDateString() periodEnd: string;
}

@ApiTags('Invoices - Hóa đơn học phí')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private prisma: PrismaService) {}

  // Admin: Create invoice for a student for a period (UC-07)
  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo hóa đơn học phí (UC-07)' })
  async create(@Body() dto: CreateInvoiceDto) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);

    // Get student's approved classes
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId: dto.studentId, status: 'APPROVED' },
      include: { class: true },
    });

    if (enrollments.length === 0) {
      throw new BadRequestException('Học sinh chưa có lớp học nào được duyệt');
    }

    // Calculate attended sessions per class from attendance records
    const invoiceItems = [];
    let totalAmount = 0;

    for (const enrollment of enrollments) {
      const cls = enrollment.class;

      // Count sessions: present + absent_unexcused count for revenue
      const attendedCount = await this.prisma.attendance.count({
        where: {
          studentId: dto.studentId,
          schedule: {
            classId: cls.id,
            effectiveDate: { gte: periodStart, lte: periodEnd },
          },
          status: { in: ['PRESENT', 'ABSENT_UNEXCUSED', 'MAKEUP'] },
        },
      });

      const amount = attendedCount * cls.tuitionPerSession;
      totalAmount += amount;

      invoiceItems.push({
        classId: cls.id,
        description: `${cls.name} - ${attendedCount} buổi`,
        sessions: attendedCount,
        unitPrice: cls.tuitionPerSession,
        amount,
      });
    }

    const maxPaymentTimes = enrollments.length + 1;

    return this.prisma.invoice.create({
      data: {
        studentId: dto.studentId,
        periodLabel: dto.periodLabel,
        periodStart,
        periodEnd,
        totalAmount,
        maxPaymentTimes,
        items: { create: invoiceItems },
      },
      include: { items: { include: { class: true } } },
    });
  }

  // Admin: List all invoices
  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách hóa đơn' })
  async findAll(
    @Query('studentId') studentId?: string,
    @Query('status') status?: string,
  ) {
    return this.prisma.invoice.findMany({
      where: { studentId, status: status as any },
      include: {
        student: { include: { profile: true } },
        items: { include: { class: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết hóa đơn' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        student: { include: { profile: true } },
        items: { include: { class: { include: { teacher: { include: { profile: true } } } } } },
        payments: true,
        receipts: true,
      },
    });
    if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn');

    // Students can only see their own invoices
    if (user.role === 'STUDENT' && invoice.studentId !== user.id) {
      throw new NotFoundException('Không tìm thấy hóa đơn');
    }

    return invoice;
  }

  // Student: View my invoices (UC-16)
  @Get('my/invoices')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh: Xem hóa đơn của mình (UC-16)' })
  async myInvoices(@CurrentUser('id') studentId: string) {
    return this.prisma.invoice.findMany({
      where: { studentId },
      include: {
        items: { include: { class: { include: { teacher: { include: { profile: true } } } } } },
        payments: true,
        receipts: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
