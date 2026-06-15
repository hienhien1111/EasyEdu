import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole, NotificationTargetType } from '@prisma/client';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

class CreateNotificationDto {
  @ApiProperty() @IsNotEmpty() @IsString() title: string;
  @ApiProperty() @IsNotEmpty() @IsString() content: string;
  @ApiProperty({ enum: NotificationTargetType }) @IsEnum(NotificationTargetType) targetType: NotificationTargetType;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() specificUserIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() attachmentUrls?: string[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string;
}

@ApiTags('Notifications - Thông báo')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo và gửi thông báo (UC-10)' })
  async create(@Body() dto: CreateNotificationDto, @CurrentUser('id') adminId: string) {
    return this.notificationsService.create(dto, adminId);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách thông báo (UC-10)' })
  async findAll() {
    return this.notificationsService.findAll();
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Sửa thông báo nháp (UC-10)' })
  async update(@Param('id') id: string, @Body() dto: Partial<CreateNotificationDto>) {
    return this.notificationsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa thông báo nháp (UC-10)' })
  async remove(@Param('id') id: string) {
    return this.notificationsService.remove(id);
  }

  @Get('my')
  @ApiOperation({ summary: 'Xem thông báo của tôi' })
  async myNotifications(@CurrentUser('id') userId: string) {
    return this.notificationsService.myNotifications(userId);
  }

  @Patch('read/:recipientId')
  @ApiOperation({ summary: 'Đánh dấu đã đọc thông báo' })
  async markRead(@Param('recipientId') id: string, @CurrentUser('id') userId: string) {
    return this.notificationsService.markRead(id, userId);
  }
}
