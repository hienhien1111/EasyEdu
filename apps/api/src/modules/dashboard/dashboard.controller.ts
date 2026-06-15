import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard - Báo cáo & Thống kê')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Dashboard tổng quan (UC-17)' })
  async getDashboard() {
    return this.dashboardService.getDashboard();
  }

  @Get('class-rankings')
  @ApiOperation({ summary: 'Xếp hạng tỷ lệ thu tiền lớp học (UC-17)' })
  async classRankings() {
    return this.dashboardService.classRankings();
  }

  @Get('class/:classId/debtors')
  @ApiOperation({ summary: 'Danh sách học sinh nợ tiền của lớp (UC-17)' })
  async classDebtors(@Param('classId') classId: string) {
    return this.dashboardService.classDebtors(classId);
  }

  @Get('cash-flow')
  @ApiOperation({ summary: 'Dòng tiền theo thời gian (UC-17)' })
  async cashFlow(@Query('period') period: string = 'monthly') {
    return this.dashboardService.cashFlow(period);
  }
}
