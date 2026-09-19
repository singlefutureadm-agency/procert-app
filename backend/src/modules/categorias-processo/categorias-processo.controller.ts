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
import { CategoriasProcessoService } from './categorias-processo.service';
import {
  AlterarStatusCategoriaDto,
  AtualizarCategoriaProcessoDto,
  CriarCategoriaProcessoDto,
  ListarCategoriasProcessoDto,
} from './dto/categoria-processo.dto';
import { VincularTrilhaDto } from '../modelos-trilha/dto/trilha.dto';

/**
 * Módulo inteiro restrito à equipe, leitura inclusive: o catálogo de categorias
 * e suas normas é configuração interna do organismo certificador. O cliente
 * continua vendo a categoria do próprio processo, que vem embutida no payload
 * de `/processos`.
 */
@ApiTags('Categorias de processo')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.FUNCIONARIO)
@Controller('categorias-processo')
export class CategoriasProcessoController {
  constructor(private readonly categoriasService: CategoriasProcessoService) {}

  @Get()
  @ApiOperation({ summary: 'Lista categorias de processo' })
  listar(@Query() filtros: ListarCategoriasProcessoDto) {
    return this.categoriasService.listar(filtros);
  }

  @Get('resumo')
  @ApiOperation({
    summary: 'Lista simplificada para selects, com o modelo de trilha vigente',
  })
  listarResumido() {
    return this.categoriasService.listarResumido();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha uma categoria' })
  buscar(@Param('id', ParseIntPipe) id: number) {
    return this.categoriasService.buscarPorId(id);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastra uma categoria de processo' })
  criar(@Body() dto: CriarCategoriaProcessoDto) {
    return this.categoriasService.criar(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza uma categoria' })
  atualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AtualizarCategoriaProcessoDto,
  ) {
    return this.categoriasService.atualizar(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Ativa ou desativa uma categoria (soft delete)' })
  alterarStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AlterarStatusCategoriaDto,
  ) {
    return this.categoriasService.alterarStatus(id, dto.status);
  }

  @Patch(':id/trilha')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Vincula a trilha do catálogo que esta categoria segue (null desvincula)',
  })
  vincularTrilha(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VincularTrilhaDto,
  ) {
    return this.categoriasService.vincularTrilha(id, dto.trilhaId ?? null);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Exclui definitivamente (somente ADMIN); 409 se houver processos',
  })
  remover(@Param('id', ParseIntPipe) id: number) {
    return this.categoriasService.remover(id);
  }
}
