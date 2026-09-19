import { Module } from '@nestjs/common';

import { CategoriasProcessoController } from './categorias-processo.controller';
import { CategoriasProcessoService } from './categorias-processo.service';

@Module({
  controllers: [CategoriasProcessoController],
  providers: [CategoriasProcessoService],
  exports: [CategoriasProcessoService],
})
export class CategoriasProcessoModule {}
