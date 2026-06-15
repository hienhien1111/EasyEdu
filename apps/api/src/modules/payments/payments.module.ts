import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PayOS } from '@payos/node';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [ConfigModule],
  controllers: [PaymentsController],
  providers: [
    {
      provide: 'PAYOS_CLIENT',
      useFactory: (configService: ConfigService) =>
        new PayOS({
          clientId: configService.get<string>('PAYOS_CLIENT_ID'),
          apiKey: configService.get<string>('PAYOS_API_KEY'),
          checksumKey: configService.get<string>('PAYOS_CHECKSUM_KEY'),
        }),
      inject: [ConfigService],
    },
    PaymentsService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
