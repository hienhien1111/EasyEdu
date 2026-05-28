import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../database/prisma.service';

export const PAYMENT_REQUERY_QUEUE = 'payment-requery';

@Injectable()
@Processor(PAYMENT_REQUERY_QUEUE)
export class PaymentRequeryProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentRequeryProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing payment re-query job: ${job.name} #${job.id}`);

    const { paymentId, inquiryId } = job.data;

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      this.logger.warn(`Payment ${paymentId} not found`);
      return;
    }

    if (payment.status === 'SUCCESS') {
      this.logger.log(`Payment ${paymentId} already SUCCESS — closing inquiry`);
      await this.prisma.paymentInquiry.update({
        where: { id: inquiryId },
        data: { approvedAt: new Date(), approvedBy: 'AUTO_REQUERY' },
      });
      return;
    }

    try {
      // TODO: Call actual bank API (VietQR / PayOS) to re-query transaction status
      // const bankResult = await bankApiClient.checkTransaction(payment.transactionRef);
      // Simulated response for demo:
      const bankResult = {
        status: 'PENDING', // In production: 'SUCCESS' | 'FAILED' | 'PENDING'
        message: 'Transaction still pending',
      };

      await this.prisma.paymentInquiry.update({
        where: { id: inquiryId },
        data: {
          requeryCount: { increment: 1 },
          lastRequeryAt: new Date(),
          lastResponseRaw: { message: bankResult.message } as any,
        },
      });

      if (bankResult.status === 'SUCCESS') {
        await this.prisma.payment.update({
          where: { id: paymentId },
          data: { status: 'SUCCESS' },
        });

        // Update invoice paid amount
        const currentPayment = await this.prisma.payment.findUnique({
          where: { id: paymentId },
          select: { invoiceId: true, amount: true },
        });
        if (currentPayment) {
          await this.prisma.invoice.update({
            where: { id: currentPayment.invoiceId },
            data: { paidAmount: { increment: currentPayment.amount } },
          });
        }

        this.logger.log(`Payment ${paymentId} confirmed SUCCESS via re-query`);
      } else if (bankResult.status === 'FAILED') {
        await this.prisma.payment.update({
          where: { id: paymentId },
          data: { status: 'FAILED' },
        });
        this.logger.log(`Payment ${paymentId} confirmed FAILED via re-query`);
      } else {
        this.logger.log(`Payment ${paymentId} still PENDING after re-query`);
      }
    } catch (err) {
      this.logger.error(`Re-query failed for payment ${paymentId}: ${err}`);
      await this.prisma.paymentInquiry.update({
        where: { id: inquiryId },
        data: {
          requeryCount: { increment: 1 },
          lastRequeryAt: new Date(),
          lastResponseRaw: { error: String(err) } as any,
        },
      });
    }
  }
}
