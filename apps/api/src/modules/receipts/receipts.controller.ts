import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReceiptsService } from './receipts.service';

@ApiTags('Receipts - Biên lai')
@ApiBearerAuth()
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get('my')
  @ApiOperation({ summary: 'Học sinh: Xem biên lai của mình (UC-16)' })
  async myReceipts(@CurrentUser('id') userId: string) {
    return this.receiptsService.myReceipts(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết biên lai (UC-16)' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.receiptsService.findOne(id, user);
  }
}
