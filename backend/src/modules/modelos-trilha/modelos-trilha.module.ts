import { Module } from '@nestjs/common';

import {
  ModelosTrilhaCategoriaController,
  ModelosTrilhaController,
} from './modelos-trilha.controller';
import { ModelosTrilhaService } from './modelos-trilha.service';

@Module({
  controllers: [ModelosTrilhaCategoriaController, ModelosTrilhaController],
  providers: [ModelosTrilhaService],
  exports: [ModelosTrilhaService],
})
export class ModelosTrilhaModule {}
