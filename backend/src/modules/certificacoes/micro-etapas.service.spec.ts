import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StatusCertificacao } from '@prisma/client';
import { mockDeep } from 'jest-mock-extended';

import {
  aprovacaoAutomaticaDoProduto,
  MicroEtapasService,
} from './micro-etapas.service';
import { DocumentosCertificacaoService } from './documentos.service';
import { PrismaService } from '../../prisma/prisma.service';
import { criarPrismaMock, PrismaMock } from '../../testing/prisma.mock';
import { admin, cliente } from '../../testing/usuarios.fixture';

/**
 * A microetapa lida com a decisão mais sensível deste módulo: aprovar uma etapa
 * de certificação sem alguém clicar em "aprovar". Todo caso aqui existe para
 * que essa automação não contorne uma regra que a aprovação manual respeita.
 */
describe('MicroEtapasService', () => {
  let servico: MicroEtapasService;
  let banco: PrismaMock;
  let documentos: jest.Mocked<DocumentosCertificacaoService>;

  /** Microetapa com o processo em volta, do jeito que o service a consulta. */
  const microNoBanco = (extra: {
    concluida?: boolean;
    statusEtapa?: StatusCertificacao;
    exigeDocumento?: boolean;
    aprovacaoProduto?: boolean | null;
    aprovacaoTrilha?: boolean;
  } = {}) => ({
    id: 5,
    concluida: extra.concluida ?? false,
    certificacaoId: 10,
    certificacao: {
      id: 10,
      status: extra.statusEtapa ?? StatusCertificacao.EM_ANDAMENTO,
      iniciadaEm: new Date('2026-09-01T08:00:00Z'),
      etapa: {
        nome: 'Ensaios laboratoriais',
        exigeDocumento: extra.exigeDocumento ?? false,
      },
      produto: {
        id: 1,
        aprovacaoAutomatica: extra.aprovacaoProduto ?? null,
        modeloTrilha: { aprovacaoAutomatica: extra.aprovacaoTrilha ?? true },
      },
    },
  });

  /** Resultado do `groupBy` que conta o checklist. */
  const checklist = (concluidas: number, pendentes: number) =>
    banco.prisma.microEtapaCertificacao.groupBy.mockResolvedValue([
      { concluida: true, _count: { _all: concluidas } },
      { concluida: false, _count: { _all: pendentes } },
    ] as never);

  beforeEach(() => {
    jest.clearAllMocks();
    banco = criarPrismaMock();
    documentos = mockDeep<DocumentosCertificacaoService>();
    documentos.etapasSemDocumento.mockResolvedValue([]);

    servico = new MicroEtapasService(
      banco.prisma as unknown as PrismaService,
      documentos,
    );
  });

  describe('escopo', () => {
    it('CLIENTE não executa etapa, e nada é consultado', async () => {
      await expect(servico.alternar(5, true, cliente())).rejects.toThrow(
        ForbiddenException,
      );
      expect(banco.prisma.microEtapaCertificacao.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('marcação', () => {
    it('marcar grava autoria e data', async () => {
      banco.prisma.microEtapaCertificacao.findUnique.mockResolvedValue(
        microNoBanco() as never,
      );
      checklist(1, 1);

      await servico.alternar(5, true, admin());

      const dados =
        banco.prisma.microEtapaCertificacao.update.mock.calls[0][0].data;
      expect(dados.concluida).toBe(true);
      expect(dados.concluidaEm).toBeInstanceOf(Date);
      expect(dados.concluidaPorNome).toBe('Ana Administradora');
    });

    it('desmarcar LIMPA a autoria', async () => {
      // Um nome ao lado de um item não concluído afirmaria que alguém o
      // concluiu — e a auditoria leria isso como verdade.
      banco.prisma.microEtapaCertificacao.findUnique.mockResolvedValue(
        microNoBanco({ concluida: true }) as never,
      );
      checklist(0, 2);

      await servico.alternar(5, false, admin());

      const dados =
        banco.prisma.microEtapaCertificacao.update.mock.calls[0][0].data;
      expect(dados.concluida).toBe(false);
      expect(dados.concluidaEm).toBeNull();
      expect(dados.concluidaPorId).toBeNull();
      expect(dados.concluidaPorNome).toBeNull();
    });

    it('recusa mexer no checklist de etapa já APROVADA', async () => {
      // O histórico afirma que a etapa foi avaliada com aquele conjunto
      // marcado. Mudá-lo depois faria o registro divergir do que sustentou a
      // aprovação.
      banco.prisma.microEtapaCertificacao.findUnique.mockResolvedValue(
        microNoBanco({ statusEtapa: StatusCertificacao.APROVADO }) as never,
      );

      await expect(servico.alternar(5, false, admin())).rejects.toThrow(
        BadRequestException,
      );
      expect(banco.prisma.microEtapaCertificacao.update).not.toHaveBeenCalled();
    });
  });

  describe('aprovação automática', () => {
    it('fechar o checklist aprova a etapa, com autoria de quem marcou', async () => {
      banco.prisma.microEtapaCertificacao.findUnique.mockResolvedValue(
        microNoBanco({ aprovacaoTrilha: true }) as never,
      );
      checklist(3, 0);

      const resultado = await servico.alternar(5, true, admin());

      expect(resultado.etapaAprovada).toBe(true);
      expect(banco.tx.certificacaoProduto.update).toHaveBeenCalledTimes(1);

      const historico = banco.tx.certificacaoHistorico.create.mock.calls[0][0].data;
      // "Sistema" seria mentira: a decisão foi de uma pessoa.
      expect(historico.alteradoPorNome).toBe('Ana Administradora');
      expect(historico.statusNovo).toBe(StatusCertificacao.APROVADO);
    });

    it('a aprovação grava o marco de conclusão junto', async () => {
      // Status sem `concluidaEm` é o estado que a constraint
      // `ck_certificacao_concluida_em` recusa no banco.
      banco.prisma.microEtapaCertificacao.findUnique.mockResolvedValue(
        microNoBanco() as never,
      );
      checklist(2, 0);

      await servico.alternar(5, true, admin());

      const dados = banco.tx.certificacaoProduto.update.mock.calls[0][0].data;
      expect(dados.status).toBe(StatusCertificacao.APROVADO);
      expect(dados.concluidaEm).toBeInstanceOf(Date);
    });

    it('marcar um item do MEIO não aprova', async () => {
      banco.prisma.microEtapaCertificacao.findUnique.mockResolvedValue(
        microNoBanco() as never,
      );
      checklist(2, 1);

      const resultado = await servico.alternar(5, true, admin());

      expect(resultado.etapaAprovada).toBe(false);
      expect(resultado.aviso).toBeNull();
      expect(banco.tx.certificacaoProduto.update).not.toHaveBeenCalled();
    });

    it('DESMARCAR nunca aprova, mesmo com o resto todo marcado', async () => {
      banco.prisma.microEtapaCertificacao.findUnique.mockResolvedValue(
        microNoBanco({ concluida: true }) as never,
      );
      // Contagem irreal de propósito: mesmo que viesse "tudo concluído", o ato
      // foi desmarcar, e desmarcar não é candidato a aprovar.
      checklist(3, 0);

      const resultado = await servico.alternar(5, false, admin());

      expect(resultado.etapaAprovada).toBe(false);
      expect(banco.tx.certificacaoProduto.update).not.toHaveBeenCalled();
    });

    it('etapa SEM checklist nunca é aprovada por este caminho', async () => {
      banco.prisma.microEtapaCertificacao.findUnique.mockResolvedValue(
        microNoBanco() as never,
      );
      banco.prisma.microEtapaCertificacao.groupBy.mockResolvedValue([] as never);

      const resultado = await servico.alternar(5, true, admin());

      expect(resultado.etapaAprovada).toBe(false);
      expect(resultado.total).toBe(0);
    });

    it('processo em aprovação MANUAL completa o checklist e não aprova', async () => {
      banco.prisma.microEtapaCertificacao.findUnique.mockResolvedValue(
        microNoBanco({ aprovacaoProduto: false, aprovacaoTrilha: true }) as never,
      );
      checklist(3, 0);

      const resultado = await servico.alternar(5, true, admin());

      expect(resultado.etapaAprovada).toBe(false);
      // O aviso é obrigatório: sem ele, marcar o último item não faz nada e
      // ninguém entende por quê.
      expect(resultado.aviso).toMatch(/manualmente/i);
      expect(banco.tx.certificacaoProduto.update).not.toHaveBeenCalled();
    });

    it('exigeDocumento SEGURA a aprovação automática e explica', async () => {
      // A automação não pode furar a regra que `salvar()` protege: etapa que
      // exige evidência não é aprovada sem anexo, por caminho nenhum.
      banco.prisma.microEtapaCertificacao.findUnique.mockResolvedValue(
        microNoBanco({ exigeDocumento: true }) as never,
      );
      checklist(3, 0);
      documentos.etapasSemDocumento.mockResolvedValue(['Ensaios laboratoriais']);

      const resultado = await servico.alternar(5, true, admin());

      expect(resultado.etapaAprovada).toBe(false);
      expect(resultado.aviso).toMatch(/evidência/i);
      expect(banco.tx.certificacaoProduto.update).not.toHaveBeenCalled();
    });

    it('com evidência anexada, a etapa que exige documento aprova', async () => {
      banco.prisma.microEtapaCertificacao.findUnique.mockResolvedValue(
        microNoBanco({ exigeDocumento: true }) as never,
      );
      checklist(3, 0);
      documentos.etapasSemDocumento.mockResolvedValue([]);

      const resultado = await servico.alternar(5, true, admin());

      expect(resultado.etapaAprovada).toBe(true);
    });

    it('status e histórico saem no MESMO commit', async () => {
      banco.prisma.microEtapaCertificacao.findUnique.mockResolvedValue(
        microNoBanco() as never,
      );
      checklist(1, 0);

      await servico.alternar(5, true, admin());

      // Fora do commit, uma falha deixaria a etapa aprovada sem rastro de quem
      // a aprovou.
      expect(banco.chamadasNaTransacao).toEqual([
        'certificacaoProduto.update',
        'certificacaoHistorico.create',
      ]);
      expect(banco.prisma.certificacaoProduto.update).not.toHaveBeenCalled();
    });
  });
});

/**
 * A resolução da política é o ponto único da regra. `null` no produto NÃO é
 * "não": é "herda a trilha" — e confundir os dois faz um processo que ninguém
 * configurou parar de acompanhar a política do processo.
 */
describe('aprovacaoAutomaticaDoProduto', () => {
  const comTrilha = (
    aprovacaoAutomatica: boolean | null,
    trilha: boolean,
  ) => ({
    aprovacaoAutomatica,
    modeloTrilha: { aprovacaoAutomatica: trilha },
  });

  it('null no produto HERDA a trilha, nos dois valores', () => {
    expect(aprovacaoAutomaticaDoProduto(comTrilha(null, true))).toBe(true);
    expect(aprovacaoAutomaticaDoProduto(comTrilha(null, false))).toBe(false);
  });

  it('o produto sobrepõe a trilha quando opinou', () => {
    expect(aprovacaoAutomaticaDoProduto(comTrilha(false, true))).toBe(false);
    expect(aprovacaoAutomaticaDoProduto(comTrilha(true, false))).toBe(true);
  });

  it('`false` no produto é decisão, não ausência', () => {
    // O caso que um `Boolean` com default `false` não conseguiria expressar:
    // aqui a trilha aprova sozinha e ESTE processo foi desligado à mão.
    expect(aprovacaoAutomaticaDoProduto(comTrilha(false, true))).toBe(false);
  });
});
