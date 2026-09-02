import { Module } from '@nestjs/common';

import {
  ModelosTrilhaController,
  ModelosTrilhaDaTrilhaController,
} from './modelos-trilha.controller';
import { ModelosTrilhaService } from './modelos-trilha.service';
import { TrilhasController } from './trilhas.controller';
import { TrilhasService } from './trilhas.service';

@Module({
  controllers: [
    TrilhasController,
    ModelosTrilhaDaTrilhaController,
    ModelosTrilhaController,
  ],
  providers: [TrilhasService, ModelosTrilhaService],
  exports: [TrilhasService, ModelosTrilhaService],
})
export class ModelosTrilhaModule {}
