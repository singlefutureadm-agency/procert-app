import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TipoNotificacao } from '@prisma/client';

import { avisosPara, NotificacoesService } from './notificacoes.service';
import { PrismaService } from '../../prisma/prisma.service';
import { criarPrismaMock, PrismaMock } from '../../testing/prisma.mock';
import { admin, cliente, funcionario } from '../../testing/usuarios.fixture';

const AVISO = {
  tipo: TipoNotificacao.DOCUMENTO_ENVIADO,
  titulo: 'Documento recebido em "Disjuntor DIN 25A"',
  processoId: 1,
};

/**
 * Quem recebe o aviso — a regra inteira, numa função pura.
 *
 * Os três casos têm o mesmo sintoma quando quebram: **nada falha**. Uma linha é
 * gravada, ou não é, e só quem lê a caixa percebe — tarde.
 */
describe('avisosPara', () => {
  it('avisa o responsável pelo processo', () => {
    expect(avisosPara(7, null, AVISO)).toEqual([
      { ...AVISO, destinatarioId: 7 },
    ]);
  });

  it('processo SEM responsável não avisa ninguém, e não é erro', () => {
    // A alternativa — mandar para todo mundo — é o aviso que ninguém trata
    // porque não é de ninguém. O estado é achável: a listagem e o quadro
    // filtram e marcam "sem responsável".
    expect(avisosPara(null, 3, AVISO)).toEqual([]);
  });

  it('quem agiu NÃO é avisado da própria ação', () => {
    // Sem isto, aceitar um documento no próprio processo geraria notificação
    // para si mesmo, e a caixa de quem trabalha encheria com o eco do próprio
    // trabalho — treinando a pessoa a ignorar a caixa toda.
    expect(avisosPara(7, 7, AVISO)).toEqual([]);
  });

  it('avisa quando o autor é outra pessoa da equipe', () => {
    expect(avisosPara(7, 3, AVISO)).toHaveLength(1);
  });

  it('autor `null` (envio do cliente) sempre avisa o responsável', () => {
    // O autor é `null` de propósito quando quem envia é o CLIENTE: `sub` é o id
    // na tabela Cliente OU na Funcionario, e passar o id do cliente aqui
    // silenciaria o aviso sempre que ele coincidisse com o do responsável.
    expect(avisosPara(7, null, AVISO)).toHaveLength(1);
  });
});

describe('NotificacoesService', () => {
  let servico: NotificacoesService;
  let banco: PrismaMock;

  const paginacao = { pagina: 1, limite: 20, skip: 0 };

  beforeEach(() => {
    jest.clearAllMocks();
    banco = criarPrismaMock();
    banco.prisma.notificacao.findMany.mockResolvedValue([] as never);
    banco.prisma.notificacao.count.mockResolvedValue(0 as never);
    banco.prisma.notificacao.updateMany.mockResolvedValue({ count: 1 } as never);
    banco.prisma.notificacao.findFirstOrThrow.mockResolvedValue({
      id: 1,
    } as never);
    servico = new NotificacoesService(banco.prisma as unknown as PrismaService);
  });

  /** O `where` do `findMany` montado por `listar`. */
  const whereDaListagem = () =>
    banco.prisma.notificacao.findMany.mock.calls[0][0]!.where;

  describe('escopo — a caixa é sempre a do próprio usuário', () => {
    /**
     * O caso mais perigoso deste módulo.
     *
     * `sub` é o id na tabela `Cliente` **OU** na `Funcionario`, e as sequências
     * são independentes: o cliente 3 e o funcionário 3 são pessoas diferentes.
     * Usar `usuario.id` como `destinatarioId` sem conferir o papel entregaria a
     * caixa do funcionário 3 ao cliente 3 — **sem erro nenhum**, porque a
     * consulta é válida e devolve linhas de verdade.
     */
    it('CLIENTE é barrado ANTES de o id ser usado, e nada é consultado', async () => {
      await expect(servico.listar(paginacao, cliente(3))).rejects.toThrow(
        ForbiddenException,
      );

      expect(banco.prisma.notificacao.findMany).not.toHaveBeenCalled();
      expect(banco.prisma.notificacao.count).not.toHaveBeenCalled();
    });

    it('CLIENTE é barrado também no contador e nas escritas', async () => {
      await expect(servico.contarNaoLidas(cliente(3))).rejects.toThrow(
        ForbiddenException,
      );
      await expect(servico.marcarLida(1, cliente(3))).rejects.toThrow(
        ForbiddenException,
      );
      await expect(servico.marcarTodasLidas(cliente(3))).rejects.toThrow(
        ForbiddenException,
      );

      expect(banco.prisma.notificacao.updateMany).not.toHaveBeenCalled();
    });

    it('o destinatário sai do TOKEN, não de filtro', async () => {
      await servico.listar(paginacao, funcionario(42));

      expect(whereDaListagem()).toMatchObject({ destinatarioId: 42 });
    });

    it('o ADMIN não é exceção: vê só a própria caixa', async () => {
      // A decisão de 17/11/2026 é literal. O ADMIN continua vendo tudo pelo
      // quadro e pelos relatórios — não por aqui.
      await servico.listar(paginacao, admin(9));

      expect(whereDaListagem()).toMatchObject({ destinatarioId: 9 });
    });
  });

  describe('listar', () => {
    it('sem filtro, traz lidas e não lidas', async () => {
      await servico.listar(paginacao, funcionario(42));

      expect(whereDaListagem()).not.toHaveProperty('lidaEm');
    });

    it('`apenasNaoLidas` filtra por lidaEm null', async () => {
      await servico.listar(
        { ...paginacao, apenasNaoLidas: true },
        funcionario(42),
      );

      expect(whereDaListagem()).toMatchObject({ lidaEm: null });
    });

    it('não lidas primeiro, recentes no topo', async () => {
      // A caixa existe para mostrar o que falta tratar: ordenar por data
      // sozinha afundaria um aviso não lido abaixo de dez lidos.
      await servico.listar(paginacao, funcionario(42));

      expect(banco.prisma.notificacao.findMany.mock.calls[0][0]!.orderBy).toEqual([
        { lidaEm: { sort: 'asc', nulls: 'first' } },
        { criadoEm: 'desc' },
      ]);
    });

    it('lista e contagem no MESMO snapshot', async () => {
      await servico.listar(paginacao, funcionario(42));

      expect(banco.transacoesAbertas).toBe(1);
    });
  });

  describe('marcarLida', () => {
    it('o destinatário vai no WHERE, junto do id', async () => {
      // Não é `findUnique` seguido de conferência: um id de outra pessoa
      // simplesmente não casa. Conferir depois é a chance de esquecer.
      await servico.marcarLida(5, funcionario(42));

      expect(banco.prisma.notificacao.updateMany.mock.calls[0][0].where).toEqual({
        id: 5,
        destinatarioId: 42,
        lidaEm: null,
      });
    });

    it('é idempotente: já lida não regrava a data', async () => {
      // O `lidaEm: null` no where é o que garante isso. Sem ele, reabrir a
      // central moveria o "lida em" de tudo para agora.
      banco.prisma.notificacao.updateMany.mockResolvedValue({
        count: 0,
      } as never);
      banco.prisma.notificacao.findFirst.mockResolvedValue({
        id: 5,
        lidaEm: new Date('2026-11-17T10:00:00Z'),
      } as never);

      const resultado = await servico.marcarLida(5, funcionario(42));

      expect(resultado).toMatchObject({ id: 5 });
      expect(banco.prisma.notificacao.updateMany.mock.calls[0][0].where).toMatchObject(
        { lidaEm: null },
      );
    });

    it('aviso de outra pessoa dá 404, não 403', async () => {
      // 403 confirmaria que o aviso existe. A resposta é a mesma de um id
      // inexistente de propósito.
      banco.prisma.notificacao.updateMany.mockResolvedValue({
        count: 0,
      } as never);
      banco.prisma.notificacao.findFirst.mockResolvedValue(null as never);

      await expect(servico.marcarLida(5, funcionario(42))).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('marcarTodasLidas', () => {
    it('só as minhas e só as não lidas', async () => {
      banco.prisma.notificacao.updateMany.mockResolvedValue({
        count: 3,
      } as never);

      await expect(servico.marcarTodasLidas(funcionario(42))).resolves.toEqual({
        marcadas: 3,
      });
      expect(banco.prisma.notificacao.updateMany.mock.calls[0][0].where).toEqual({
        destinatarioId: 42,
        lidaEm: null,
      });
    });
  });

  describe('gravar', () => {
    it('escreve pelo cliente de TRANSAÇÃO que recebeu', async () => {
      // O aviso nasce no mesmo commit do evento. Gravar por `this.prisma`
      // deixaria um envio concluir sem avisar ninguém, em silêncio.
      await servico.gravar(banco.tx, [{ ...AVISO, destinatarioId: 7 }]);

      expect(banco.tx.notificacao.createMany).toHaveBeenCalled();
      expect(banco.prisma.notificacao.createMany).not.toHaveBeenCalled();
    });

    it('lista vazia não escreve nada — é o caso normal', async () => {
      // Processo sem responsável, e quem age no próprio processo.
      await servico.gravar(banco.tx, []);

      expect(banco.tx.notificacao.createMany).not.toHaveBeenCalled();
    });
  });
});
