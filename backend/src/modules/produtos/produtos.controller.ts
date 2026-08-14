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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator';
import { AlterarStatusDto } from '../clientes/dto/cliente.dto';
import { ProdutosService } from './produtos.service';
import {
  AtualizarProdutoDto,
  CriarProdutoDto,
  ListarProdutosDto,
} from './dto/produto.dto';

@ApiTags('Produtos')
@ApiBearerAuth()
@Controller('produtos')
export class ProdutosController {
  constructor(private readonly produtosService: ProdutosService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista produtos (clientes recebem apenas os próprios)',
  })
  listar(
    @Query() filtros: ListarProdutosDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.produtosService.listar(filtros, usuario);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um produto com o resumo da certificação' })
  buscar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.produtosService.buscarPorId(id, usuario);
  }

  @Post()
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({
    summary: 'Cadastra um produto e abre automaticamente a certificação',
  })
  criar(@Body() dto: CriarProdutoDto) {
    return this.produtosService.criar(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({ summary: 'Atualiza um produto' })
  atualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AtualizarProdutoDto,
  ) {
    return this.produtosService.atualizar(id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({ summary: 'Ativa ou desativa um produto (soft delete)' })
  alterarStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AlterarStatusDto,
  ) {
    return this.produtosService.alterarStatus(id, dto.status);
  }

  @Post(':id/foto')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @UseInterceptors(FileInterceptor('foto'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Envia ou substitui a foto do produto' })
  atualizarFoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() arquivo: Express.Multer.File,
  ) {
    return this.produtosService.atualizarFoto(id, arquivo);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Exclui o produto e toda a sua certificação' })
  remover(@Param('id', ParseIntPipe) id: number) {
    return this.produtosService.remover(id);
  }
}
