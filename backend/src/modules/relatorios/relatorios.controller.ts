import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';

import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator';
import { RelatorioEquipeService } from './equipe.service';
import { ExportacaoEquipeService } from './exportacao-equipe.service';
import {
  ExportarRelatorioDto,
  ListarRelatorioEquipeDto,
} from './dto/relatorios.dto';

const TIPO_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Relatórios de gestão.
 *
 * Módulo interno: `@Roles(ADMIN, FUNCIONARIO)` na classe inteira. Nenhuma rota
 * daqui devolve dado de um cliente específico para o próprio cliente — quando
 * isso mudar (relatórios de produtos e de clientes, nos PRs seguintes), cada
 * consulta terá de replicar o `escopoCliente` dos demais services.
 */
@ApiTags('Relatórios')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.FUNCIONARIO)
@Controller('relatorios')
export class RelatoriosController {
  constructor(
    private readonly equipe: RelatorioEquipeService,
    private readonly exportacao: ExportacaoEquipeService,
  ) {}

  /*
   * ADMIN apenas, sobrescrevendo o `@Roles` da classe (o `RolesGuard` usa
   * `getAllAndOverride`, então o handler vence). É informação de gestão sobre
   * a produtividade de colegas — não é dado operacional que todo funcionário
   * precise para trabalhar. Os relatórios de produtos e clientes, que são
   * operacionais, ficam com o papel da classe.
   */
  @Get('equipe')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Desempenho da equipe. O período recorta a ATIVIDADE; a carteira é retrato de agora.',
  })
  listarEquipe(@Query() filtros: ListarRelatorioEquipeDto) {
    return this.equipe.listar(filtros);
  }

  /**
   * Exporta o relatório de equipe.
   *
   * Período obrigatório e teto de linhas ficam no service — é lá que a consulta
   * acontece, e validar aqui seria uma segunda chance de esquecer.
   */
  @Get('equipe/exportacao')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Exporta o desempenho da equipe em XLSX ou CSV' })
  async exportarEquipe(
    @Query() filtros: ExportarRelatorioDto,
    @CurrentUser() usuario: UsuarioAutenticado,
    @Res() resposta: Response,
  ): Promise<void> {
    const linhas = await this.equipe.paraExportacao(filtros.de, filtros.ate);
    const periodo = { de: filtros.de, ate: filtros.ate };
    const formato = filtros.formato ?? 'xlsx';
    const nome = this.exportacao.nomeArquivo(periodo, formato);

    resposta.setHeader('Content-Disposition', `attachment; filename="${nome}"`);

    if (formato === 'csv') {
      resposta.setHeader('Content-Type', 'text/csv; charset=utf-8');
      resposta.send(this.exportacao.csv(linhas, periodo, usuario.nome));
      return;
    }

    resposta.setHeader('Content-Type', TIPO_XLSX);
    resposta.send(await this.exportacao.xlsx(linhas, periodo, usuario.nome));
  }
}
