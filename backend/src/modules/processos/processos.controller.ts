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
import { ProcessosService } from './processos.service';
import {
  AtualizarProcessoDto,
  CriarProcessoDto,
  ListarProcessosDto,
} from './dto/processo.dto';

@ApiTags('Processos')
@ApiBearerAuth()
@Controller('processos')
export class ProcessosController {
  constructor(private readonly processosService: ProcessosService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista processos (clientes recebem apenas os próprios)',
  })
  listar(
    @Query() filtros: ListarProcessosDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.processosService.listar(filtros, usuario);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um processo com o resumo da certificação' })
  buscar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.processosService.buscarPorId(id, usuario);
  }

  @Post()
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({
    summary: 'Cadastra um processo e abre automaticamente a certificação',
  })
  criar(@Body() dto: CriarProcessoDto) {
    return this.processosService.criar(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({ summary: 'Atualiza um processo' })
  atualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AtualizarProcessoDto,
  ) {
    return this.processosService.atualizar(id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({ summary: 'Ativa ou desativa um processo (soft delete)' })
  alterarStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AlterarStatusDto,
  ) {
    return this.processosService.alterarStatus(id, dto.status);
  }

  @Post(':id/foto')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @UseInterceptors(FileInterceptor('foto'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Envia ou substitui a foto do processo' })
  atualizarFoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() arquivo: Express.Multer.File,
  ) {
    return this.processosService.atualizarFoto(id, arquivo);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Exclui o processo e toda a sua certificação' })
  remover(@Param('id', ParseIntPipe) id: number) {
    return this.processosService.remover(id);
  }
}
