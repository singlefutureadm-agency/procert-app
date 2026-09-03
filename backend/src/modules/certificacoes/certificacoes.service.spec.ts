import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { StatusCertificacao, TipoEtapa } from '@prisma/client';
import { mockDeep } from 'jest-mock-extended';

import { CertificacoesService } from './certificacoes.service';
import { DocumentosCertificacaoService } from './documentos.service';
import { NotificacoesService } from '../mail/notificacoes.service';
import { NaoConformidadesService } from '../nao-conformidades/nao-conformidades.service';
import { PrismaService } from '../../prisma/prisma.service';
import { criarPrismaMock, PrismaMock } from '../../testing/prisma.mock';
import { admin, cliente, funcionario } from '../../testing/usuarios.fixture';

const CLIENTE_DONO = 100;
/** Trilha do catálogo à qual a categoria do produto sob teste está vinculada. */
const TRILHA = 55;
const CLIENTE_ALHEIO = 200;

/** Resposta mínima de `detalharPorProduto`, chamado ao fim de `salvar`. */
const detalheDoProduto = () => ({
  id: 1,
  nome: 'Disjuntor DIN 25A',
  descricao: null,
  fotoUrl: null,
  clienteId: CLIENTE_DONO,
  cliente: {
    id: CLIENTE_DONO,
    nome: 'Indústria Cliente Ltda',
    email: 'contato@cliente.com.br',
    telefone: null,
    fotoUrl: null,
  },
  certificacao: [],
});

describe('CertificacoesService', () => {
  let servico: CertificacoesService;
  let banco: PrismaMock;
  let naoConformidades: jest.Mocked<NaoConformidadesService>;
  let documentos: jest.Mocked<DocumentosCertificacaoService>;
  let notificacoes: jest.Mocked<NotificacoesService>;

  beforeEach(() => {
    jest.clearAllMocks();

    banco = criarPrismaMock();
    naoConformidades = mockDeep<NaoConformidadesService>();
    documentos = mockDeep<DocumentosCertificacaoService>();
    notificacoes = mockDeep<NotificacoesService>();

    documentos.etapasSemDocumento.mockResolvedValue([]);
    notificacoes.certificacaoAtualizada.mockResolvedValue(undefined);
    banco.prisma.produto.findUnique.mockResolvedValue(
      detalheDoProduto() as never,
    );

    servico = new CertificacoesService(
      banco.prisma as unknown as PrismaService,
      naoConformidades,
      documentos,
      notificacoes,
    );
  });

  // ------------------------------------------------------------------ salvar

  describe('salvar — escopo de papel', () => {
    it('CLIENTE recebe ForbiddenException na escrita: acompanha, não altera', async () => {
      await expect(
        servico.salvar(
          1,
          { etapas: [{ id: 10, status: StatusCertificacao.APROVADO }] },
          cliente(CLIENTE_DONO),
        ),
      ).rejects.toThrow(
        new ForbiddenException(
          'Clientes podem acompanhar, mas não alterar a certificação.',
        ),
      );

      // Recusa ANTES de qualquer leitura: o dono do produto também não escreve.
      expect(banco.prisma.certificacaoProduto.findMany).not.toHaveBeenCalled();
      expect(banco.transacoesAbertas).toBe(0);
    });

    it('FUNCIONARIO escreve normalmente', async () => {
      banco.prisma.certificacaoProduto.findMany.mockResolvedValue([
        {
          id: 10,
          status: StatusCertificacao.PENDENTE,
          observacao: null,
          etapa: { nome: 'Análise documental' },
        },
      ] as never);

      await expect(
        servico.salvar(
          1,
          { etapas: [{ id: 10, status: StatusCertificacao.EM_ANDAMENTO }] },
          funcionario(),
        ),
      ).resolves.toBeDefined();
      expect(banco.tx.certificacaoProduto.update).toHaveBeenCalled();
    });
  });

  describe('salvar — validação das etapas', () => {
    beforeEach(() => {
      banco.prisma.certificacaoProduto.findMany.mockResolvedValue([
        {
          id: 10,
          status: StatusCertificacao.PENDENTE,
          observacao: null,
          etapa: { nome: 'Análise documental' },
        },
        {
          id: 11,
          status: StatusCertificacao.PENDENTE,
          observacao: null,
          etapa: { nome: 'Ensaios laboratoriais' },
        },
      ] as never);
    });

    it('recusa etapa que pertence a OUTRO produto, nomeando os ids', async () => {
      await expect(
        servico.salvar(
          1,
          {
            etapas: [
              { id: 10, status: StatusCertificacao.APROVADO },
              { id: 99, status: StatusCertificacao.APROVADO },
            ],
          },
          admin(),
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Etapas que não pertencem a este produto: 99.',
        ),
      );
      // Recusa antes de gravar metade do lote.
      expect(banco.transacoesAbertas).toBe(0);
    });

    it('recusa produto sem nenhuma certificação aberta', async () => {
      banco.prisma.certificacaoProduto.findMany.mockResolvedValue([] as never);

      await expect(
        servico.salvar(
          7,
          { etapas: [{ id: 10, status: StatusCertificacao.APROVADO }] },
          admin(),
        ),
      ).rejects.toThrow(
        new NotFoundException(
          'Nenhuma certificação encontrada para o produto 7.',
        ),
      );
    });

    it('no-op: mesmo status e mesma observação não gravam histórico', async () => {
      await servico.salvar(
        1,
        {
          etapas: [
            { id: 10, status: StatusCertificacao.PENDENTE },
            { id: 11, status: StatusCertificacao.PENDENTE },
          ],
        },
        admin(),
      );

      // A transação abre, mas o laço não encontra nada a fazer.
      expect(banco.tx.certificacaoProduto.update).not.toHaveBeenCalled();
      expect(banco.tx.certificacaoHistorico.create).not.toHaveBeenCalled();
      // Sem mudança de status, o cliente também não recebe e-mail.
      expect(notificacoes.certificacaoAtualizada).not.toHaveBeenCalled();
    });

    it('mudar só a observação grava histórico, mas não notifica o cliente', async () => {
      await servico.salvar(
        1,
        {
          etapas: [
            {
              id: 10,
              status: StatusCertificacao.PENDENTE,
              observacao: 'Aguardando desenho técnico',
            },
          ],
        },
        admin(),
      );

      expect(banco.tx.certificacaoHistorico.create).toHaveBeenCalledTimes(1);
      expect(notificacoes.certificacaoAtualizada).not.toHaveBeenCalled();
    });
  });

  describe('salvar — evidência obrigatória', () => {
    beforeEach(() => {
      banco.prisma.certificacaoProduto.findMany.mockResolvedValue([
        {
          id: 10,
          status: StatusCertificacao.EM_ANDAMENTO,
          observacao: null,
          etapa: { nome: 'Ensaios laboratoriais' },
        },
      ] as never);
    });

    it('bloqueia a aprovação de etapa com exigeDocumento e sem anexo', async () => {
      documentos.etapasSemDocumento.mockResolvedValue([
        'Ensaios laboratoriais',
      ]);

      await expect(
        servico.salvar(
          1,
          { etapas: [{ id: 10, status: StatusCertificacao.APROVADO }] },
          admin(),
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Estas etapas exigem documento anexado antes da aprovação: Ensaios laboratoriais.',
        ),
      );
      expect(banco.transacoesAbertas).toBe(0);
    });

    it('só consulta evidência das etapas que estão VIRANDO aprovadas', async () => {
      banco.prisma.certificacaoProduto.findMany.mockResolvedValue([
        {
          id: 10,
          status: StatusCertificacao.APROVADO, // já estava aprovada
          observacao: null,
          etapa: { nome: 'Análise documental' },
        },
        {
          id: 11,
          status: StatusCertificacao.EM_ANDAMENTO,
          observacao: null,
          etapa: { nome: 'Ensaios laboratoriais' },
        },
      ] as never);

      await servico.salvar(
        1,
        {
          etapas: [
            { id: 10, status: StatusCertificacao.APROVADO },
            { id: 11, status: StatusCertificacao.APROVADO },
          ],
        },
        admin(),
      );

      // Reaprovar o que já estava aprovado não pode exigir anexo de novo.
      expect(documentos.etapasSemDocumento).toHaveBeenCalledWith([11]);
    });

    it('reprovar etapa com exigeDocumento não pede anexo', async () => {
      await servico.salvar(
        1,
        { etapas: [{ id: 10, status: StatusCertificacao.REPROVADO }] },
        admin(),
      );

      expect(documentos.etapasSemDocumento).toHaveBeenCalledWith([]);
    });
  });

  describe('salvar — não conformidade', () => {
    beforeEach(() => {
      banco.prisma.certificacaoProduto.findMany.mockResolvedValue([
        {
          id: 10,
          status: StatusCertificacao.EM_ANDAMENTO,
          observacao: null,
          etapa: { nome: 'Ensaios laboratoriais' },
        },
      ] as never);
      // Espelha o serviço real: ele grava a NC pelo cliente que recebeu. É o
      // que permite provar a atomicidade — se `salvar` passar o prisma raiz em
      // vez do `tx`, a escrita sai da transação e o teste abaixo quebra.
      naoConformidades.criarRegistro.mockImplementation(
        async (certificacaoId, dto, autor, tx) =>
          ((tx ?? banco.prisma) as PrismaService).naoConformidade.create({
            data: {
              certificacaoId,
              codigo: 'NC-2026-000001',
              descricao: dto.descricao,
              criticidade: dto.criticidade,
              abertoPorNome: autor.nome,
            },
          }) as never,
      );
      banco.tx.naoConformidade.create.mockResolvedValue({ id: 500 } as never);
    });

    it.each([
      [StatusCertificacao.APROVADO],
      [StatusCertificacao.PENDENTE],
      [StatusCertificacao.EM_ANDAMENTO],
    ])('recusa NC em etapa %s — só cabe em REPROVADO', async (status) => {
      await expect(
        servico.salvar(
          1,
          {
            etapas: [
              {
                id: 10,
                status,
                naoConformidade: {
                  descricao: 'Ensaio de aquecimento fora do limite',
                  criticidade: 'MAIOR',
                },
              },
            ],
          },
          admin(),
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Não conformidade só pode ser registrada em etapa reprovada: verifique as etapas 10.',
        ),
      );
      expect(banco.transacoesAbertas).toBe(0);
    });

    it('a NC nasce no MESMO commit da reprovação — ou as duas coisas, ou nenhuma', async () => {
      await servico.salvar(
        1,
        {
          etapas: [
            {
              id: 10,
              status: StatusCertificacao.REPROVADO,
              naoConformidade: {
                descricao: 'Ensaio de aquecimento fora do limite',
                criticidade: 'MAIOR',
              },
            },
          ],
        },
        admin(),
      );

      const [alvo, dados, autor, txRecebido] =
        naoConformidades.criarRegistro.mock.calls[0];
      expect(alvo).toBe(10);
      expect(dados.criticidade).toBe('MAIOR');
      expect(autor.id).toBe(1);
      expect(txRecebido).not.toBeUndefined();

      // A prova de atomicidade: a criação da NC aparece na MESMA transação da
      // reprovação da etapa, na ordem em que o serviço as emite. Se `salvar`
      // passasse o prisma raiz para o serviço de NC, a linha
      // `naoConformidade.create` cairia em `chamadasForaDaTransacao` — a etapa
      // seria reprovada e a NC poderia não nascer.
      expect(banco.chamadasForaDaTransacao).toEqual([]);
      expect(banco.chamadasNaTransacao).toEqual([
        'certificacaoProduto.update',
        'certificacaoHistorico.create',
        'naoConformidade.create',
      ]);
      expect(banco.transacoesAbertas).toBe(1);
    });

    it('a autoria do histórico vem da sessão, não do payload', async () => {
      await servico.salvar(
        1,
        { etapas: [{ id: 10, status: StatusCertificacao.REPROVADO }] },
        admin(7),
      );

      const [{ data }] = banco.tx.certificacaoHistorico.create.mock.calls[0];
      expect(data).toMatchObject({
        certificacaoId: 10,
        statusAnterior: StatusCertificacao.EM_ANDAMENTO,
        statusNovo: StatusCertificacao.REPROVADO,
        alteradoPorId: 7,
        alteradoPorNome: 'Ana Administradora',
      });
    });
  });

  describe('salvar — notificação do cliente', () => {
    beforeEach(() => {
      banco.prisma.certificacaoProduto.findMany.mockResolvedValue([
        {
          id: 10,
          status: StatusCertificacao.EM_ANDAMENTO,
          observacao: null,
          etapa: { nome: 'Ensaios laboratoriais' },
        },
        {
          id: 11,
          status: StatusCertificacao.PENDENTE,
          observacao: null,
          etapa: { nome: 'Auditoria de fábrica' },
        },
      ] as never);
    });

    /** Deixa correr tudo o que já está na fila de microtasks. */
    const drenarMicrotasks = () =>
      new Promise((resolve) => setImmediate(resolve));

    /**
     * O teste que dá razão a este bloco.
     *
     * Enquanto a chamada era `void this.notificarCliente(...)`, `salvar`
     * respondia com o envio ainda pendente. Em servidor de processo longo isso
     * é inofensivo; na função da Vercel a execução congela quando a resposta
     * sai, a promessa nunca é retomada e o e-mail simplesmente não existe —
     * sem exceção, sem log, sem sintoma. Um teste que só verificasse "o mock
     * foi chamado" passaria nos dois mundos, porque o `detalharPorProduto`
     * seguinte cede a vez para a microtask solta. Por isso o que se afirma
     * aqui é a ORDEM: `salvar` não pode resolver antes do envio terminar.
     */
    it('só responde depois que o envio termina — promessa solta se perde em serverless', async () => {
      let concluirEnvio!: () => void;
      notificacoes.certificacaoAtualizada.mockReturnValue(
        new Promise<void>((resolve) => {
          concluirEnvio = () => resolve();
        }),
      );

      let respondeu = false;
      const emCurso = servico
        .salvar(
          1,
          { etapas: [{ id: 10, status: StatusCertificacao.APROVADO }] },
          admin(),
        )
        .then((resultado) => {
          respondeu = true;
          return resultado;
        });

      await drenarMicrotasks();

      expect(notificacoes.certificacaoAtualizada).toHaveBeenCalledTimes(1);
      expect(respondeu).toBe(false);

      concluirEnvio();
      await emCurso;
      expect(respondeu).toBe(true);
    });

    it('leva só as etapas que mudaram de status, com o rótulo em português', async () => {
      await servico.salvar(
        1,
        {
          etapas: [
            { id: 10, status: StatusCertificacao.REPROVADO },
            // Repetição do status atual: não é mudança e não entra no e-mail.
            { id: 11, status: StatusCertificacao.PENDENTE },
          ],
        },
        admin(),
      );

      const [para, nomeCliente, produto, produtoId, mudancas] =
        notificacoes.certificacaoAtualizada.mock.calls[0];

      expect(para).toBe('contato@cliente.com.br');
      expect(nomeCliente).toBe('Indústria Cliente Ltda');
      expect(produto).toBe('Disjuntor DIN 25A');
      expect(produtoId).toBe(1);
      expect(mudancas).toEqual([
        { etapa: 'Ensaios laboratoriais', status: 'Reprovado' },
      ]);
    });

    /**
     * Agora que se espera pelo envio, uma falha de SMTP passaria a poder
     * derrubar a resposta. `notificarCliente` engole a própria exceção
     * justamente para isso: a avaliação técnica já está gravada, e o commit
     * não se desfaz porque o servidor de e-mail caiu.
     */
    it('falha no envio não derruba o salvamento já commitado', async () => {
      notificacoes.certificacaoAtualizada.mockRejectedValue(
        new Error('SMTP fora do ar'),
      );

      await expect(
        servico.salvar(
          1,
          { etapas: [{ id: 10, status: StatusCertificacao.APROVADO }] },
          admin(),
        ),
      ).resolves.toBeDefined();

      expect(banco.tx.certificacaoHistorico.create).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------- versão da trilha

  /**
   * Monta o cenário de produto preso a uma versão antiga.
   *
   * `etapasDoProduto` são os nomes já existentes na trilha DO PRODUTO, com a
   * ordem que carregam hoje; `etapasVigentes`, os nomes da versão vigente na
   * ordem do modelo.
   */
  function prepararTrilha(
    etapasDoProduto: Array<{ id: number; nome: string; ordem: number }>,
    etapasVigentes: string[],
  ) {
    const vigente = {
      id: 90,
      versao: 2,
      trilhaId: TRILHA,
      ativo: true,
      trilha: { nome: 'Trilha de material elétrico' },
      etapas: etapasVigentes.map((nome, indice) => ({
        id: 900 + indice,
        nome,
        ordem: indice + 1,
        tipo: TipoEtapa.DOCUMENTAL,
        obrigatoria: true,
        modeloTrilhaId: 90,
      })),
    };

    banco.prisma.produto.findUnique.mockResolvedValue({
      id: 1,
      categoriaId: 3,
      modeloTrilhaId: 80,
      clienteId: CLIENTE_DONO,
      modeloTrilha: {
        id: 80,
        versao: 1,
        trilha: { nome: 'Trilha de material elétrico' },
      },
      // A versão vigente é resolvida pela TRILHA da categoria, não mais pela
      // categoria: sem este campo o service nem chega à consulta.
      categoria: { id: 3, nome: 'Material elétrico', trilhaId: TRILHA },
      certificacao: etapasDoProduto.map((e) => ({ etapa: { nome: e.nome } })),
    } as never);

    banco.prisma.modeloTrilha.findFirst.mockResolvedValue(vigente as never);
    banco.prisma.modeloTrilha.findFirstOrThrow.mockResolvedValue(
      vigente as never,
    );

    return vigente;
  }

  describe('verificarVersaoTrilha — consulta pura', () => {
    it('diz "atualizado" quando o produto já está na versão vigente', async () => {
      banco.prisma.produto.findUnique.mockResolvedValue({
        id: 1,
        categoriaId: 3,
        modeloTrilhaId: 90,
        modeloTrilha: {
          id: 90,
          versao: 2,
          trilha: { nome: 'Trilha de material elétrico' },
        },
        categoria: { id: 3, nome: 'Material elétrico', trilhaId: TRILHA },
        certificacao: [],
      } as never);
      banco.prisma.modeloTrilha.findFirst.mockResolvedValue({
        id: 90,
        versao: 2,
        etapas: [],
      } as never);

      const situacao = await servico.verificarVersaoTrilha(1);

      expect(situacao.atualizado).toBe(true);
      expect(situacao.etapasAAdicionar).toEqual([]);
    });

    it('compara as etapas POR NOME, porque cada versão tem ModeloEtapa com ids próprios', async () => {
      prepararTrilha(
        [
          { id: 10, nome: 'Análise documental', ordem: 1 },
          { id: 11, nome: 'Auditoria de fábrica', ordem: 2 },
        ],
        ['Análise documental', 'Ensaios laboratoriais', 'Auditoria de fábrica'],
      );

      const situacao = await servico.verificarVersaoTrilha(1);

      expect(situacao.atualizado).toBe(false);
      expect(situacao.etapasAAdicionar.map((e) => e.nome)).toEqual([
        'Ensaios laboratoriais',
      ]);
      // Nada foi gravado: a migração exige POST explícito.
      expect(banco.transacoesAbertas).toBe(0);
      expect(banco.prisma.certificacaoProduto.create).not.toHaveBeenCalled();
    });

    it('categoria que TROCOU de trilha: a mensagem nomeia as duas', async () => {
      /*
       * Encontrado no navegador, não em teste: depois que a trilha virou
       * catálogo, a categoria pode passar a seguir OUTRA trilha, e cada trilha
       * numera as versões por conta própria. O botão dizia "Atualizar trilha
       * (v1 → v1)" — verdadeiro e inútil, porque as duas v1 são processos
       * diferentes. Só o nome desambigua.
       */
      prepararTrilha([{ id: 10, nome: 'Análise documental', ordem: 1 }], [
        'Análise documental',
        'Ensaios laboratoriais',
      ]);
      banco.prisma.modeloTrilha.findFirst.mockResolvedValue({
        id: 90,
        versao: 1,
        ativo: true,
        trilha: { nome: 'Certificação padrão' },
        etapas: [
          {
            id: 900,
            nome: 'Análise documental',
            ordem: 1,
            tipo: TipoEtapa.DOCUMENTAL,
            obrigatoria: true,
            modeloTrilhaId: 90,
          },
          {
            id: 901,
            nome: 'Ensaios laboratoriais',
            ordem: 2,
            tipo: TipoEtapa.ENSAIO,
            obrigatoria: true,
            modeloTrilhaId: 90,
          },
        ],
      } as never);

      const situacao = await servico.verificarVersaoTrilha(1);

      expect(situacao.trilhaProduto).toBe('Trilha de material elétrico');
      expect(situacao.trilhaVigente).toBe('Certificação padrão');
      expect(situacao.mensagem).toContain('"Trilha de material elétrico"');
      expect(situacao.mensagem).toContain('"Certificação padrão"');
      expect(situacao.mensagem).toContain('que a categoria passou a seguir');
    });

    it('MESMA trilha: a mensagem não repete o nome dos dois lados', async () => {
      prepararTrilha([{ id: 10, nome: 'Análise documental', ordem: 1 }], [
        'Análise documental',
        'Ensaios laboratoriais',
      ]);

      const situacao = await servico.verificarVersaoTrilha(1);

      // Repetir o nome quando ele é o mesmo dos dois lados só faz ruído.
      expect(situacao.mensagem).not.toContain('"Trilha de material elétrico"');
      expect(situacao.mensagem).toContain('a versão 1 da trilha');
      expect(situacao.mensagem).toContain('a vigente é a versão 2');
    });
  });

  describe('migrarParaVersaoVigente — renumeração 1..N', () => {
    /**
     * Encena a transação de migração e devolve a ordem final de cada etapa.
     *
     * `trilhaAposInsercao` é o que o `findMany` de dentro da transação enxerga
     * depois das criações: as etapas antigas com a ordem que já tinham e as
     * novas com a ordem PROVISÓRIA copiada do modelo vigente — que é
     * justamente onde nascem as colisões.
     */
    function encenarTransacao(
      trilhaAposInsercao: Array<{ id: number; ordem: number; nome: string }>,
    ) {
      let proximoId = 700;
      banco.tx.certificacaoProduto.create.mockImplementation(
        () => ({ id: proximoId++ }) as never,
      );
      banco.tx.certificacaoProduto.findMany.mockResolvedValue(
        trilhaAposInsercao.map((e) => ({
          id: e.id,
          ordem: e.ordem,
          etapa: { nome: e.nome },
        })) as never,
      );

      return () => {
        // Ordem final = ordem original, sobrescrita pelos updates emitidos.
        const final = new Map(trilhaAposInsercao.map((e) => [e.id, e.ordem]));
        for (const [
          argumentos,
        ] of banco.tx.certificacaoProduto.update.mock.calls) {
          final.set(
            (argumentos.where as { id: number }).id,
            (argumentos.data as { ordem: number }).ordem,
          );
        }
        return trilhaAposInsercao
          .map((e) => ({ nome: e.nome, ordem: final.get(e.id)! }))
          .sort((a, b) => a.ordem - b.ordem);
      };
    }

    it('etapa nova NO MEIO da trilha entra na posição certa e a trilha fica 1..N sem buraco nem empate', async () => {
      prepararTrilha(
        [
          { id: 10, nome: 'Análise documental', ordem: 1 },
          { id: 11, nome: 'Auditoria de fábrica', ordem: 2 },
        ],
        ['Análise documental', 'Ensaios laboratoriais', 'Auditoria de fábrica'],
      );

      // "Ensaios laboratoriais" nasce com a ordem 2 do modelo vigente e COLIDE
      // com a "Auditoria de fábrica", que já ocupava a 2 na trilha do produto.
      // É exatamente a colisão que a renumeração existe para desfazer.
      const ordemFinal = encenarTransacao([
        { id: 10, ordem: 1, nome: 'Análise documental' },
        { id: 11, ordem: 2, nome: 'Auditoria de fábrica' },
        { id: 700, ordem: 2, nome: 'Ensaios laboratoriais' },
      ]);

      const resultado = await servico.migrarParaVersaoVigente(1, admin());

      expect(resultado.adicionadas).toBe(1);
      expect(ordemFinal()).toEqual([
        { nome: 'Análise documental', ordem: 1 },
        { nome: 'Ensaios laboratoriais', ordem: 2 },
        { nome: 'Auditoria de fábrica', ordem: 3 },
      ]);
    });

    it('etapa que a versão nova NÃO prevê vai para o fim, preservando a ordem relativa', async () => {
      prepararTrilha(
        [
          { id: 10, nome: 'Análise documental', ordem: 1 },
          { id: 11, nome: 'Auditoria de fábrica', ordem: 2 },
          { id: 12, nome: 'Inspeção de rótulo (descontinuada)', ordem: 3 },
        ],
        ['Análise documental', 'Ensaios laboratoriais', 'Auditoria de fábrica'],
      );

      const ordemFinal = encenarTransacao([
        { id: 10, ordem: 1, nome: 'Análise documental' },
        { id: 11, ordem: 2, nome: 'Auditoria de fábrica' },
        { id: 12, ordem: 3, nome: 'Inspeção de rótulo (descontinuada)' },
        { id: 700, ordem: 2, nome: 'Ensaios laboratoriais' },
      ]);

      await servico.migrarParaVersaoVigente(1, admin());

      expect(ordemFinal()).toEqual([
        { nome: 'Análise documental', ordem: 1 },
        { nome: 'Ensaios laboratoriais', ordem: 2 },
        { nome: 'Auditoria de fábrica', ordem: 3 },
        { nome: 'Inspeção de rótulo (descontinuada)', ordem: 4 },
      ]);
    });

    it('a renumeração acontece DENTRO da transação, junto da criação das etapas', async () => {
      prepararTrilha(
        [{ id: 10, nome: 'Análise documental', ordem: 1 }],
        ['Análise documental', 'Ensaios laboratoriais'],
      );
      encenarTransacao([
        { id: 10, ordem: 1, nome: 'Análise documental' },
        { id: 700, ordem: 2, nome: 'Ensaios laboratoriais' },
      ]);

      await servico.migrarParaVersaoVigente(1, admin());

      // Se a renumeração escapasse do commit, uma falha no meio deixaria a
      // trilha com ordens duplicadas em produção.
      expect(banco.chamadasForaDaTransacao).toEqual([]);
      expect(banco.chamadasNaTransacao).toEqual([
        'produto.update',
        'certificacaoProduto.create',
        'certificacaoHistorico.create',
        'certificacaoProduto.findMany',
      ]);
      expect(banco.transacoesAbertas).toBe(1);
      // Nenhum update: as duas etapas já caíram na posição certa.
      expect(banco.tx.certificacaoProduto.update).not.toHaveBeenCalled();
    });

    it('registra a etapa nova no histórico, com autoria da sessão', async () => {
      prepararTrilha(
        [{ id: 10, nome: 'Análise documental', ordem: 1 }],
        ['Análise documental', 'Ensaios laboratoriais'],
      );
      encenarTransacao([
        { id: 10, ordem: 1, nome: 'Análise documental' },
        { id: 700, ordem: 2, nome: 'Ensaios laboratoriais' },
      ]);

      await servico.migrarParaVersaoVigente(1, funcionario(4));

      const [{ data }] = banco.tx.certificacaoHistorico.create.mock.calls[0];
      expect(data).toMatchObject({
        statusAnterior: null,
        statusNovo: StatusCertificacao.PENDENTE,
        alteradoPorId: 4,
        alteradoPorNome: 'Bruno Analista',
      });
    });

    it('produto já atualizado: nada é gravado', async () => {
      banco.prisma.produto.findUnique.mockResolvedValue({
        id: 1,
        categoriaId: 3,
        modeloTrilhaId: 90,
        modeloTrilha: {
          id: 90,
          versao: 2,
          trilha: { nome: 'Trilha de material elétrico' },
        },
        categoria: { id: 3, nome: 'Material elétrico', trilhaId: TRILHA },
        certificacao: [],
      } as never);
      banco.prisma.modeloTrilha.findFirst.mockResolvedValue({
        id: 90,
        versao: 2,
        etapas: [],
      } as never);

      const resultado = await servico.migrarParaVersaoVigente(1, admin());

      expect(resultado.adicionadas).toBe(0);
      expect(banco.transacoesAbertas).toBe(0);
    });
  });

  describe('detalharPorProduto — escopo de papel', () => {
    it('cliente ALHEIO recebe ForbiddenException', async () => {
      await expect(
        servico.detalharPorProduto(1, cliente(CLIENTE_ALHEIO)),
      ).rejects.toThrow(
        new ForbiddenException(
          'Você só pode acompanhar as certificações dos seus produtos.',
        ),
      );
    });

    it('cliente DONO acompanha', async () => {
      await expect(
        servico.detalharPorProduto(1, cliente(CLIENTE_DONO)),
      ).resolves.toBeDefined();
    });

    it('resumo.obrigatoriasAprovadas ignora as opcionais pendentes', async () => {
      banco.prisma.produto.findUnique.mockResolvedValue({
        ...detalheDoProduto(),
        certificacao: [
          {
            status: StatusCertificacao.APROVADO,
            etapa: { obrigatoria: true },
            naoConformidades: [],
            historico: [],
          },
          {
            status: StatusCertificacao.PENDENTE,
            etapa: { obrigatoria: false },
            naoConformidades: [],
            historico: [],
          },
        ],
      } as never);

      const detalhe = await servico.detalharPorProduto(1, admin());

      // É o campo que evita a UI reimplementar (e errar) a regra de emissão.
      expect(detalhe.resumo.obrigatoriasAprovadas).toBe(true);
      expect(detalhe.resumo.concluida).toBe(false);
    });
  });

  describe('listarPainel — escopo de papel', () => {
    it('o clienteId do CLIENTE vem do token e ignora o filtro da URL', async () => {
      banco.prisma.produto.findMany.mockResolvedValue([] as never);
      banco.prisma.produto.count.mockResolvedValue(0 as never);

      await servico.listarPainel(
        {
          pagina: 1,
          limite: 20,
          skip: 0,
          clienteId: CLIENTE_ALHEIO,
        } as never,
        cliente(CLIENTE_DONO),
      );

      const argumentos = banco.prisma.produto.findMany.mock.calls[0][0]!;
      expect(argumentos.where).toMatchObject({ clienteId: CLIENTE_DONO });
    });
  });
});
