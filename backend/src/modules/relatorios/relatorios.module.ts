import { Module } from '@nestjs/common';

import { RelatoriosController } from './relatorios.controller';
import { RelatorioEquipeService } from './equipe.service';
import { ExportacaoEquipeService } from './exportacao-equipe.service';
import { ComparativosService } from './comparativos.service';
import { ExportacaoComparativosService } from './exportacao-comparativos.service';
import { CicloService } from './ciclo.service';
import { ExportacaoCicloService } from './exportacao-ciclo.service';

@Module({
  controllers: [RelatoriosController],
  providers: [
    RelatorioEquipeService,
    ExportacaoEquipeService,
    ComparativosService,
    ExportacaoComparativosService,
    CicloService,
    ExportacaoCicloService,
  ],
})
export class RelatoriosModule {}
