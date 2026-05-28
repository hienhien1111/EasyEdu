import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  BadRequestException, NotFoundException, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole, NotificationTargetType } from '@prisma/client';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class CreateNotificationDto {
  @ApiProperty() @IsNotEmpty() @IsString() title: string;
  @ApiProperty() @IsNotEmpty() @IsString() content: string;
  @ApiProperty({ enum: NotificationTargetType }) @IsEnum(NotificationTargetType) targetType: NotificationTargetType;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() specificUserIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() attachmentUrls?: string[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string; // null = send immediately
}

@ApiTags('Notifications - Thông báo')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  // Admin: Create and send notification (UC-10)
  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo và gửi thông báo (UC-10)' })
  async create(@Body() dto: CreateNotificationDto, @CurrentUser('id') adminId: string) {
    // Validate schedule must be > 5 mins from now
    if (dto.scheduledAt) {
      const scheduleTime = new Date(dto.scheduledAt);
      if (scheduleTime.getTime() - Date.now() < 5 * 60 * 1000) {
        throw new BadRequestException('Thời gian hẹn gửi phải lớn hơn thời gian hiện tại ít nhất 5 phút');
      }
    }

    // Determine recipients
    let userIds: string[] = [];
    if (dto.targetType === 'SPECIFIC_USERS' && dto.specificUserIds) {
      userIds = dto.specificUserIds;
    } else {
      const whereClause: any = {};
      if (dto.targetType === 'ALL_STUDENTS') whereClause.role = 'STUDENT';
      else if (dto.targetType === 'ALL_TEACHERS') whereClause.role = 'TEACHER';
      // ALL: no filter

      const users = await this.prisma.user.findMany({
        where: dto.targetType === 'ALL' ? {} : whereClause,
        select: { id: true },
      });
      userIds = users.map((u) => u.id);
    }

    const status = dto.scheduledAt ? 'SCHEDULED' : 'SENT';
    const sentAt = dto.scheduledAt ? null : new Date();

    const notification = await this.prisma.notification.create({
      data: {
        creatorId: adminId,
        title: dto.title,
        content: dto.content,
        targetType: dto.targetType,
        attachmentUrls: dto.attachmentUrls || [],
        status,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        sentAt,
        recipients: {
          create: userIds.map((userId) => ({ userId })),
        },
      },
      include: { _count: { select: { recipients: true } } },
    });

    return notification;
  }

  // Admin: List notifications (UC-10)
  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách thông báo (UC-10)' })
  async findAll() {
    return this.prisma.notification.findMany({
      include: {
        _count: { select: { recipients: true } },
        recipients: { where: { isRead: true }, select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Admin: Update draft/scheduled notification (UC-10)
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Sửa thông báo nháp (UC-10)' })
  async update(@Param('id') id: string, @Body() dto: Partial<CreateNotificationDto>) {
    const notif = await this.prisma.notification.findUnique({ where: { id } });
    if (!notif) throw new NotFoundException('Không tìm thấy thông báo');
    if (notif.status === 'SENT') throw new BadRequestException('Không thể sửa thông báo đã gửi');

    return this.prisma.notification.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        attachmentUrls: dto.attachmentUrls,
      },
    });
  }

  // Admin: Delete draft/scheduled notification (UC-10)
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa thông báo nháp (UC-10)' })
  async remove(@Param('id') id: string) {
    const notif = await this.prisma.notification.findUnique({ where: { id } });
    if (!notif) throw new NotFoundException('Không tìm thấy thông báo');
    if (notif.status === 'SENT') throw new BadRequestException('Không thể xóa thông báo đã gửi');
    await this.prisma.notification.delete({ where: { id } });
  }

  // Any user: Get my notifications
  @Get('my')
  @ApiOperation({ summary: 'Xem thông báo của tôi' })
  async myNotifications(@CurrentUser('id') userId: string) {
    const recipients = await this.prisma.notificationRecipient.findMany({
      where: { userId, notification: { status: 'SENT' } },
      include: { notification: true },
      orderBy: { createdAt: 'desc' },
    });
    return recipients;
  }

  // Any user: Mark notification as read
  @Patch('read/:recipientId')
  @ApiOperation({ summary: 'Đánh dấu đã đọc thông báo' })
  async markRead(@Param('recipientId') id: string, @CurrentUser('id') userId: string) {
    return this.prisma.notificationRecipient.update({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }
}
