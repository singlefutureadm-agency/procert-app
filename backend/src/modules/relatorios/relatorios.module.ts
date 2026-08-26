import { Module } from '@nestjs/common';

import { RelatoriosController } from './relatorios.controller';
import { RelatorioEquipeService } from './equipe.service';
import { ExportacaoEquipeService } from './exportacao-equipe.service';

@Module({
  controllers: [RelatoriosController],
  providers: [RelatorioEquipeService, ExportacaoEquipeService],
})
export class RelatoriosModule {}
