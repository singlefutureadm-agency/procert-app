import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { Roles } from '../../common/decorators/roles.decorator';
import { TrilhasService } from './trilhas.service';
import {
  AlterarStatusTrilhaDto,
  AtualizarTrilhaDto,
  CriarTrilhaDto,
  DuplicarTrilhaDto,
  ListarTrilhasDto,
  VincularCategoriasDto,
} from './dto/trilha.dto';

/**
 * Catálogo de trilhas. Restrito à equipe, leitura inclusive — acompanha
 * `categorias-produto`, de onde o vínculo parte.
 *
 * Escrita é só de ADMIN: uma trilha alterada muda o processo de avaliação de
 * toda categoria vinculada a ela, o que é decisão de gestão, não de operação.
 */
@ApiTags('Trilhas')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.FUNCIONARIO)
@Controller('trilhas')
export class TrilhasController {
  constructor(private readonly trilhasService: TrilhasService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as trilhas do catálogo' })
  listar(@Query() filtros: ListarTrilhasDto) {
    return this.trilhasService.listar(filtros);
  }

  @Get('resumo')
  @ApiOperation({ summary: 'Lista enxuta para o select de vínculo na categoria' })
  resumo() {
    return this.trilhasService.listarResumido();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha a trilha com versões e categorias vinculadas' })
  buscar(@Param('id', ParseIntPipe) id: number) {
    return this.trilhasService.buscarPorId(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Cria uma trilha (com a versão 1, quando o corpo traz etapas)',
  })
  criar(@Body() dto: CriarTrilhaDto) {
    return this.trilhasService.criar(dto);
  }

  @Post(':id/duplicar')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Copia a trilha como v1 de uma trilha nova' })
  duplicar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DuplicarTrilhaDto,
  ) {
    return this.trilhasService.duplicar(id, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Renomeia ou redescreve a trilha' })
  atualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AtualizarTrilhaDto,
  ) {
    return this.trilhasService.atualizar(id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ativa ou desativa a trilha; 409 se houver categoria vinculada' })
  alterarStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AlterarStatusTrilhaDto,
  ) {
    return this.trilhasService.alterarStatus(id, dto.status);
  }

  @Patch(':id/categorias')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Aplica esta trilha a um conjunto de categorias' })
  vincularCategorias(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VincularCategoriasDto,
  ) {
    return this.trilhasService.vincularCategorias(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Exclui a trilha; 409 se houver categoria vinculada ou produto em uso',
  })
  remover(@Param('id', ParseIntPipe) id: number) {
    return this.trilhasService.remover(id);
  }
}
