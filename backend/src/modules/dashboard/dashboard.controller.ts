import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CurrentUser,
  UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metricas')
  @ApiOperation({
    summary: 'Indicadores do painel, já filtrados pelo perfil do usuário',
  })
  metricas(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.dashboardService.metricas(usuario);
  }
}
