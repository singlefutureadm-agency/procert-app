import { Module } from '@nestjs/common';
import { NaoConformidadesModule } from '../nao-conformidades/nao-conformidades.module';
import { CertificacoesController } from './certificacoes.controller';
import { CertificacoesService } from './certificacoes.service';
import { DocumentosCertificacaoService } from './documentos.service';
import { ExportacaoCertificacaoService } from './exportacao.service';
import { QuadroService } from './quadro.service';
import { MicroEtapasService } from './micro-etapas.service';

@Module({
  // Reprovar uma etapa pode abrir a NC no mesmo commit.
  imports: [NaoConformidadesModule],
  controllers: [CertificacoesController],
  providers: [
    CertificacoesService,
    DocumentosCertificacaoService,
    ExportacaoCertificacaoService,
    QuadroService,
    MicroEtapasService,
  ],
  exports: [CertificacoesService],
})
export class CertificacoesModule {}
