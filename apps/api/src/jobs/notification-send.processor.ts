import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../database/prisma.service';

export const NOTIFICATION_SEND_QUEUE = 'notification-send';

@Injectable()
@Processor(NOTIFICATION_SEND_QUEUE)
export class NotificationSendProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationSendProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing notification job: ${job.name} #${job.id}`);

    const { notificationId } = job.data;

    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      this.logger.warn(`Notification ${notificationId} not found`);
      return;
    }

    if (notification.status === 'SENT') {
      this.logger.warn(`Notification ${notificationId} already sent`);
      return;
    }

    // Resolve target user IDs
    let userIds: string[] = [];

    switch (notification.targetType) {
      case 'ALL':
        const allUsers = await this.prisma.user.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true },
        });
        userIds = allUsers.map(u => u.id);
        break;

      case 'ALL_TEACHERS':
        const teachers = await this.prisma.user.findMany({
          where: { role: 'TEACHER', status: 'ACTIVE' },
          select: { id: true },
        });
        userIds = teachers.map(u => u.id);
        break;

      case 'ALL_STUDENTS':
        const students = await this.prisma.user.findMany({
          where: { role: 'STUDENT', status: 'ACTIVE' },
          select: { id: true },
        });
        userIds = students.map(u => u.id);
        break;

      case 'SPECIFIC_USERS':
        // targetUserIds stored as JSON in the notification model
        userIds = (notification as any).targetUserIds ?? [];
        break;
    }

    if (userIds.length === 0) {
      this.logger.warn(`No recipients for notification ${notificationId}`);
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'SENT', sentAt: new Date() },
      });
      return;
    }

    // Create recipient records
    await this.prisma.notificationRecipient.createMany({
      data: userIds.map(userId => ({
        notificationId,
        userId,
        isRead: false,
      })),
      skipDuplicates: true,
    });

    // Mark as sent
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'SENT', sentAt: new Date() },
    });

    this.logger.log(
      `Notification ${notificationId} sent to ${userIds.length} users`,
    );
  }
}
