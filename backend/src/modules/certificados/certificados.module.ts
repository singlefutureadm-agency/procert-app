import { Module } from '@nestjs/common';

import { CertificadoPdfService } from './certificado-pdf.service';
import {
  CertificadosController,
  CertificadosProdutoController,
} from './certificados.controller';
import { CertificadosService } from './certificados.service';

@Module({
  controllers: [CertificadosProdutoController, CertificadosController],
  providers: [CertificadosService, CertificadoPdfService],
  exports: [CertificadosService],
})
export class CertificadosModule {}
