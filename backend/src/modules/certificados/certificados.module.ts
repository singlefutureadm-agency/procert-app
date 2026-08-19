import { Module } from '@nestjs/common';

import { CertificadoPdfService } from './certificado-pdf.service';
import {
  CertificadosController,
  CertificadosProdutoController,
} from './certificados.controller';
import { CertificadosService } from './certificados.service';
import { ExpiracaoCertificadosCron } from './expiracao.cron';

@Module({
  controllers: [CertificadosProdutoController, CertificadosController],
  providers: [
    CertificadosService,
    CertificadoPdfService,
    ExpiracaoCertificadosCron,
  ],
  exports: [CertificadosService],
})
export class CertificadosModule {}
