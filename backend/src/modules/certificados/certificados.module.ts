import { Module } from '@nestjs/common';

import { CertificadoPdfService } from './certificado-pdf.service';
import {
  CertificadosController,
  CertificadosProdutoController,
} from './certificados.controller';
import { CertificadosService } from './certificados.service';
import { ExpiracaoCertificadosCron } from './expiracao.cron';
import { ExpiracaoCronController } from './expiracao.cron.controller';

@Module({
  // `ExpiracaoCronController` antes de `CertificadosController`: o segundo tem
  // `@Get(':id')`, e é mais claro registrar a rota específica primeiro do que
  // depender de o Nest distinguir `certificados/cron/...` de `certificados/:id`
  // pelo número de segmentos.
  controllers: [
    CertificadosProdutoController,
    ExpiracaoCronController,
    CertificadosController,
  ],
  providers: [
    CertificadosService,
    CertificadoPdfService,
    ExpiracaoCertificadosCron,
  ],
  exports: [CertificadosService],
})
export class CertificadosModule {}
