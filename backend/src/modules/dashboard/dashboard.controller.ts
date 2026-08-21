import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CurrentUser,
  UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { GraficosService } from './graficos.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly graficos: GraficosService,
  ) {}

  @Get('metricas')
  @ApiOperation({
    summary: 'Indicadores do painel, já filtrados pelo perfil do usuário',
  })
  metricas(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.dashboardService.metricas(usuario);
  }

  @Get('graficos')
  @ApiOperation({
    summary:
      'Agregados dos gráficos de Acompanhamento, Certificados e NCs (o CLIENTE vê só os seus)',
  })
  graficosDoPainel(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.graficos.dados(usuario);
  }
}
