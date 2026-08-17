import { Module } from '@nestjs/common';

import { AparenciaController } from './aparencia.controller';
import { AparenciaService } from './aparencia.service';

@Module({
  controllers: [AparenciaController],
  providers: [AparenciaService],
})
export class AparenciaModule {}
