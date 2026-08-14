import { Module } from '@nestjs/common';

import {
  NaoConformidadesCertificacaoController,
  NaoConformidadesController,
} from './nao-conformidades.controller';
import { NaoConformidadesService } from './nao-conformidades.service';

@Module({
  controllers: [
    NaoConformidadesCertificacaoController,
    NaoConformidadesController,
  ],
  providers: [NaoConformidadesService],
  // Exportado para o módulo de certificações abrir NC na mesma transação da
  // reprovação da etapa.
  exports: [NaoConformidadesService],
})
export class NaoConformidadesModule {}
