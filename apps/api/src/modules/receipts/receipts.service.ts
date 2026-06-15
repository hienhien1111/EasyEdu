import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ReceiptsService {
  constructor(private prisma: PrismaService) {}

  async myReceipts(userId: string) {
    return this.prisma.receipt.findMany({
      where: { invoice: { studentId: userId } },
      include: {
        payment: true,
        invoice: { include: { items: { include: { class: true } } } },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async findOne(id: string, user: any) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: {
        payment: true,
        invoice: {
          include: {
            student: { include: { profile: true } },
            items: { include: { class: true } },
          },
        },
      },
    });
    if (!receipt) throw new NotFoundException('Không tìm thấy biên lai');

    // Students can only view their own receipts
    if (user.role === 'STUDENT' && receipt.invoice.studentId !== user.id) {
      throw new NotFoundException('Không tìm thấy biên lai');
    }

    return receipt;
  }
}
