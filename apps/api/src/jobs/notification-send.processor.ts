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
      include: {
        _count: { select: { recipients: true } },
      },
    });

    if (!notification) {
      this.logger.warn(`Notification ${notificationId} not found`);
      return;
    }

    if (notification.status === 'SENT') {
      this.logger.warn(`Notification ${notificationId} already sent`);
      return;
    }

    let recipientCount = notification._count.recipients;

    if (recipientCount === 0) {
      const userIds = await this.resolveTargetUserIds(notification.targetType);
      if (userIds.length > 0) {
        await this.prisma.notificationRecipient.createMany({
          data: userIds.map(userId => ({
            notificationId,
            userId,
            isRead: false,
          })),
          skipDuplicates: true,
        });
        recipientCount = userIds.length;
      }
    }

    if (recipientCount === 0) {
      this.logger.warn(`No recipients for notification ${notificationId}`);
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'SENT', sentAt: new Date() },
      });
      return;
    }

    // Mark as sent
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'SENT', sentAt: new Date() },
    });

    this.logger.log(
      `Notification ${notificationId} sent to ${recipientCount} users`,
    );
  }

  private async resolveTargetUserIds(targetType: string): Promise<string[]> {
    const where: any = { status: 'ACTIVE' };

    if (targetType === 'ALL_TEACHERS') where.role = 'TEACHER';
    if (targetType === 'ALL_STUDENTS') where.role = 'STUDENT';
    if (targetType === 'SPECIFIC_USERS') return [];

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true },
    });

    return users.map(u => u.id);
  }
}
