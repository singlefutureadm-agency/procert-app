import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { Roles } from '../../common/decorators/roles.decorator';
import { ModelosTrilhaService } from './modelos-trilha.service';
import {
  CriarVersaoTrilhaDto,
  ReordenarEtapasModeloDto,
  SubstituirEtapasDto,
} from './dto/modelo-trilha.dto';

/**
 * Rotas aninhadas na categoria: as versões só existem no contexto dela.
 * Restrito à equipe, leitura inclusive — acompanha a restrição de
 * `categorias-produto`, de onde estas rotas pendem.
 */
@ApiTags('Modelos de trilha')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.FUNCIONARIO)
@Controller('categorias-produto/:categoriaId/modelos-trilha')
export class ModelosTrilhaCategoriaController {
  constructor(private readonly modelosService: ModelosTrilhaService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as versões de trilha da categoria' })
  listar(@Param('categoriaId', ParseIntPipe) categoriaId: number) {
    return this.modelosService.listarPorCategoria(categoriaId);
  }

  @Post()
  @ApiOperation({
    summary:
      'Cria a próxima versão (copia as etapas da vigente quando o corpo vem vazio) e encerra a anterior',
  })
  criarVersao(
    @Param('categoriaId', ParseIntPipe) categoriaId: number,
    @Body() dto: CriarVersaoTrilhaDto,
  ) {
    return this.modelosService.criarVersao(categoriaId, dto);
  }
}

@ApiTags('Modelos de trilha')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.FUNCIONARIO)
@Controller('modelos-trilha')
export class ModelosTrilhaController {
  constructor(private readonly modelosService: ModelosTrilhaService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Detalha uma versão de trilha com suas etapas' })
  buscar(@Param('id', ParseIntPipe) id: number) {
    return this.modelosService.buscarPorId(id);
  }

  @Patch(':id/etapas')
  @ApiOperation({
    summary: 'Substitui as etapas da versão; 409 se ela já tiver produtos',
  })
  substituirEtapas(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubstituirEtapasDto,
  ) {
    return this.modelosService.substituirEtapas(id, dto);
  }

  @Patch(':id/etapas/ordem')
  @ApiOperation({ summary: 'Reordena as etapas da versão' })
  reordenar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReordenarEtapasModeloDto,
  ) {
    return this.modelosService.reordenarEtapas(id, dto);
  }
}
