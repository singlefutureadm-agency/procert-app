import { Module } from '@nestjs/common';
import { ModelosTrilhaModule } from '../modelos-trilha/modelos-trilha.module';
import { ProdutosController } from './produtos.controller';
import { ProdutosService } from './produtos.service';

@Module({
  // A resolução da versão vigente da trilha vive no módulo de modelos.
  imports: [ModelosTrilhaModule],
  controllers: [ProdutosController],
  providers: [ProdutosService],
  exports: [ProdutosService],
})
export class ProdutosModule {}
