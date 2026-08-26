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
import { ComparativosService } from './comparativos.service';
import { ExportacaoComparativosService } from './exportacao-comparativos.service';
import {
  ExportarComparativoClientesDto,
  ExportarComparativoProdutosDto,
  ExportarRelatorioDto,
  ListarComparativoClientesDto,
  ListarComparativoProdutosDto,
  ListarRelatorioEquipeDto,
} from './dto/relatorios.dto';

const TIPO_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Relatórios de gestão.
 *
 * Módulo interno: `@Roles(ADMIN, FUNCIONARIO)` na classe, e o desempenho da
 * equipe sobrescreve para ADMIN. Nenhuma rota daqui é alcançável por um
 * CLIENTE hoje.
 *
 * Ainda assim `ComparativosService` aplica o escopo do CLIENTE nas duas
 * consultas — defesa em profundidade, pelo mesmo motivo do middleware de
 * `/uploads`: é redundante enquanto estes `@Roles` estiverem como estão, e
 * existe para que relaxá-los um dia não vire um cliente lendo o comparativo de
 * outro, que foi exatamente o IDOR corrigido na migração do legado.
 */
@ApiTags('Relatórios')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.FUNCIONARIO)
@Controller('relatorios')
export class RelatoriosController {
  constructor(
    private readonly equipe: RelatorioEquipeService,
    private readonly exportacao: ExportacaoEquipeService,
    private readonly comparativos: ComparativosService,
    private readonly exportacaoComparativos: ExportacaoComparativosService,
  ) {}

  /** Cabeçalhos de download comuns às exportações dos comparativos. */
  private prepararDownload(
    resposta: Response,
    nome: string,
    formato: 'xlsx' | 'csv',
  ): void {
    resposta.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    resposta.setHeader(
      'Content-Type',
      formato === 'csv' ? 'text/csv; charset=utf-8' : TIPO_XLSX,
    );
  }

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
  // ------------------------------------------------------- comparativos
  //
  // Sem `@Roles` próprio: valem ADMIN e FUNCIONARIO, da classe. São dados
  // operacionais que a equipe usa para trabalhar, diferente do desempenho da
  // equipe acima. O service ainda assim aplica o escopo do CLIENTE — defesa em
  // profundidade, para relaxar este `@Roles` um dia não virar vazamento.

  @Get('produtos')
  @ApiOperation({
    summary: 'Comparativo de avanço por produto, paginado e ordenável',
  })
  comparativoProdutos(
    @Query() filtros: ListarComparativoProdutosDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.comparativos.produtos(filtros, usuario);
  }

  @Get('produtos/exportacao')
  @ApiOperation({ summary: 'Exporta o comparativo de produtos em XLSX ou CSV' })
  async exportarProdutos(
    @Query() filtros: ExportarComparativoProdutosDto,
    @CurrentUser() usuario: UsuarioAutenticado,
    @Res() resposta: Response,
  ): Promise<void> {
    const linhas = await this.comparativos.produtosParaExportacao(
      filtros as ListarComparativoProdutosDto,
      usuario,
    );

    const formato = filtros.formato ?? 'xlsx';
    this.prepararDownload(
      resposta,
      this.exportacaoComparativos.nomeArquivo('produtos', formato),
      formato,
    );

    resposta.send(
      formato === 'csv'
        ? this.exportacaoComparativos.produtosCsv(linhas, usuario.nome)
        : await this.exportacaoComparativos.produtosXlsx(linhas, usuario.nome),
    );
  }

  @Get('clientes')
  @ApiOperation({
    summary: 'Comparativo de clientes: produtos, certificados e NCs abertas',
  })
  comparativoClientes(
    @Query() filtros: ListarComparativoClientesDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.comparativos.clientes(filtros, usuario);
  }

  @Get('clientes/exportacao')
  @ApiOperation({ summary: 'Exporta o comparativo de clientes em XLSX ou CSV' })
  async exportarClientes(
    @Query() filtros: ExportarComparativoClientesDto,
    @CurrentUser() usuario: UsuarioAutenticado,
    @Res() resposta: Response,
  ): Promise<void> {
    const linhas = await this.comparativos.clientesParaExportacao(
      filtros as ListarComparativoClientesDto,
      usuario,
    );

    const formato = filtros.formato ?? 'xlsx';
    this.prepararDownload(
      resposta,
      this.exportacaoComparativos.nomeArquivo('clientes', formato),
      formato,
    );

    resposta.send(
      formato === 'csv'
        ? this.exportacaoComparativos.clientesCsv(linhas, usuario.nome)
        : await this.exportacaoComparativos.clientesXlsx(linhas, usuario.nome),
    );
  }

}
