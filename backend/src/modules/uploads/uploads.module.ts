import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ARMAZENAMENTO,
  type Armazenamento,
  criarArmazenamento,
} from './uploads.armazenamento';
import { UploadsService } from './uploads.service';

@Global()
@Module({
  providers: [
    {
      provide: ARMAZENAMENTO,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Armazenamento =>
        criarArmazenamento(config),
    },
    UploadsService,
  ],
  // O driver é exportado porque o `bootstrap` precisa dele para decidir o que
  // fazer com `/uploads`: servir do disco ou redirecionar para o storage.
  exports: [UploadsService, ARMAZENAMENTO],
})
export class UploadsModule {}
