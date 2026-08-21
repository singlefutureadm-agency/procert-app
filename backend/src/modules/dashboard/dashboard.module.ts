import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { GraficosService } from './graficos.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, GraficosService],
})
export class DashboardModule {}
