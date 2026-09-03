import {
  Body,
  Controller,
  Delete,
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
 * Rotas aninhadas na trilha: as versões só existem no contexto dela.
 *
 * Eram aninhadas na CATEGORIA — mudou quando a trilha virou catálogo próprio,
 * reutilizável por várias categorias. Leitura para a equipe; escrita só ADMIN,
 * pela mesma razão de `TrilhasController`.
 */
@ApiTags('Modelos de trilha')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.FUNCIONARIO)
@Controller('trilhas/:trilhaId/modelos-trilha')
export class ModelosTrilhaDaTrilhaController {
  constructor(private readonly modelosService: ModelosTrilhaService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as versões da trilha' })
  listar(@Param('trilhaId', ParseIntPipe) trilhaId: number) {
    return this.modelosService.listarPorTrilha(trilhaId);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Cria a próxima versão (copia as etapas da vigente quando o corpo vem vazio) e encerra a anterior',
  })
  criarVersao(
    @Param('trilhaId', ParseIntPipe) trilhaId: number,
    @Body() dto: CriarVersaoTrilhaDto,
  ) {
    return this.modelosService.criarVersao(trilhaId, dto);
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
  @Roles(Role.ADMIN)
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
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reordena as etapas da versão' })
  reordenar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReordenarEtapasModeloDto,
  ) {
    return this.modelosService.reordenarEtapas(id, dto);
  }

  @Patch(':id/vigente')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Torna esta a versão vigente da trilha, encerrando a anterior',
  })
  definirVigente(@Param('id', ParseIntPipe) id: number) {
    return this.modelosService.definirVigente(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Exclui a versão; 409 se ela tiver produtos ou for a única da trilha',
  })
  remover(@Param('id', ParseIntPipe) id: number) {
    return this.modelosService.removerVersao(id);
  }
}
