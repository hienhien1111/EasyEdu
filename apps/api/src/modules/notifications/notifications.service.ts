import {
  Injectable, NotFoundException, BadRequestException, Logger, OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { NotificationTargetType } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import { NOTIFICATION_SEND_QUEUE } from '../../jobs/notification-send.processor';

export interface CreateNotificationInput {
  title: string;
  content: string;
  targetType: NotificationTargetType;
  specificUserIds?: string[];
  attachmentUrls?: string[];
  scheduledAt?: string;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue(NOTIFICATION_SEND_QUEUE)
    private readonly notificationQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.restoreScheduledNotifications();
  }

  async create(dto: CreateNotificationInput, adminId: string) {
    const scheduleTime = this.validateScheduledAt(dto.scheduledAt);

    // Determine recipients
    let userIds: string[] = [];
    if (dto.targetType === 'SPECIFIC_USERS' && dto.specificUserIds) {
      userIds = dto.specificUserIds;
    } else {
      const whereClause: any = {};
      if (dto.targetType === 'ALL_STUDENTS') whereClause.role = 'STUDENT';
      else if (dto.targetType === 'ALL_TEACHERS') whereClause.role = 'TEACHER';

      const users = await this.prisma.user.findMany({
        where: dto.targetType === 'ALL' ? {} : whereClause,
        select: { id: true },
      });
      userIds = users.map((u) => u.id);
    }

    const status = scheduleTime ? 'SCHEDULED' : 'SENT';
    const sentAt = scheduleTime ? null : new Date();

    const notification = await this.prisma.notification.create({
      data: {
        creatorId: adminId,
        title: dto.title,
        content: dto.content,
        targetType: dto.targetType,
        attachmentUrls: dto.attachmentUrls || [],
        status,
        scheduledAt: scheduleTime,
        sentAt,
        recipients: {
          create: userIds.map((userId) => ({ userId })),
        },
      },
      include: { _count: { select: { recipients: true } } },
    });

    if (scheduleTime) {
      try {
        await this.scheduleNotificationJob(notification.id, scheduleTime);
      } catch (err) {
        await this.prisma.notification.delete({ where: { id: notification.id } }).catch(() => undefined);
        this.logger.error(`Failed to schedule notification ${notification.id}: ${err}`);
        throw new BadRequestException('Không thể hẹn giờ gửi thông báo. Vui lòng kiểm tra Redis/queue.');
      }
    }

    return notification;
  }

  async findAll() {
    return this.prisma.notification.findMany({
      include: {
        _count: { select: { recipients: true } },
        recipients: { where: { isRead: true }, select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, dto: Partial<CreateNotificationInput>) {
    const notif = await this.prisma.notification.findUnique({ where: { id } });
    if (!notif) throw new NotFoundException('Không tìm thấy thông báo');
    if (notif.status === 'SENT') throw new BadRequestException('Không thể sửa thông báo đã gửi');

    const scheduleTime = this.validateScheduledAt(dto.scheduledAt);

    const notification = await this.prisma.notification.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
        scheduledAt: scheduleTime ?? undefined,
        status: scheduleTime ? 'SCHEDULED' : undefined,
        attachmentUrls: dto.attachmentUrls,
      },
    });

    if (scheduleTime) {
      await this.scheduleNotificationJob(id, scheduleTime);
    }

    return notification;
  }

  async remove(id: string) {
    const notif = await this.prisma.notification.findUnique({ where: { id } });
    if (!notif) throw new NotFoundException('Không tìm thấy thông báo');
    if (notif.status === 'SENT') throw new BadRequestException('Không thể xóa thông báo đã gửi');
    await this.removeScheduledJob(id);
    await this.prisma.notification.delete({ where: { id } });
  }

  async myNotifications(userId: string) {
    return this.prisma.notificationRecipient.findMany({
      where: { userId, notification: { status: 'SENT' } },
      include: { notification: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notificationRecipient.update({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  private validateScheduledAt(scheduledAt?: string): Date | null {
    if (!scheduledAt) return null;

    const scheduleTime = new Date(scheduledAt);
    if (Number.isNaN(scheduleTime.getTime())) {
      throw new BadRequestException('Thời gian hẹn gửi không hợp lệ');
    }

    if (scheduleTime.getTime() - Date.now() < 5 * 60 * 1000) {
      throw new BadRequestException('Thời gian hẹn gửi phải lớn hơn thời gian hiện tại ít nhất 5 phút');
    }

    return scheduleTime;
  }

  private async scheduleNotificationJob(notificationId: string, scheduledAt: Date) {
    const delay = Math.max(0, scheduledAt.getTime() - Date.now());
    const jobId = this.getScheduledJobId(notificationId);

    await this.removeScheduledJob(notificationId);
    await this.notificationQueue.add(
      'send-scheduled-notification',
      { notificationId },
      {
        jobId,
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  private async removeScheduledJob(notificationId: string) {
    const job = await this.notificationQueue.getJob(this.getScheduledJobId(notificationId));
    await job?.remove();
  }

  private getScheduledJobId(notificationId: string) {
    return `notification-${notificationId}`;
  }

  private async restoreScheduledNotifications() {
    const notifications = await this.prisma.notification.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { not: null },
      },
      select: { id: true, scheduledAt: true },
    });

    for (const notification of notifications) {
      if (!notification.scheduledAt) continue;
      try {
        await this.scheduleNotificationJob(notification.id, notification.scheduledAt);
      } catch (err) {
        this.logger.warn(`Could not restore scheduled notification ${notification.id}: ${err}`);
      }
    }

    if (notifications.length > 0) {
      this.logger.log(`Restored ${notifications.length} scheduled notification job(s)`);
    }
  }
}
