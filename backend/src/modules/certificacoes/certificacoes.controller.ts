import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';

import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator';
import { CertificacoesService } from './certificacoes.service';
import { DocumentosCertificacaoService } from './documentos.service';
import { ExportacaoCertificacaoService } from './exportacao.service';
import { QuadroService } from './quadro.service';
import { MicroEtapasService } from './micro-etapas.service';
import {
  AlternarMicroEtapaDto,
  CancelarProcessoDto,
  ExportarCertificacaoDto,
  ListarCertificacoesDto,
  ListarQuadroDto,
  MoverParaFaseDto,
  SalvarCertificacaoDto,
} from './dto/certificacao.dto';

@ApiTags('Certificações')
@ApiBearerAuth()
@Controller('certificacoes')
export class CertificacoesController {
  constructor(
    private readonly certificacoesService: CertificacoesService,
    private readonly documentos: DocumentosCertificacaoService,
    private readonly exportacao: ExportacaoCertificacaoService,
    private readonly quadroService: QuadroService,
    private readonly microEtapas: MicroEtapasService,
  ) {}

  /**
   * Exporta o acompanhamento de um processo para planilha.
   *
   * Reaproveita `detalharPorProcesso`, que é onde o escopo do CLIENTE já é verificado —
   * uma segunda consulta aqui seria uma segunda chance de esquecer a checagem.
   */
  @Get('processo/:processoId/exportacao')
  @ApiOperation({
    summary: 'Exporta o acompanhamento em XLSX (abas) ou CSV (seções)',
  })
  async exportar(
    @Param('processoId', ParseIntPipe) processoId: number,
    @Query() filtros: ExportarCertificacaoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
    @Res() resposta: Response,
  ): Promise<void> {
    const detalhe = await this.certificacoesService.detalharPorProcesso(
      processoId,
      usuario,
    );

    const formato = filtros.formato ?? 'xlsx';
    const nome = this.exportacao.nomeArquivo(detalhe, formato);

    // `attachment` e não `inline`: planilha não se lê no navegador, e o Chrome
    // abriria o XLSX como download de qualquer jeito — o CSV é que viraria uma
    // parede de texto na aba se ficasse inline.
    resposta.setHeader('Content-Disposition', `attachment; filename="${nome}"`);

    if (formato === 'csv') {
      resposta.setHeader('Content-Type', 'text/csv; charset=utf-8');
      resposta.send(this.exportacao.csv(detalhe, usuario.nome));
      return;
    }

    resposta.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    resposta.send(await this.exportacao.xlsx(detalhe, usuario.nome));
  }

  @Get()
  @ApiOperation({
    summary: 'Painel consolidado (clientes veem apenas os próprios processos)',
  })
  listar(
    @Query() filtros: ListarCertificacoesDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.certificacoesService.listarPainel(filtros, usuario);
  }

  /**
   * Quadro de processos por fase do pipeline.
   *
   * **Visão interna: o CLIENTE não alcança.** A divisão por fase e por
   * departamento é organização da operação, na mesma linha do catálogo de
   * trilhas — o cliente continua com `GET /certificacoes` e a timeline do
   * próprio processo. O service repete a checagem.
   */
  @Get('quadro')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({
    summary: 'Quadro de processos por fase (visão da equipe)',
    description:
      'Colunas na ordem do pipeline, cada uma com a contagem real e um ' +
      'recorte de cartões. A fase é derivada da etapa atual, nunca armazenada.',
  })
  quadro(
    @Query() filtros: ListarQuadroDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.quadroService.listar(filtros, usuario);
  }

  /**
   * Marca ou desmarca um item do checklist da etapa.
   *
   * O `id` é da microetapa DO PROCESSO (`MicroEtapaCertificacao`), não do
   * catálogo: o que se marca é a cópia, nunca a definição da trilha.
   */
  @Patch('micro-etapas/:id')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({
    summary: 'Marca/desmarca uma microetapa; pode aprovar a etapa',
    description:
      'Concluir a última microetapa aprova a etapa quando o processo está em ' +
      'aprovação automática. A resposta traz `etapaAprovada` e, quando não ' +
      'aprovou, o `aviso` com o motivo.',
  })
  alternarMicroEtapa(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AlternarMicroEtapaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.microEtapas.alternar(id, dto.concluida, usuario);
  }

  @Get('processo/:processoId')
  @ApiOperation({ summary: 'Timeline completa do processo, com histórico' })
  detalhar(
    @Param('processoId', ParseIntPipe) processoId: number,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.certificacoesService.detalharPorProcesso(processoId, usuario);
  }

  @Put('processo/:processoId')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({ summary: 'Salva as etapas em lote e registra o histórico' })
  salvar(
    @Param('processoId', ParseIntPipe) processoId: number,
    @Body() dto: SalvarCertificacaoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.certificacoesService.salvar(processoId, dto, usuario);
  }

  @Get('processo/:processoId/versao-trilha')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({
    summary:
      'Informa se o processo está preso a uma versão antiga da trilha e o que a migração faria',
  })
  verificarVersao(@Param('processoId', ParseIntPipe) processoId: number) {
    return this.certificacoesService.verificarVersaoTrilha(processoId);
  }

  @Post('processo/:processoId/migrar-versao-trilha')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({
    summary:
      'Migra o processo para a versão vigente da trilha, adicionando só as etapas ausentes',
  })
  migrarVersao(
    @Param('processoId', ParseIntPipe) processoId: number,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.certificacoesService.migrarParaVersaoVigente(processoId, usuario);
  }

  /**
   * Destino do arrastar-e-soltar no quadro. Escreve ETAPA, não posição.
   *
   * A coluna continua derivada: o que muda é o estado da etapa, e o cartão vai
   * para a fase de destino porque o processo foi mesmo para lá.
   */
  @Post('processo/:processoId/mover-fase')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({
    summary: 'Move o processo para uma fase do pipeline',
    description:
      'Marca como EM_ANDAMENTO a primeira etapa não aprovada da fase e devolve ' +
      'à fila as que estavam em andamento antes dela. Não aprova nada.',
  })
  moverParaFase(
    @Param('processoId', ParseIntPipe) processoId: number,
    @Body() dto: MoverParaFaseDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.certificacoesService.moverParaFase(processoId, dto.fase, usuario);
  }

  /**
   * Interrompe o processo. As etapas ficam como estão.
   *
   * Não é excluir nem desativar o processo: o cartão sai do fluxo e vai para a
   * coluna CANCELADO do quadro, com motivo e autoria.
   */
  @Post('processo/:processoId/cancelar')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({ summary: 'Cancela o processo, com motivo e autoria' })
  cancelar(
    @Param('processoId', ParseIntPipe) processoId: number,
    @Body() dto: CancelarProcessoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.certificacoesService.cancelar(processoId, dto.motivo, usuario);
  }

  @Post('processo/:processoId/reabrir')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({
    summary: 'Devolve ao fluxo um processo cancelado',
    description:
      'A coluna volta a ser derivada da etapa atual — não há "voltar para ' +
      'onde estava", porque nunca se gravou onde estava.',
  })
  reabrir(@Param('processoId', ParseIntPipe) processoId: number) {
    return this.certificacoesService.reabrir(processoId);
  }

  @Post('processo/:processoId/reiniciar')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reinicia a certificação do zero (apaga o histórico)' })
  reiniciar(@Param('processoId', ParseIntPipe) processoId: number) {
    return this.certificacoesService.reiniciar(processoId);
  }

  /** `etapaId` é o id da linha de certificação (processo × etapa) da timeline. */
  @Post('processo/:processoId/etapas/:etapaId/documento')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @UseInterceptors(FileInterceptor('documento'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Anexa uma evidência à etapa (PDF, planilha ou imagem)',
  })
  anexarDocumento(
    @Param('processoId', ParseIntPipe) processoId: number,
    @Param('etapaId', ParseIntPipe) etapaId: number,
    @UploadedFile() arquivo: Express.Multer.File,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.documentos.anexar(processoId, etapaId, arquivo, usuario);
  }

  @Get('documentos/:id/arquivo')
  @ApiOperation({
    summary: 'Baixa a evidência anexada (respeita o escopo do CLIENTE)',
  })
  async baixarDocumento(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: UsuarioAutenticado,
    @Res() resposta: Response,
  ): Promise<void> {
    const { nome, tipo, conteudo } = await this.documentos.baixar(id, usuario);

    resposta.setHeader('Content-Type', tipo);
    // `attachment` evita que um SVG/HTML anexado execute no domínio da API.
    resposta.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(nome)}"`,
    );
    resposta.send(conteudo);
  }
}
