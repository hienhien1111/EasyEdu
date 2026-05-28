import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AttendanceCloseProcessor, ATTENDANCE_CLOSE_QUEUE } from './attendance-close.processor';
import { NotificationSendProcessor, NOTIFICATION_SEND_QUEUE } from './notification-send.processor';
import { PaymentRequeryProcessor, PAYMENT_REQUERY_QUEUE } from './payment-requery.processor';
import { PrismaModule } from '../database/prisma.module';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue(
      { name: ATTENDANCE_CLOSE_QUEUE },
      { name: NOTIFICATION_SEND_QUEUE },
      { name: PAYMENT_REQUERY_QUEUE },
    ),
  ],
  providers: [
    AttendanceCloseProcessor,
    NotificationSendProcessor,
    PaymentRequeryProcessor,
  ],
  exports: [BullModule],
})
export class JobsModule {}
