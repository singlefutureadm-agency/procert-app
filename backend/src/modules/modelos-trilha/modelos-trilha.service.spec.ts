import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TipoEtapa } from '@prisma/client';

import { ModelosTrilhaService } from './modelos-trilha.service';
import { PrismaService } from '../../prisma/prisma.service';
import { criarPrismaMock, PrismaMock } from '../../testing/prisma.mock';

const CATEGORIA = 3;

const etapaDoModelo = (
  nome: string,
  ordem: number,
  extra: Record<string, unknown> = {},
) => ({
  id: 900 + ordem,
  modeloTrilhaId: 80,
  nome,
  descricao: null,
  tipo: TipoEtapa.DOCUMENTAL,
  obrigatoria: true,
  prazoSlaDias: null,
  exigeDocumento: false,
  ordem,
  ...extra,
});

describe('ModelosTrilhaService', () => {
  let servico: ModelosTrilhaService;
  let banco: PrismaMock;

  beforeEach(() => {
    jest.clearAllMocks();
    banco = criarPrismaMock();
    banco.prisma.categoriaProduto.findUnique.mockResolvedValue({
      id: CATEGORIA,
      nome: 'Material elétrico',
    } as never);

    servico = new ModelosTrilhaService(banco.prisma as unknown as PrismaService);
  });

  describe('criarVersao — cópia das etapas e encerramento da anterior', () => {
    const vigente = {
      id: 80,
      versao: 1,
      categoriaId: CATEGORIA,
      ativo: true,
      etapas: [
        etapaDoModelo('Análise documental', 1),
        etapaDoModelo('Ensaios laboratoriais', 2, {
          exigeDocumento: true,
          prazoSlaDias: 15,
          descricao: 'Laudo do laboratório acreditado',
        }),
      ],
    };

    beforeEach(() => {
      banco.prisma.modeloTrilha.findFirst.mockResolvedValue(vigente as never);
      banco.prisma.modeloTrilha.aggregate.mockResolvedValue({
        _max: { versao: 1 },
      } as never);
      banco.tx.modeloTrilha.create.mockResolvedValue({
        id: 90,
        versao: 2,
        etapas: [],
        _count: { produtos: 0 },
      } as never);
    });

    it('sem `etapas` no payload, COPIA as da versão vigente preservando os atributos', async () => {
      await servico.criarVersao(CATEGORIA, {});

      const [{ data }] = banco.tx.modeloTrilha.create.mock.calls[0];
      const criadas = (data.etapas as { create: Array<Record<string, unknown>> })
        .create;

      expect(criadas).toEqual([
        expect.objectContaining({
          nome: 'Análise documental',
          obrigatoria: true,
          exigeDocumento: false,
          ordem: 1,
        }),
        expect.objectContaining({
          nome: 'Ensaios laboratoriais',
          exigeDocumento: true,
          prazoSlaDias: 15,
          descricao: 'Laudo do laboratório acreditado',
          ordem: 2,
        }),
      ]);
      // Os ids da versão anterior NÃO são copiados: cada versão tem
      // `ModeloEtapa` próprias, e é por isso que a comparação entre versões é
      // feita por nome em `CertificacoesService`.
      expect(criadas[0]).not.toHaveProperty('id');
    });

    it('encerra a versão anterior e cria a nova NA MESMA transação', async () => {
      await servico.criarVersao(CATEGORIA, {});

      expect(banco.tx.modeloTrilha.updateMany).toHaveBeenCalledWith({
        where: { categoriaId: CATEGORIA, ativo: true },
        data: { ativo: false, vigenteAte: expect.any(Date) },
      });

      // A categoria nunca pode ter duas versões vigentes: se o encerramento
      // ficasse fora do commit da criação, uma falha no meio deixaria duas.
      expect(banco.chamadasForaDaTransacao).toEqual([]);
      expect(banco.chamadasNaTransacao).toEqual([
        'modeloTrilha.updateMany',
        'modeloTrilha.create',
      ]);
    });

    it('numera a versão a partir do MAIOR `versao` da categoria', async () => {
      banco.prisma.modeloTrilha.aggregate.mockResolvedValue({
        _max: { versao: 7 },
      } as never);

      await servico.criarVersao(CATEGORIA, {});

      const [{ data }] = banco.tx.modeloTrilha.create.mock.calls[0];
      expect(data.versao).toBe(8);
      expect(data.ativo).toBe(true);
    });

    it('primeira versão da categoria nasce como 1', async () => {
      banco.prisma.modeloTrilha.findFirst.mockResolvedValue(null as never);
      banco.prisma.modeloTrilha.aggregate.mockResolvedValue({
        _max: { versao: null },
      } as never);

      await servico.criarVersao(CATEGORIA, {
        etapas: [
          { nome: 'Análise documental', tipo: TipoEtapa.DOCUMENTAL, obrigatoria: true },
        ],
      });

      const [{ data }] = banco.tx.modeloTrilha.create.mock.calls[0];
      expect(data.versao).toBe(1);
      // Sem versão anterior não há o que encerrar.
      expect(banco.tx.modeloTrilha.updateMany).not.toHaveBeenCalled();
    });

    it('recusa versão sem etapas quando não há anterior para copiar', async () => {
      banco.prisma.modeloTrilha.findFirst.mockResolvedValue(null as never);

      await expect(servico.criarVersao(CATEGORIA, {})).rejects.toThrow(
        new BadRequestException(
          'Informe as etapas da nova versão: não há versão anterior para copiar.',
        ),
      );
      expect(banco.transacoesAbertas).toBe(0);
    });

    it('etapas do payload são numeradas 1..N na ordem em que chegaram', async () => {
      await servico.criarVersao(CATEGORIA, {
        etapas: [
          { nome: 'Auditoria de fábrica', tipo: TipoEtapa.AUDITORIA_FABRICA, obrigatoria: true },
          { nome: 'Análise documental', tipo: TipoEtapa.DOCUMENTAL, obrigatoria: true },
          { nome: 'Decisão', tipo: TipoEtapa.DECISAO, obrigatoria: true },
        ],
      });

      const [{ data }] = banco.tx.modeloTrilha.create.mock.calls[0];
      const criadas = (data.etapas as { create: Array<Record<string, unknown>> })
        .create;
      expect(criadas.map((e) => [e.nome, e.ordem])).toEqual([
        ['Auditoria de fábrica', 1],
        ['Análise documental', 2],
        ['Decisão', 3],
      ]);
    });

    it('recusa categoria inexistente antes de qualquer escrita', async () => {
      banco.prisma.categoriaProduto.findUnique.mockResolvedValue(null as never);

      await expect(servico.criarVersao(999, {})).rejects.toThrow(
        new NotFoundException('Categoria 999 não encontrada.'),
      );
      expect(banco.transacoesAbertas).toBe(0);
    });
  });

  describe('imutabilidade da versão em uso', () => {
    it('substituirEtapas devolve 409 e orienta a versionar', async () => {
      banco.prisma.modeloTrilha.findUnique.mockResolvedValue({
        id: 80,
        _count: { produtos: 12 },
      } as never);

      await expect(
        servico.substituirEtapas(80, {
          etapas: [
            { nome: 'Nova etapa', tipo: TipoEtapa.DOCUMENTAL, obrigatoria: true },
          ],
        }),
      ).rejects.toThrow(
        new ConflictException(
          'Esta versão já está em uso por 12 produto(s) e não pode ser alterada. ' +
            'Crie uma nova versão da trilha para mudar o processo.',
        ),
      );
      expect(banco.prisma.modeloEtapa.deleteMany).not.toHaveBeenCalled();
    });

    it('reordenarEtapas também é barrado em versão em uso', async () => {
      banco.prisma.modeloTrilha.findUnique.mockResolvedValue({
        id: 80,
        _count: { produtos: 1 },
      } as never);

      await expect(
        servico.reordenarEtapas(80, { ordem: [901, 902] }),
      ).rejects.toThrow(ConflictException);
    });

    it('versão SEM produto vinculado continua editável', async () => {
      banco.prisma.modeloTrilha.findUnique.mockResolvedValue({
        id: 90,
        _count: { produtos: 0 },
        etapas: [],
        categoria: { id: CATEGORIA },
      } as never);

      await servico.substituirEtapas(90, {
        etapas: [
          { nome: 'Análise documental', tipo: TipoEtapa.DOCUMENTAL, obrigatoria: true },
        ],
      });

      // Apagar e recriar precisa ser atômico: sem isso, uma falha no meio
      // deixaria a versão sem etapa nenhuma.
      expect(banco.transacoesAbertas).toBe(1);
      expect(banco.prisma.modeloEtapa.deleteMany).toHaveBeenCalledWith({
        where: { modeloTrilhaId: 90 },
      });
    });

    it('`editavel` acompanha a contagem de produtos', async () => {
      banco.prisma.modeloTrilha.findUnique.mockResolvedValue({
        id: 80,
        versao: 1,
        etapas: [],
        categoria: { id: CATEGORIA },
        _count: { produtos: 4 },
      } as never);

      const modelo = await servico.buscarPorId(80);

      expect(modelo).toMatchObject({ totalProdutos: 4, editavel: false });
      expect(modelo).not.toHaveProperty('_count');
    });
  });

  describe('reordenarEtapas — validação', () => {
    beforeEach(() => {
      banco.prisma.modeloTrilha.findUnique.mockResolvedValue({
        id: 90,
        versao: 2,
        etapas: [],
        categoria: { id: CATEGORIA },
        _count: { produtos: 0 },
      } as never);
      banco.prisma.modeloEtapa.findMany.mockResolvedValue([
        { id: 901 },
        { id: 902 },
      ] as never);
    });

    it('recusa id que não pertence ao modelo', async () => {
      await expect(
        servico.reordenarEtapas(90, { ordem: [901, 999] }),
      ).rejects.toThrow(
        new BadRequestException(
          'Etapas que não pertencem a este modelo: 999.',
        ),
      );
    });

    it('recusa ordenação parcial', async () => {
      await expect(
        servico.reordenarEtapas(90, { ordem: [901] }),
      ).rejects.toThrow(
        new BadRequestException(
          'A ordenação precisa conter todas as etapas do modelo.',
        ),
      );
    });

    it('grava a nova ordem 1..N em transação', async () => {
      await servico.reordenarEtapas(90, { ordem: [902, 901] });

      expect(banco.prisma.modeloEtapa.update).toHaveBeenNthCalledWith(1, {
        where: { id: 902 },
        data: { ordem: 1 },
      });
      expect(banco.prisma.modeloEtapa.update).toHaveBeenNthCalledWith(2, {
        where: { id: 901 },
        data: { ordem: 2 },
      });
      expect(banco.transacoesAbertas).toBe(1);
    });
  });

  describe('resolverVigente', () => {
    it('devolve a versão ativa de maior número', async () => {
      const vigente = { id: 90, versao: 2, etapas: [etapaDoModelo('Análise', 1)] };
      banco.prisma.modeloTrilha.findFirst.mockResolvedValue(vigente as never);

      await expect(servico.resolverVigente(CATEGORIA)).resolves.toBe(vigente);
      expect(banco.prisma.modeloTrilha.findFirst).toHaveBeenCalledWith({
        where: { categoriaId: CATEGORIA, ativo: true },
        include: { etapas: { orderBy: { ordem: 'asc' } } },
        orderBy: { versao: 'desc' },
      });
    });

    it('recusa categoria sem modelo vigente', async () => {
      banco.prisma.modeloTrilha.findFirst.mockResolvedValue(null as never);

      await expect(servico.resolverVigente(CATEGORIA)).rejects.toThrow(
        new BadRequestException(
          'Esta categoria ainda não tem um modelo de trilha vigente com etapas. ' +
            'Cadastre o modelo antes de submeter produtos.',
        ),
      );
    });

    it('recusa modelo vigente SEM etapas — produto não pode nascer sem trilha', async () => {
      banco.prisma.modeloTrilha.findFirst.mockResolvedValue({
        id: 90,
        versao: 2,
        etapas: [],
      } as never);

      await expect(servico.resolverVigente(CATEGORIA)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
