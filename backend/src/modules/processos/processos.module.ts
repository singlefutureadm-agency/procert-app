import { Module } from '@nestjs/common';
import { ModelosTrilhaModule } from '../modelos-trilha/modelos-trilha.module';
import { ProcessosController } from './processos.controller';
import { ProcessosService } from './processos.service';

@Module({
  // A resolução da versão vigente da trilha vive no módulo de modelos.
  imports: [ModelosTrilhaModule],
  controllers: [ProcessosController],
  providers: [ProcessosService],
  exports: [ProcessosService],
})
export class ProcessosModule {}
