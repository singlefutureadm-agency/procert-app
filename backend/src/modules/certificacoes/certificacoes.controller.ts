import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import {
  ListarCertificacoesDto,
  SalvarCertificacaoDto,
} from './dto/certificacao.dto';

@ApiTags('Certificações')
@ApiBearerAuth()
@Controller('certificacoes')
export class CertificacoesController {
  constructor(
    private readonly certificacoesService: CertificacoesService,
    private readonly documentos: DocumentosCertificacaoService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Painel consolidado (clientes veem apenas os próprios produtos)',
  })
  listar(
    @Query() filtros: ListarCertificacoesDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.certificacoesService.listarPainel(filtros, usuario);
  }

  @Get('produto/:produtoId')
  @ApiOperation({ summary: 'Timeline completa do produto, com histórico' })
  detalhar(
    @Param('produtoId', ParseIntPipe) produtoId: number,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.certificacoesService.detalharPorProduto(produtoId, usuario);
  }

  @Put('produto/:produtoId')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({ summary: 'Salva as etapas em lote e registra o histórico' })
  salvar(
    @Param('produtoId', ParseIntPipe) produtoId: number,
    @Body() dto: SalvarCertificacaoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.certificacoesService.salvar(produtoId, dto, usuario);
  }

  @Get('produto/:produtoId/versao-trilha')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({
    summary:
      'Informa se o produto está preso a uma versão antiga da trilha e o que a migração faria',
  })
  verificarVersao(@Param('produtoId', ParseIntPipe) produtoId: number) {
    return this.certificacoesService.verificarVersaoTrilha(produtoId);
  }

  @Post('produto/:produtoId/migrar-versao-trilha')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({
    summary:
      'Migra o produto para a versão vigente da trilha, adicionando só as etapas ausentes',
  })
  migrarVersao(
    @Param('produtoId', ParseIntPipe) produtoId: number,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.certificacoesService.migrarParaVersaoVigente(produtoId, usuario);
  }

  @Post('produto/:produtoId/reiniciar')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reinicia a certificação do zero (apaga o histórico)' })
  reiniciar(@Param('produtoId', ParseIntPipe) produtoId: number) {
    return this.certificacoesService.reiniciar(produtoId);
  }

  /** `etapaId` é o id da linha de certificação (produto × etapa) da timeline. */
  @Post('produto/:produtoId/etapas/:etapaId/documento')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @UseInterceptors(FileInterceptor('documento'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Anexa uma evidência à etapa (PDF, planilha ou imagem)',
  })
  anexarDocumento(
    @Param('produtoId', ParseIntPipe) produtoId: number,
    @Param('etapaId', ParseIntPipe) etapaId: number,
    @UploadedFile() arquivo: Express.Multer.File,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.documentos.anexar(produtoId, etapaId, arquivo, usuario);
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
