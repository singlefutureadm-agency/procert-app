import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, TipoNotificacao } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { paginar } from '../../common/dto/paginacao.dto';
import { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { ListarNotificacoesDto } from './dto/notificacao.dto';

const SELECT_NOTIFICACAO = {
  id: true,
  tipo: true,
  titulo: true,
  detalhe: true,
  processoId: true,
  lidaEm: true,
  criadoEm: true,
} satisfies Prisma.NotificacaoSelect;

/** O que precisa ser gravado para um aviso existir. Texto já composto. */
export interface AvisoAEnviar {
  destinatarioId: number;
  tipo: TipoNotificacao;
  titulo: string;
  detalhe?: string;
  processoId: number;
}

/**
 * Avisos no painel, endereçados a UMA pessoa da equipe.
 *
 * ## O escopo é LITERAL: cada um vê só a própria caixa
 *
 * Não há parâmetro de destinatário em nenhum método de leitura — o id sai sempre
 * do token. **Nem o ADMIN** consulta a caixa de outro: foi a decisão de
 * 17/11/2026, e é a única regra que não precisa de exceção em lugar nenhum. O
 * ADMIN continua vendo TUDO pelo quadro e pelos relatórios, que não mudaram.
 *
 * A consequência é que não existe rota "notificações de X". Se um dia precisar
 * (auditoria, suporte), é entrega própria, com `@Roles(ADMIN)` e um motivo
 * registrado — não um parâmetro opcional acrescentado aqui.
 *
 * ## CLIENTE é barrado ANTES de `usuario.id` ser usado
 *
 * Isto não é zelo: `sub` é o id na tabela `Cliente` **OU** na `Funcionario`, e as
 * sequências são independentes. O cliente 3 e o funcionário 3 são pessoas
 * diferentes. Usar `usuario.id` como `destinatarioId` sem conferir o papel
 * entregaria a caixa do funcionário 3 ao cliente 3 — e sem erro nenhum, porque
 * a consulta é válida e devolve linhas.
 */
@Injectable()
export class NotificacoesService {
  constructor(private readonly prisma: PrismaService) {}

  /** As minhas, não lidas primeiro, mais recentes no topo. */
  async listar(filtros: ListarNotificacoesDto, usuario: UsuarioAutenticado) {
    const destinatarioId = this.garantirDestinatario(usuario);

    const where: Prisma.NotificacaoWhereInput = {
      destinatarioId,
      ...(filtros.apenasNaoLidas && { lidaEm: null }),
    };

    const [dados, total] = await this.prisma.$transaction([
      this.prisma.notificacao.findMany({
        where,
        select: SELECT_NOTIFICACAO,
        // Não lidas primeiro: a caixa existe para mostrar o que falta tratar.
        // `lidaEm: asc` com nulls first é o que o Postgres faz por padrão em
        // ordem ascendente, e o `orderBy` explícito deixa isso declarado.
        orderBy: [{ lidaEm: { sort: 'asc', nulls: 'first' } }, { criadoEm: 'desc' }],
        skip: filtros.skip,
        take: filtros.limite,
      }),
      this.prisma.notificacao.count({ where }),
    ]);

    return paginar(dados, total, filtros);
  }

  /**
   * Quantas não lidas — só o número, para o badge.
   *
   * Rota própria e não um campo da listagem: o badge é consultado em intervalo
   * curto e de toda tela, e trazer a primeira página de avisos a cada polling
   * seria carregar a lista inteira para desenhar um número.
   */
  async contarNaoLidas(usuario: UsuarioAutenticado): Promise<{ naoLidas: number }> {
    const destinatarioId = this.garantirDestinatario(usuario);

    const naoLidas = await this.prisma.notificacao.count({
      where: { destinatarioId, lidaEm: null },
    });

    return { naoLidas };
  }

  /**
   * Marca uma como lida.
   *
   * O `where` leva o `destinatarioId` JUNTO do id — não é um `findUnique`
   * seguido de conferência. Um id de outra pessoa simplesmente não casa, e o
   * resultado é 404 em vez de 403: dizer "existe, mas não é sua" confirmaria a
   * existência do aviso de outro.
   *
   * Idempotente: marcar o que já está lido não regrava a data, senão reabrir a
   * central moveria o "lida em" de tudo para agora.
   */
  async marcarLida(id: number, usuario: UsuarioAutenticado) {
    const destinatarioId = this.garantirDestinatario(usuario);

    const { count } = await this.prisma.notificacao.updateMany({
      where: { id, destinatarioId, lidaEm: null },
      data: { lidaEm: new Date() },
    });

    if (count === 0) {
      // Pode ser id inexistente, de outra pessoa, ou já lido. Os três levam à
      // mesma resposta de propósito — distinguir vazaria a existência.
      const existe = await this.prisma.notificacao.findFirst({
        where: { id, destinatarioId },
        select: SELECT_NOTIFICACAO,
      });

      if (!existe) {
        throw new NotFoundException(`Notificação ${id} não encontrada.`);
      }
      return existe;
    }

    return this.prisma.notificacao.findFirstOrThrow({
      where: { id, destinatarioId },
      select: SELECT_NOTIFICACAO,
    });
  }

  /** Marca todas as minhas como lidas. Devolve quantas mudaram. */
  async marcarTodasLidas(
    usuario: UsuarioAutenticado,
  ): Promise<{ marcadas: number }> {
    const destinatarioId = this.garantirDestinatario(usuario);

    const { count } = await this.prisma.notificacao.updateMany({
      where: { destinatarioId, lidaEm: null },
      data: { lidaEm: new Date() },
    });

    return { marcadas: count };
  }

  /**
   * Grava os avisos DENTRO de uma transação em curso.
   *
   * Recebe o cliente de transação (`tx`), e não usa `this.prisma`: o aviso nasce
   * no mesmo commit do evento que o originou. Fora dele, um envio de documento
   * podia concluir sem avisar ninguém — em silêncio, que é o modo de falha que
   * este módulo existe para impedir.
   *
   * Lista vazia não é erro: é o caso normal de processo **sem responsável**, e
   * de quem age sobre o próprio processo. Ver `avisosPara`.
   */
  async gravar(
    tx: Prisma.TransactionClient,
    avisos: AvisoAEnviar[],
  ): Promise<void> {
    if (avisos.length === 0) return;

    // `createMany` serve aqui: não há relação aninhada nenhuma, ao contrário do
    // caso das microetapas.
    await tx.notificacao.createMany({ data: avisos });
  }

  // ---------------------------------------------------------------- privados

  /**
   * O id do destinatário a partir do token, barrando o CLIENTE primeiro.
   *
   * A ordem importa — ver a nota sobre `sub` no topo da classe.
   */
  private garantirDestinatario(usuario: UsuarioAutenticado): number {
    if (usuario.role === Role.CLIENTE) {
      throw new ForbiddenException(
        'A caixa de avisos é da equipe interna. Acompanhe seus processos pela ' +
          'linha do tempo de cada um.',
      );
    }
    return usuario.id;
  }
}

/**
 * Quem deve ser avisado de algo que aconteceu num processo.
 *
 * Função pura, fora da classe, porque é a REGRA e precisa ser lida de uma vez:
 *
 *  1. o destinatário é o **responsável pelo processo**, e mais ninguém;
 *  2. processo sem responsável não avisa nada — lista vazia, não erro;
 *  3. **quem agiu não é avisado da própria ação.** Avisar o responsável de algo
 *     que ele mesmo acabou de fazer é o aviso que ensina a ignorar os outros.
 *
 * O item 3 é o que torna a função necessária: sem ele, aceitar um documento no
 * próprio processo geraria uma notificação para si mesmo, e a caixa de quem
 * trabalha encheria com o eco do próprio trabalho.
 */
export function avisosPara(
  responsavelId: number | null,
  autorId: number | null,
  aviso: Omit<AvisoAEnviar, 'destinatarioId'>,
): AvisoAEnviar[] {
  if (responsavelId === null) return [];
  if (responsavelId === autorId) return [];

  return [{ ...aviso, destinatarioId: responsavelId }];
}
