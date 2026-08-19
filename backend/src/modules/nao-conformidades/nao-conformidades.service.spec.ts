import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CriticidadeNaoConformidade,
  StatusCertificacao,
  StatusNaoConformidade,
} from '@prisma/client';

import { NaoConformidadesService } from './nao-conformidades.service';
import { PrismaService } from '../../prisma/prisma.service';
import { criarPrismaMock, PrismaMock } from '../../testing/prisma.mock';
import { admin, cliente, funcionario } from '../../testing/usuarios.fixture';
import { ListarNaoConformidadesDto } from './dto/nao-conformidade.dto';

const CLIENTE_DONO = 100;
const CLIENTE_ALHEIO = 200;

const ncSalva = (extra: Record<string, unknown> = {}) => ({
  id: 500,
  codigo: 'NC-2026-000001',
  descricao: 'Ensaio de aquecimento fora do limite',
  criticidade: CriticidadeNaoConformidade.MAIOR,
  status: StatusNaoConformidade.ABERTA,
  prazoResposta: null,
  respostaCliente: null,
  respondidoEm: null,
  parecer: null,
  abertoPorNome: 'Ana Administradora',
  resolvidoEm: null,
  criadoEm: new Date(2026, 7, 1),
  certificacaoId: 10,
  certificacao: {
    id: 10,
    status: StatusCertificacao.REPROVADO,
    ordem: 2,
    etapa: { id: 902, nome: 'Ensaios laboratoriais' },
    produto: {
      id: 1,
      nome: 'Disjuntor DIN 25A',
      clienteId: CLIENTE_DONO,
      cliente: { id: CLIENTE_DONO, nome: 'Indústria Cliente Ltda' },
    },
  },
  ...extra,
});

describe('NaoConformidadesService', () => {
  let servico: NaoConformidadesService;
  let banco: PrismaMock;

  beforeEach(() => {
    jest.clearAllMocks();
    banco = criarPrismaMock();
    servico = new NaoConformidadesService(
      banco.prisma as unknown as PrismaService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('abrir — só em etapa reprovada', () => {
    it.each([
      [StatusCertificacao.PENDENTE],
      [StatusCertificacao.EM_ANDAMENTO],
      [StatusCertificacao.APROVADO],
    ])('recusa NC em etapa %s', async (status) => {
      banco.prisma.certificacaoProduto.findUnique.mockResolvedValue({
        id: 10,
        status,
      } as never);

      await expect(
        servico.abrir(
          10,
          {
            descricao: 'Ensaio fora do limite',
            criticidade: CriticidadeNaoConformidade.MAIOR,
          },
          admin(),
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Só é possível registrar não conformidade em uma etapa reprovada.',
        ),
      );
      expect(banco.prisma.naoConformidade.create).not.toHaveBeenCalled();
    });

    it('aceita em etapa REPROVADO', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 19));
      banco.prisma.certificacaoProduto.findUnique.mockResolvedValue({
        id: 10,
        status: StatusCertificacao.REPROVADO,
      } as never);
      banco.prisma.naoConformidade.findFirst.mockResolvedValue(null as never);
      banco.prisma.naoConformidade.create.mockResolvedValue({
        id: 500,
      } as never);
      banco.prisma.naoConformidade.findUniqueOrThrow.mockResolvedValue(
        ncSalva() as never,
      );

      await expect(
        servico.abrir(
          10,
          {
            descricao: 'Ensaio fora do limite',
            criticidade: CriticidadeNaoConformidade.MAIOR,
          },
          admin(),
        ),
      ).resolves.toMatchObject({ codigo: 'NC-2026-000001' });
    });

    it('recusa etapa inexistente', async () => {
      banco.prisma.certificacaoProduto.findUnique.mockResolvedValue(
        null as never,
      );

      await expect(
        servico.abrir(
          77,
          {
            descricao: 'x',
            criticidade: CriticidadeNaoConformidade.MENOR,
          },
          admin(),
        ),
      ).rejects.toThrow(
        new NotFoundException('Etapa de certificação 77 não encontrada.'),
      );
    });
  });

  describe('criarRegistro — código sequencial por ano', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 19));
      banco.prisma.naoConformidade.create.mockResolvedValue({ id: 500 } as never);
    });

    it('deriva do MAIOR código do ano, não de uma contagem', async () => {
      banco.prisma.naoConformidade.findFirst.mockResolvedValue({
        codigo: 'NC-2026-000041',
      } as never);

      await servico.criarRegistro(
        10,
        {
          descricao: 'Ensaio fora do limite',
          criticidade: CriticidadeNaoConformidade.MAIOR,
        },
        admin(),
      );

      // Contar linhas reutilizaria um número já emitido depois de uma exclusão.
      expect(banco.prisma.naoConformidade.findFirst).toHaveBeenCalledWith({
        where: { codigo: { startsWith: 'NC-2026-' } },
        orderBy: { codigo: 'desc' },
        select: { codigo: true },
      });
      const [{ data }] = banco.prisma.naoConformidade.create.mock.calls[0];
      expect(data.codigo).toBe('NC-2026-000042');
    });

    it('começa em 000001 no primeiro registro do ano', async () => {
      banco.prisma.naoConformidade.findFirst.mockResolvedValue(null as never);

      await servico.criarRegistro(
        10,
        {
          descricao: 'x',
          criticidade: CriticidadeNaoConformidade.MENOR,
        },
        admin(),
      );

      const [{ data }] = banco.prisma.naoConformidade.create.mock.calls[0];
      expect(data.codigo).toBe('NC-2026-000001');
    });

    it('o prefixo acompanha o ano corrente', async () => {
      jest.setSystemTime(new Date(2027, 0, 2));
      banco.prisma.naoConformidade.findFirst.mockResolvedValue(null as never);

      await servico.criarRegistro(
        10,
        {
          descricao: 'x',
          criticidade: CriticidadeNaoConformidade.MENOR,
        },
        admin(),
      );

      const [{ data }] = banco.prisma.naoConformidade.create.mock.calls[0];
      expect(data.codigo).toBe('NC-2027-000001');
    });

    it('autoria vem da sessão; CLIENTE não vira `abertoPorId`', async () => {
      banco.prisma.naoConformidade.findFirst.mockResolvedValue(null as never);

      await servico.criarRegistro(
        10,
        {
          descricao: 'x',
          criticidade: CriticidadeNaoConformidade.MENOR,
        },
        cliente(CLIENTE_DONO),
      );

      const [{ data }] = banco.prisma.naoConformidade.create.mock.calls[0];
      // A FK aponta para `Funcionario`; um id de cliente ali seria uma
      // referência cruzada silenciosa entre duas sequências independentes.
      expect(data.abertoPorId).toBeNull();
      expect(data.abertoPorNome).toBe('Indústria Cliente Ltda');
    });

    it('usa o cliente de transação quando recebe um', async () => {
      banco.tx.naoConformidade.findFirst.mockResolvedValue(null as never);
      banco.tx.naoConformidade.create.mockResolvedValue({ id: 500 } as never);

      await (
        banco.prisma.$transaction as unknown as (
          cb: (tx: never) => Promise<unknown>,
        ) => Promise<unknown>
      )(async (tx) => {
        await servico.criarRegistro(
          10,
          {
            descricao: 'x',
            criticidade: CriticidadeNaoConformidade.MENOR,
          },
          admin(),
          tx,
        );
      });

      // A numeração também precisa sair de dentro do commit: lida fora, duas
      // aberturas simultâneas leriam o mesmo último código.
      expect(banco.chamadasNaTransacao).toEqual([
        'naoConformidade.findFirst',
        'naoConformidade.create',
      ]);
      expect(banco.prisma.naoConformidade.create).not.toHaveBeenCalled();
    });
  });

  describe('avaliar — RESOLVIDA reabre a etapa', () => {
    beforeEach(() => {
      // `avaliar` lê um recorte enxuto e, no fim, chama `buscarPorId`, que usa
      // o SELECT_NC completo — as duas leituras batem no mesmo `findUnique`.
      banco.prisma.naoConformidade.findUnique.mockResolvedValue(
        ncSalva({
          status: StatusNaoConformidade.EM_TRATATIVA,
          certificacao: {
            ...ncSalva().certificacao,
            status: StatusCertificacao.REPROVADO,
          },
        }) as never,
      );
      banco.prisma.naoConformidade.findUniqueOrThrow.mockResolvedValue(
        ncSalva({ status: StatusNaoConformidade.RESOLVIDA }) as never,
      );
    });

    it('devolve a etapa para EM_ANDAMENTO, não para APROVADO', async () => {
      await servico.avaliar(
        500,
        {
          status: StatusNaoConformidade.RESOLVIDA,
          parecer: 'Ação corretiva aceita',
        },
        admin(),
      );

      // Resolver a NC não aprova a etapa: ela volta para reavaliação.
      expect(banco.tx.certificacaoProduto.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { status: StatusCertificacao.EM_ANDAMENTO },
      });
    });

    it('a reabertura e o encerramento da NC saem no MESMO commit, com autoria', async () => {
      await servico.avaliar(
        500,
        {
          status: StatusNaoConformidade.RESOLVIDA,
          parecer: 'Ação corretiva aceita',
        },
        funcionario(4),
      );

      expect(banco.chamadasForaDaTransacao).toEqual([]);
      expect(banco.chamadasNaTransacao).toEqual([
        'naoConformidade.update',
        'certificacaoProduto.update',
        'certificacaoHistorico.create',
      ]);

      const [{ data }] = banco.tx.certificacaoHistorico.create.mock.calls[0];
      expect(data).toMatchObject({
        certificacaoId: 10,
        statusAnterior: StatusCertificacao.REPROVADO,
        statusNovo: StatusCertificacao.EM_ANDAMENTO,
        alteradoPorId: 4,
        alteradoPorNome: 'Bruno Analista',
      });
      expect(data.observacao).toContain('NC-2026-000001');
    });

    it('REPROVADA encerra a NC e NÃO mexe na etapa', async () => {
      await servico.avaliar(
        500,
        {
          status: StatusNaoConformidade.REPROVADA,
          parecer: 'Ação corretiva insuficiente',
        },
        admin(),
      );

      expect(banco.tx.certificacaoProduto.update).not.toHaveBeenCalled();
      expect(banco.tx.certificacaoHistorico.create).not.toHaveBeenCalled();
      const [{ data }] = banco.tx.naoConformidade.update.mock.calls[0];
      expect(data.resolvidoEm).toBeInstanceOf(Date);
    });

    it('devolver para EM_TRATATIVA limpa a data de encerramento', async () => {
      await servico.avaliar(
        500,
        {
          status: StatusNaoConformidade.EM_TRATATIVA,
          parecer: 'Faltou evidência da ação',
        },
        admin(),
      );

      const [{ data }] = banco.tx.naoConformidade.update.mock.calls[0];
      expect(data.resolvidoEm).toBeNull();
    });

    it('recusa reabrir uma NC (status ABERTA na avaliação)', async () => {
      await expect(
        servico.avaliar(
          500,
          { status: StatusNaoConformidade.ABERTA, parecer: 'x' },
          admin(),
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Não é possível reabrir uma não conformidade; registre uma nova.',
        ),
      );
      expect(banco.transacoesAbertas).toBe(0);
    });

    it.each([
      [StatusNaoConformidade.RESOLVIDA],
      [StatusNaoConformidade.REPROVADA],
    ])('recusa reavaliar NC já encerrada (%s)', async (statusAtual) => {
      banco.prisma.naoConformidade.findUnique.mockResolvedValue(
        ncSalva({ status: statusAtual }) as never,
      );

      await expect(
        servico.avaliar(
          500,
          { status: StatusNaoConformidade.RESOLVIDA, parecer: 'x' },
          admin(),
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Esta não conformidade já foi encerrada e não pode ser reavaliada.',
        ),
      );
      expect(banco.transacoesAbertas).toBe(0);
    });

    it('recusa NC inexistente', async () => {
      banco.prisma.naoConformidade.findUnique.mockResolvedValue(null as never);

      await expect(
        servico.avaliar(
          999,
          { status: StatusNaoConformidade.RESOLVIDA, parecer: 'x' },
          admin(),
        ),
      ).rejects.toThrow(
        new NotFoundException('Não conformidade 999 não encontrada.'),
      );
    });
  });

  describe('responder — escopo do CLIENTE dono', () => {
    it('cliente ALHEIO recebe ForbiddenException e nada é gravado', async () => {
      banco.prisma.naoConformidade.findUnique.mockResolvedValue(
        ncSalva() as never,
      );

      await expect(
        servico.responder(
          500,
          { respostaCliente: 'Trocamos o fornecedor do contato' },
          cliente(CLIENTE_ALHEIO),
        ),
      ).rejects.toThrow(
        new ForbiddenException(
          'Você só pode acessar as não conformidades dos seus produtos.',
        ),
      );
      expect(banco.prisma.naoConformidade.update).not.toHaveBeenCalled();
    });

    it('cliente DONO responde e a NC vai para EM_TRATATIVA', async () => {
      banco.prisma.naoConformidade.findUnique.mockResolvedValue(
        ncSalva() as never,
      );

      await servico.responder(
        500,
        { respostaCliente: 'Trocamos o fornecedor do contato' },
        cliente(CLIENTE_DONO),
      );

      const [{ data }] = banco.prisma.naoConformidade.update.mock.calls[0];
      expect(data).toMatchObject({
        respostaCliente: 'Trocamos o fornecedor do contato',
        // A resposta move para tratativa; a decisão continua com a equipe.
        status: StatusNaoConformidade.EM_TRATATIVA,
      });
      expect(data.respondidoEm).toBeInstanceOf(Date);
    });

    it('recusa resposta em NC já encerrada', async () => {
      banco.prisma.naoConformidade.findUnique.mockResolvedValue(
        ncSalva({ status: StatusNaoConformidade.RESOLVIDA }) as never,
      );

      await expect(
        servico.responder(
          500,
          { respostaCliente: 'tarde demais' },
          cliente(CLIENTE_DONO),
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Esta não conformidade já foi avaliada e não aceita nova resposta.',
        ),
      );
    });
  });

  describe('listar — escopo de papel', () => {
    beforeEach(() => {
      banco.prisma.naoConformidade.findMany.mockResolvedValue([] as never);
      banco.prisma.naoConformidade.count.mockResolvedValue(0 as never);
    });

    it('CLIENTE só vê as NCs dos próprios produtos, e o filtro da URL não muda isso', async () => {
      const filtros = Object.assign(new ListarNaoConformidadesDto(), {
        produtoId: 42,
      });

      await servico.listar(filtros, cliente(CLIENTE_DONO));

      const argumentos = banco.prisma.naoConformidade.findMany.mock.calls[0][0]!;
      expect(argumentos.where).toMatchObject({
        certificacao: { produto: { id: 42, clienteId: CLIENTE_DONO } },
      });
    });

    it('a equipe não recebe filtro de cliente algum', async () => {
      await servico.listar(new ListarNaoConformidadesDto(), funcionario());

      const argumentos = banco.prisma.naoConformidade.findMany.mock.calls[0][0]!;
      const produto = (
        argumentos.where as { certificacao: { produto: Record<string, unknown> } }
      ).certificacao.produto;
      expect(produto).not.toHaveProperty('clienteId');
    });

    it('lista e conta no mesmo snapshot', async () => {
      await servico.listar(new ListarNaoConformidadesDto(), admin());

      expect(banco.transacoesAbertas).toBe(1);
    });
  });
});
