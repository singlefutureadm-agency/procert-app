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
import { FuncionariosService } from './funcionarios.service';
import {
  AtualizarFuncionarioDto,
  CriarFuncionarioDto,
  ListarFuncionariosDto,
} from './dto/funcionario.dto';

@ApiTags('Equipe (funcionários e administradores)')
@ApiBearerAuth()
@Controller('funcionarios')
export class FuncionariosController {
  constructor(private readonly funcionariosService: FuncionariosService) {}

  @Get()
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({ summary: 'Lista a equipe (filtro por papel e status)' })
  listar(@Query() filtros: ListarFuncionariosDto) {
    return this.funcionariosService.listar(filtros);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({ summary: 'Detalha um colaborador' })
  buscar(@Param('id', ParseIntPipe) id: number) {
    return this.funcionariosService.buscarPorId(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cadastra funcionário ou administrador' })
  criar(@Body() dto: CriarFuncionarioDto) {
    return this.funcionariosService.criar(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Atualiza um colaborador' })
  atualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AtualizarFuncionarioDto,
  ) {
    return this.funcionariosService.atualizar(id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ativa ou desativa um colaborador' })
  alterarStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AlterarStatusDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.funcionariosService.alterarStatus(id, dto.status, usuario.id);
  }

  @Post(':id/foto')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @UseInterceptors(FileInterceptor('foto'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Envia ou substitui a foto' })
  atualizarFoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() arquivo: Express.Multer.File,
  ) {
    return this.funcionariosService.atualizarFoto(id, arquivo);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Exclui definitivamente' })
  remover(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.funcionariosService.remover(id, usuario.id);
  }
}
