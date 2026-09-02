import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { StatusRegistro, TipoEtapa } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { criarPrismaMock, PrismaMock } from '../../testing/prisma.mock';
import { TrilhasService } from './trilhas.service';

const TRILHA = 5;

/** Payload mínimo que `INCLUDE_TRILHA` devolve, para `comResumo` não quebrar. */
const trilhaPersistida = (extra: Record<string, unknown> = {}) => ({
  id: TRILHA,
  nome: 'Ensaio + auditoria',
  descricao: null,
  status: StatusRegistro.ATIVO,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
  versoes: [],
  categorias: [],
  ...extra,
});

const versao = (
  id: number,
  numero: number,
  ativo: boolean,
  etapas = 3,
  produtos = 0,
) => ({
  id,
  versao: numero,
  ativo,
  vigenteDe: new Date(),
  vigenteAte: ativo ? null : new Date(),
  _count: { etapas, produtos },
});

describe('TrilhasService', () => {
  let servico: TrilhasService;
  let banco: PrismaMock;

  beforeEach(() => {
    jest.clearAllMocks();
    banco = criarPrismaMock();
    servico = new TrilhasService(banco.prisma as unknown as PrismaService);
  });

  describe('criar', () => {
    it('recusa nome duplicado antes de escrever', async () => {
      banco.prisma.trilha.findUnique.mockResolvedValue({ id: 9 } as never);

      await expect(servico.criar({ nome: 'Ensaio + auditoria' })).rejects.toThrow(
        new ConflictException('Já existe uma trilha com este nome.'),
      );
      expect(banco.prisma.trilha.create).not.toHaveBeenCalled();
    });

    it('com etapas no corpo, a v1 nasce NO MESMO create, numerada 1..N', async () => {
      banco.prisma.trilha.findUnique.mockResolvedValue(null as never);
      banco.prisma.trilha.create.mockResolvedValue(trilhaPersistida() as never);

      await servico.criar({
        nome: 'Ensaio + auditoria',
        etapas: [
          { nome: 'Ensaios', tipo: TipoEtapa.ENSAIO },
          { nome: 'Auditoria', tipo: TipoEtapa.AUDITORIA_FABRICA },
          { nome: 'Decisão', tipo: TipoEtapa.DECISAO },
        ],
      });

      const dados = banco.prisma.trilha.create.mock.calls[0][0].data as {
        versoes: { create: { versao: number; etapas: { create: unknown[] } } };
      };

      // Trilha e v1 no mesmo comando: separá-las deixaria a tela criar um item
      // de catálogo sem versão, que nenhuma categoria consegue usar.
      expect(dados.versoes.create.versao).toBe(1);
      expect(dados.versoes.create.etapas.create).toEqual([
        expect.objectContaining({ nome: 'Ensaios', ordem: 1 }),
        expect.objectContaining({ nome: 'Auditoria', ordem: 2 }),
        expect.objectContaining({ nome: 'Decisão', ordem: 3 }),
      ]);
    });

    it('sem etapas, cria só a família — sem versão fantasma', async () => {
      banco.prisma.trilha.findUnique.mockResolvedValue(null as never);
      banco.prisma.trilha.create.mockResolvedValue(trilhaPersistida() as never);

      await servico.criar({ nome: 'Rascunho' });

      const dados = banco.prisma.trilha.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(dados).not.toHaveProperty('versoes');
    });
  });

  describe('comResumo — o que a listagem publica', () => {
    it('soma os produtos de TODAS as versões e aponta a vigente', async () => {
      banco.prisma.trilha.findUnique.mockResolvedValue(
        trilhaPersistida({
          versoes: [versao(92, 3, true, 5, 2), versao(91, 2, false, 4, 7)],
          categorias: [{ id: 1, nome: 'EPIs', status: StatusRegistro.ATIVO }],
        }) as never,
      );

      const trilha = (await servico.buscarPorId(TRILHA)) as {
        totalProdutos: number;
        totalVersoes: number;
        totalCategorias: number;
        modeloVigente: { id: number; versao: number } | null;
        versoes: Array<{ editavel: boolean }>;
      };

      // A pergunta "posso excluir esta trilha?" depende do total em TODAS as
      // versões, não só na vigente: uma v2 encerrada com 7 produtos ainda a
      // prende.
      expect(trilha.totalProdutos).toBe(9);
      expect(trilha.totalVersoes).toBe(2);
      expect(trilha.totalCategorias).toBe(1);
      expect(trilha.modeloVigente).toMatchObject({ id: 92, versao: 3 });
      expect(trilha.versoes.map((v) => v.editavel)).toEqual([false, false]);
    });

    it('sem versão vigente, modeloVigente é null (e não a mais recente)', async () => {
      banco.prisma.trilha.findUnique.mockResolvedValue(
        trilhaPersistida({ versoes: [versao(91, 2, false)] }) as never,
      );

      const trilha = (await servico.buscarPorId(TRILHA)) as {
        modeloVigente: unknown;
      };
      expect(trilha.modeloVigente).toBeNull();
    });
  });

  describe('alterarStatus', () => {
    it('recusa desativar trilha vinculada a categorias, nomeando-as', async () => {
      banco.prisma.trilha.findUnique.mockResolvedValue({ id: TRILHA } as never);
      banco.prisma.categoriaProduto.findMany.mockResolvedValue([
        { nome: 'EPIs' },
        { nome: 'Brinquedos' },
      ] as never);

      await expect(
        servico.alterarStatus(TRILHA, StatusRegistro.INATIVO),
      ).rejects.toThrow(
        // Nomear as categorias é o que torna o erro acionável: sem isso o
        // usuário teria de abrir todas para descobrir quais travam.
        /EPIs, Brinquedos/,
      );
      expect(banco.prisma.trilha.update).not.toHaveBeenCalled();
    });

    it('reativar não passa pela checagem de vínculo', async () => {
      banco.prisma.trilha.findUnique.mockResolvedValue({ id: TRILHA } as never);
      banco.prisma.trilha.update.mockResolvedValue(trilhaPersistida() as never);

      await servico.alterarStatus(TRILHA, StatusRegistro.ATIVO);

      expect(banco.prisma.categoriaProduto.findMany).not.toHaveBeenCalled();
      expect(banco.prisma.trilha.update).toHaveBeenCalled();
    });
  });

  describe('remover', () => {
    it('recusa quando há categoria vinculada', async () => {
      banco.prisma.trilha.findUnique.mockResolvedValue({
        id: TRILHA,
        categorias: [{ nome: 'EPIs' }],
        versoes: [],
      } as never);

      await expect(servico.remover(TRILHA)).rejects.toThrow(ConflictException);
      expect(banco.prisma.trilha.delete).not.toHaveBeenCalled();
    });

    it('recusa quando alguma versão tem produtos, mesmo encerrada', async () => {
      banco.prisma.trilha.findUnique.mockResolvedValue({
        id: TRILHA,
        categorias: [],
        versoes: [{ _count: { produtos: 0 } }, { _count: { produtos: 4 } }],
      } as never);

      await expect(servico.remover(TRILHA)).rejects.toThrow(
        /4 produto\(s\) em avaliação/,
      );
      expect(banco.prisma.trilha.delete).not.toHaveBeenCalled();
    });

    it('exclui quando não há vínculo nem produto', async () => {
      banco.prisma.trilha.findUnique.mockResolvedValue({
        id: TRILHA,
        categorias: [],
        versoes: [{ _count: { produtos: 0 } }],
      } as never);

      await expect(servico.remover(TRILHA)).resolves.toEqual({
        mensagem: 'Trilha excluída definitivamente.',
      });
      expect(banco.prisma.trilha.delete).toHaveBeenCalledWith({
        where: { id: TRILHA },
      });
    });
  });

  describe('duplicar', () => {
    const origem = {
      id: 91,
      etapas: [
        {
          nome: 'Ensaios',
          descricao: 'Laudo do laboratório',
          tipo: TipoEtapa.ENSAIO,
          obrigatoria: true,
          prazoSlaDias: 15,
          exigeDocumento: true,
        },
        {
          nome: 'Decisão',
          descricao: null,
          tipo: TipoEtapa.DECISAO,
          obrigatoria: true,
          prazoSlaDias: null,
          exigeDocumento: false,
        },
      ],
    };

    it('copia as etapas da vigente como v1 de uma trilha NOVA', async () => {
      banco.prisma.trilha.findUnique
        .mockResolvedValueOnce({ id: TRILHA } as never)
        .mockResolvedValueOnce(null as never);
      banco.prisma.modeloTrilha.findFirst.mockResolvedValue(origem as never);
      banco.prisma.trilha.create.mockResolvedValue(trilhaPersistida() as never);

      await servico.duplicar(TRILHA, { nome: 'Ensaio + auditoria (linha branca)' });

      const dados = banco.prisma.trilha.create.mock.calls[0][0].data as {
        versoes: { create: { etapas: { create: Array<Record<string, unknown>> } } };
      };
      const copiadas = dados.versoes.create.etapas.create;

      // Cópia com os atributos, não só os nomes: perder prazo e exigência de
      // documento faria a trilha nova parecer igual e avaliar diferente.
      expect(copiadas).toEqual([
        expect.objectContaining({
          nome: 'Ensaios',
          prazoSlaDias: 15,
          exigeDocumento: true,
          ordem: 1,
        }),
        expect.objectContaining({ nome: 'Decisão', ordem: 2 }),
      ]);
      // `descricao: null` do banco vira `undefined` na entrada — passar null
      // adiante estouraria o `@IsString()` de quem reusa o DTO.
      expect(copiadas[1].descricao).toBeUndefined();
    });

    it('recusa nome já usado', async () => {
      banco.prisma.trilha.findUnique
        .mockResolvedValueOnce({ id: TRILHA } as never)
        .mockResolvedValueOnce({ id: 9 } as never);

      await expect(
        servico.duplicar(TRILHA, { nome: 'Ensaio + auditoria' }),
      ).rejects.toThrow(ConflictException);
      expect(banco.prisma.modeloTrilha.findFirst).not.toHaveBeenCalled();
    });

    it('recusa quando a versão de origem não tem etapas', async () => {
      banco.prisma.trilha.findUnique
        .mockResolvedValueOnce({ id: TRILHA } as never)
        .mockResolvedValueOnce(null as never);
      banco.prisma.modeloTrilha.findFirst.mockResolvedValue({
        id: 91,
        etapas: [],
      } as never);

      await expect(servico.duplicar(TRILHA, { nome: 'Vazia' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('sem versão vigente, orienta em vez de criar trilha vazia', async () => {
      banco.prisma.trilha.findUnique
        .mockResolvedValueOnce({ id: TRILHA } as never)
        .mockResolvedValueOnce(null as never);
      banco.prisma.modeloTrilha.findFirst.mockResolvedValue(null as never);

      await expect(servico.duplicar(TRILHA, { nome: 'Nova' })).rejects.toThrow(
        NotFoundException,
      );
      expect(banco.prisma.trilha.create).not.toHaveBeenCalled();
    });
  });

  describe('vincularCategorias', () => {
    it('recusa o lote inteiro quando alguma categoria não existe', async () => {
      banco.prisma.trilha.findUnique.mockResolvedValue({ id: TRILHA } as never);
      banco.prisma.categoriaProduto.findMany.mockResolvedValue([
        { id: 1 },
      ] as never);

      await expect(
        servico.vincularCategorias(TRILHA, { categoriaIds: [1, 4, 7] }),
      ).rejects.toThrow(/4, 7/);
      // Vínculo parcial silencioso é pior que erro: o usuário veria "salvo" e
      // duas categorias continuariam sem trilha.
      expect(banco.prisma.categoriaProduto.updateMany).not.toHaveBeenCalled();
    });

    it('aplica a trilha ao lote validado', async () => {
      banco.prisma.trilha.findUnique
        .mockResolvedValueOnce({ id: TRILHA } as never)
        .mockResolvedValue(trilhaPersistida() as never);
      banco.prisma.categoriaProduto.findMany.mockResolvedValue([
        { id: 1 },
        { id: 4 },
      ] as never);

      await servico.vincularCategorias(TRILHA, { categoriaIds: [1, 4] });

      expect(banco.prisma.categoriaProduto.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 4] } },
        data: { trilhaId: TRILHA },
      });
    });
  });

  describe('listarResumido — o select de vínculo', () => {
    it('marca como null a trilha sem versão vigente', async () => {
      banco.prisma.trilha.findMany.mockResolvedValue([
        { id: 1, nome: 'Com versão', versoes: [{ id: 9, versao: 2, _count: { etapas: 4 } }] },
        { id: 2, nome: 'Sem versão', versoes: [] },
      ] as never);

      const resumo = await servico.listarResumido();

      expect(resumo[0].modeloVigente).toMatchObject({ versao: 2, totalEtapas: 4 });
      // A tela usa esse null para desabilitar a opção: vincular uma trilha sem
      // versão deixaria a categoria aparentemente pronta e recusando produto.
      expect(resumo[1].modeloVigente).toBeNull();
    });
  });
});
