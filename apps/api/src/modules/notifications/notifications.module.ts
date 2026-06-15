import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NOTIFICATION_SEND_QUEUE } from '../../jobs/notification-send.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: NOTIFICATION_SEND_QUEUE }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
