import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';

import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator';
import { CertificadosService } from './certificados.service';
import {
  AlterarStatusCertificadoDto,
  EmitirCertificadoDto,
  ListarCertificadosDto,
} from './dto/certificado.dto';

/** Emissão e consulta no contexto do produto. */
@ApiTags('Certificados')
@ApiBearerAuth()
@Controller('produtos/:produtoId/certificados')
export class CertificadosProdutoController {
  constructor(private readonly certificados: CertificadosService) {}

  @Get()
  @ApiOperation({ summary: 'Lista os certificados de um produto' })
  listar(
    @Param('produtoId', ParseIntPipe) produtoId: number,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.certificados.listarPorProduto(produtoId, usuario);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Emite o certificado (somente ADMIN); exige todas as etapas obrigatórias aprovadas',
  })
  emitir(
    @Param('produtoId', ParseIntPipe) produtoId: number,
    @Body() dto: EmitirCertificadoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.certificados.emitir(produtoId, dto, usuario);
  }
}

@ApiTags('Certificados')
@ApiBearerAuth()
@Controller('certificados')
export class CertificadosController {
  constructor(private readonly certificados: CertificadosService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista os certificados emitidos (o CLIENTE vê só os seus)',
  })
  listar(
    @Query() filtros: ListarCertificadosDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.certificados.listar(filtros, usuario);
  }

  /**
   * Rotina de expiração, para um agendador externo chamar (ex.: cron do
   * sistema). Fica antes de `:id` para não ser capturada pela rota com
   * parâmetro.
   */
  @Post('expirar-vencidos')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Marca como VENCIDO os certificados fora da validade',
  })
  expirarVencidos() {
    return this.certificados.expirarVencidos();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um certificado' })
  buscar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.certificados.buscarPorId(id, usuario);
  }

  @Get(':id/pdf')
  @ApiProduces('application/pdf')
  @Header('Content-Type', 'application/pdf')
  @ApiOperation({
    summary: 'Baixa o PDF do certificado (gerado sob demanda se necessário)',
  })
  async baixarPdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: UsuarioAutenticado,
    @Res() resposta: Response,
  ): Promise<void> {
    const { nome, conteudo } = await this.certificados.obterPdf(id, usuario);

    resposta.setHeader('Content-Disposition', `inline; filename="${nome}"`);
    resposta.send(conteudo);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Suspende, cancela ou reativa; motivo obrigatório ao encerrar',
  })
  alterarStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AlterarStatusCertificadoDto,
  ) {
    return this.certificados.alterarStatus(id, dto);
  }
}
