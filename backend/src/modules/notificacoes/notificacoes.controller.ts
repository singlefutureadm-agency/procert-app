import {
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
import { NotificacoesService } from './notificacoes.service';
import { ListarNotificacoesDto } from './dto/notificacao.dto';

/**
 * Caixa de avisos da equipe.
 *
 * `@Roles(ADMIN, FUNCIONARIO)` em tudo, e **nenhuma rota recebe id de
 * destinatário**: cada um alcança só a própria caixa, e o id sai do token. O
 * ADMIN não é exceção — a decisão de 17/11/2026 é literal.
 *
 * O escopo é repetido no service, como manda a regra do projeto: um `@Roles`
 * removido por acidente não pode abrir a caixa de ninguém.
 */
@ApiTags('Notificações')
@ApiBearerAuth()
@Controller('notificacoes')
@Roles(Role.ADMIN, Role.FUNCIONARIO)
export class NotificacoesController {
  constructor(private readonly notificacoes: NotificacoesService) {}

  // ANTES de `:id`, senão o Nest casa "nao-lidas" como se fosse um id.
  @Get('nao-lidas')
  @ApiOperation({
    summary: 'Quantas não lidas — só o número, para o badge do sino',
  })
  contarNaoLidas(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.notificacoes.contarNaoLidas(usuario);
  }

  @Get()
  @ApiOperation({
    summary: 'Minhas notificações — não lidas primeiro, recentes no topo',
  })
  listar(
    @Query() filtros: ListarNotificacoesDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.notificacoes.listar(filtros, usuario);
  }

  @Patch(':id/leitura')
  @ApiOperation({ summary: 'Marca uma notificação como lida' })
  marcarLida(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.notificacoes.marcarLida(id, usuario);
  }

  @Post('marcar-todas-lidas')
  @ApiOperation({ summary: 'Marca todas as minhas como lidas' })
  marcarTodasLidas(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.notificacoes.marcarTodasLidas(usuario);
  }
}
