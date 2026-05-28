import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Receipts - Biên lai')
@ApiBearerAuth()
@Controller('receipts')
export class ReceiptsController {
  constructor(private prisma: PrismaService) {}

  @Get('my')
  @ApiOperation({ summary: 'Học sinh: Xem biên lai của mình (UC-16)' })
  async myReceipts(@CurrentUser('id') userId: string) {
    return this.prisma.receipt.findMany({
      where: { invoice: { studentId: userId } },
      include: {
        payment: true,
        invoice: { include: { items: { include: { class: true } } } },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết biên lai (UC-16)' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
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
