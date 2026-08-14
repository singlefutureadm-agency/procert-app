import {
  Body,
  Controller,
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
import {
  CurrentUser,
  UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator';
import { NaoConformidadesService } from './nao-conformidades.service';
import {
  AbrirNaoConformidadeDto,
  AvaliarNaoConformidadeDto,
  ListarNaoConformidadesDto,
  ResponderNaoConformidadeDto,
} from './dto/nao-conformidade.dto';

/** Abertura aninhada na etapa: a NC não existe fora de uma certificação. */
@ApiTags('Não conformidades')
@ApiBearerAuth()
@Controller('certificacoes/:certificacaoId/nao-conformidades')
export class NaoConformidadesCertificacaoController {
  constructor(private readonly naoConformidades: NaoConformidadesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({
    summary: 'Abre uma não conformidade em uma etapa reprovada',
  })
  abrir(
    @Param('certificacaoId', ParseIntPipe) certificacaoId: number,
    @Body() dto: AbrirNaoConformidadeDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.naoConformidades.abrir(certificacaoId, dto, usuario);
  }
}

@ApiTags('Não conformidades')
@ApiBearerAuth()
@Controller('nao-conformidades')
export class NaoConformidadesController {
  constructor(private readonly naoConformidades: NaoConformidadesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Lista as não conformidades (o CLIENTE vê só as suas), ordenadas por prazo',
  })
  listar(
    @Query() filtros: ListarNaoConformidadesDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.naoConformidades.listar(filtros, usuario);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha uma não conformidade' })
  buscar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.naoConformidades.buscarPorId(id, usuario);
  }

  @Patch(':id/resposta')
  @Roles(Role.CLIENTE)
  @ApiOperation({
    summary: 'Cliente registra a correção; a NC passa a EM_TRATATIVA',
  })
  responder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResponderNaoConformidadeDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.naoConformidades.responder(id, dto, usuario);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({
    summary:
      'Avalia a resposta; RESOLVIDA reabre a etapa como EM_ANDAMENTO para reavaliação',
  })
  avaliar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AvaliarNaoConformidadeDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.naoConformidades.avaliar(id, dto, usuario);
  }
}
