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
import { CategoriasProdutoService } from './categorias-produto.service';
import {
  AlterarStatusCategoriaDto,
  AtualizarCategoriaProdutoDto,
  CriarCategoriaProdutoDto,
  ListarCategoriasProdutoDto,
} from './dto/categoria-produto.dto';
import { VincularTrilhaDto } from '../modelos-trilha/dto/trilha.dto';

/**
 * Módulo inteiro restrito à equipe, leitura inclusive: o catálogo de categorias
 * e suas normas é configuração interna do organismo certificador. O cliente
 * continua vendo a categoria do próprio produto, que vem embutida no payload
 * de `/produtos`.
 */
@ApiTags('Categorias de produto')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.FUNCIONARIO)
@Controller('categorias-produto')
export class CategoriasProdutoController {
  constructor(private readonly categoriasService: CategoriasProdutoService) {}

  @Get()
  @ApiOperation({ summary: 'Lista categorias de produto' })
  listar(@Query() filtros: ListarCategoriasProdutoDto) {
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
  @ApiOperation({ summary: 'Cadastra uma categoria de produto' })
  criar(@Body() dto: CriarCategoriaProdutoDto) {
    return this.categoriasService.criar(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza uma categoria' })
  atualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AtualizarCategoriaProdutoDto,
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
    summary: 'Exclui definitivamente (somente ADMIN); 409 se houver produtos',
  })
  remover(@Param('id', ParseIntPipe) id: number) {
    return this.categoriasService.remover(id);
  }
}
