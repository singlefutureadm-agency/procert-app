import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { ClientesService } from './clientes.service';
import {
  AlterarStatusDto,
  AtualizarClienteDto,
  CriarClienteDto,
  ListarClientesDto,
} from './dto/cliente.dto';

@ApiTags('Clientes')
@ApiBearerAuth()
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({ summary: 'Lista clientes com filtro de status e busca' })
  listar(@Query() filtros: ListarClientesDto) {
    return this.clientesService.listar(filtros);
  }

  @Get('resumo')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({ summary: 'Lista simplificada para selects' })
  listarResumido() {
    return this.clientesService.listarResumido();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um cliente' })
  buscar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    this.garantirAcesso(usuario, id);
    return this.clientesService.buscarPorId(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({ summary: 'Cadastra um cliente' })
  criar(@Body() dto: CriarClienteDto) {
    return this.clientesService.criar(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza um cliente' })
  atualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AtualizarClienteDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    this.garantirAcesso(usuario, id);
    return this.clientesService.atualizar(id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({ summary: 'Ativa ou desativa um cliente (soft delete)' })
  alterarStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AlterarStatusDto,
  ) {
    return this.clientesService.alterarStatus(id, dto.status);
  }

  @Post(':id/foto')
  @UseInterceptors(FileInterceptor('foto'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Envia ou substitui a foto do cliente' })
  atualizarFoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() arquivo: Express.Multer.File,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    this.garantirAcesso(usuario, id);
    return this.clientesService.atualizarFoto(id, arquivo);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Exclui definitivamente (somente ADMIN)' })
  remover(@Param('id', ParseIntPipe) id: number) {
    return this.clientesService.remover(id);
  }

  /**
   * Um cliente só enxerga o próprio cadastro.
   * No legado o id vinha pela URL sem qualquer verificação de posse (IDOR).
   */
  private garantirAcesso(usuario: UsuarioAutenticado, id: number): void {
    if (usuario.role === Role.CLIENTE && usuario.id !== id) {
      throw new ForbiddenException('Você só pode acessar o seu próprio cadastro.');
    }
  }
}
