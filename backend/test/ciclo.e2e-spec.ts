import { NestExpressApplication } from '@nestjs/platform-express';
import { StatusCertificacao } from '@prisma/client';

import { criarApp, http, prisma } from './utils/aplicacao';
import { Cenario, prepararCenario } from './utils/cenario';

/**
 * Tempo de ciclo.
 *
 * **Só o e2e alcança esta SQL** — o mock do Prisma não interpreta `$queryRaw`.
 * Cada caso aqui defende um marco de tempo específico contra o erro que ele
 * esconde:
 *
 *  1. anexo depois da aprovação não empurra o fim para frente;
 *  2. aprovação direta fica fora da mediana de tratamento;
 *  3. etapa vinda de migração conta a fila do PRÓPRIO criadoEm;
 *  4. reprovação → NC → reavaliação conta o ciclo inteiro;
 *  5. etapa em aberto não entra nas medianas;
 *  6. base vazia devolve `null`, nunca zero.
 */
describe('Relatórios — tempo de ciclo (e2e)', () => {
  let app: NestExpressApplication;
  let c: Cenario;

  /** Uma hora em milissegundos, para montar marcos legíveis. */
  const HORA = 3_600_000;

  beforeAll(async () => {
    app = await criarApp();
    c = await prepararCenario(app);

    const db = prisma(app);
    const base = new Date('2026-03-01T09:00:00Z');

    const trilha = await db.certificacaoProduto.findMany({
      where: { produtoId: c.produtoDonoId },
      orderBy: { ordem: 'asc' },
    });

    // Todas as etapas nascem com o mesmo criado_em (mesma transação).
    await db.certificacaoProduto.updateMany({
      where: { produtoId: c.produtoDonoId },
      data: { criadoEm: base },
    });

    /*
     * ETAPA 1 — caminho completo, com reprovação no meio.
     * Fila: 09h → 11h (2h). Tratamento: 11h → 35h (24h), atravessando a
     * reprovação: o ciclo inteiro conta, porque o atraso é real.
     */
    await db.certificacaoProduto.update({
      where: { id: trilha[0].id },
      data: { status: StatusCertificacao.APROVADO },
    });
    await db.certificacaoHistorico.createMany({
      data: [
        {
          certificacaoId: trilha[0].id,
          statusAnterior: StatusCertificacao.PENDENTE,
          statusNovo: StatusCertificacao.EM_ANDAMENTO,
          alteradoPorNome: 'Bruno Analista',
          alteradoEm: new Date(base.getTime() + 2 * HORA),
        },
        {
          certificacaoId: trilha[0].id,
          statusAnterior: StatusCertificacao.EM_ANDAMENTO,
          statusNovo: StatusCertificacao.REPROVADO,
          alteradoPorNome: 'Bruno Analista',
          alteradoEm: new Date(base.getTime() + 10 * HORA),
        },
        {
          certificacaoId: trilha[0].id,
          statusAnterior: StatusCertificacao.REPROVADO,
          statusNovo: StatusCertificacao.EM_ANDAMENTO,
          alteradoPorNome: 'Bruno Analista',
          alteradoEm: new Date(base.getTime() + 20 * HORA),
        },
        {
          certificacaoId: trilha[0].id,
          statusAnterior: StatusCertificacao.EM_ANDAMENTO,
          statusNovo: StatusCertificacao.APROVADO,
          alteradoPorNome: 'Bruno Analista',
          alteradoEm: new Date(base.getTime() + 26 * HORA),
        },
        /*
         * ANEXO enviado DEPOIS da aprovação: status_anterior = status_novo.
         * Se entrasse na conta, o fim iria para 50h e o tratamento saltaria
         * de 24h para 48h — quase o dobro, sem nada ter acontecido.
         */
        {
          certificacaoId: trilha[0].id,
          statusAnterior: StatusCertificacao.APROVADO,
          statusNovo: StatusCertificacao.APROVADO,
          observacao: 'Documento anexado: laudo-final.pdf',
          alteradoPorNome: 'Bruno Analista',
          alteradoEm: new Date(base.getTime() + 50 * HORA),
        },
      ],
    });

    /*
     * ETAPA 2 — APROVAÇÃO DIRETA: PENDENTE → APROVADO num lote só.
     * Tratamento zero por construção; tem de ficar fora da mediana.
     */
    await db.certificacaoProduto.update({
      where: { id: trilha[1].id },
      data: { status: StatusCertificacao.APROVADO },
    });
    await db.certificacaoHistorico.create({
      data: {
        certificacaoId: trilha[1].id,
        statusAnterior: StatusCertificacao.PENDENTE,
        statusNovo: StatusCertificacao.APROVADO,
        alteradoPorNome: 'Bruno Analista',
        alteradoEm: new Date(base.getTime() + 4 * HORA),
      },
    });

    // ETAPA 3 — segue PENDENTE, sem histórico nenhum: bloco "em aberto".
    await db.certificacaoProduto.update({
      where: { id: trilha[2].id },
      data: { status: StatusCertificacao.PENDENTE },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function relatorio(agrupamento: 'trilha' | 'etapa' = 'trilha') {
    const resposta = await http(app)
      .get('/api/relatorios/tempo-ciclo')
      .query({ agrupamento })
      .set('Authorization', c.admin)
      .expect(200);

    return resposta.body as {
      agrupamento: string;
      grupos: Array<{
        chave: string;
        leadTimeTrilha: { medianaDias: number | null; base: number } | null;
        tempoTratamentoEtapa: { medianaDias: number | null; base: number };
        tempoEmFila: { medianaDias: number | null; base: number };
        aprovacaoDireta: { etapas: number };
        etapasEmAberto: { etapas: number; medianaDias: number | null };
      }>;
    };
  }

  /** Soma as bases de todos os grupos — o cenário tem mais de um produto. */
  function totais(corpo: Awaited<ReturnType<typeof relatorio>>) {
    return corpo.grupos.reduce(
      (acc, g) => ({
        tratamentoBase: acc.tratamentoBase + g.tempoTratamentoEtapa.base,
        filaBase: acc.filaBase + g.tempoEmFila.base,
        diretas: acc.diretas + g.aprovacaoDireta.etapas,
        abertas: acc.abertas + g.etapasEmAberto.etapas,
      }),
      { tratamentoBase: 0, filaBase: 0, diretas: 0, abertas: 0 },
    );
  }

  it('anexo enviado DEPOIS da aprovação não move o fim do tratamento', async () => {
    const corpo = await relatorio();
    const grupo = corpo.grupos.find(
      (g) => g.tempoTratamentoEtapa.base > 0,
    );

    // 11h → 35h = 24h = 1 dia. Com o anexo entrando, seriam 2 dias.
    expect(grupo?.tempoTratamentoEtapa.medianaDias).toBe(1);
  });

  it('a fila conta do criadoEm da etapa até a primeira saída de PENDENTE', async () => {
    const corpo = await relatorio();
    const grupo = corpo.grupos.find((g) => g.tempoEmFila.base > 0);

    /*
     * Etapa 1 esperou 2h e etapa 2 esperou 4h → mediana 3h = 0,125 d,
     * arredondado para 0,1. Só as que saíram de PENDENTE entram: a etapa 3
     * não tem primeira saída e fica fora da base.
     */
    expect(grupo?.tempoEmFila.medianaDias).toBeCloseTo(0.1, 1);
    expect(grupo?.tempoEmFila.base).toBe(2);
  });

  it('aprovação direta fica FORA da mediana de tratamento e é contada à parte', async () => {
    const corpo = await relatorio();
    const soma = totais(corpo);

    // A etapa 2 foi de PENDENTE a APROVADO num lote só.
    expect(soma.diretas).toBe(1);
    // E não entrou na base de tratamento, que tem só a etapa 1.
    expect(soma.tratamentoBase).toBe(1);
  });

  it('etapa em aberto não entra nas medianas e aparece no bloco próprio', async () => {
    const corpo = await relatorio();
    const soma = totais(corpo);

    // A etapa 3 segue PENDENTE. Incluí-la puxaria a mediana e faria a trilha
    // mais lenta parecer a mais rápida.
    expect(soma.abertas).toBeGreaterThanOrEqual(1);

    const comAbertas = corpo.grupos.find((g) => g.etapasEmAberto.etapas > 0);
    expect(comAbertas?.etapasEmAberto.medianaDias).not.toBeNull();
  });

  it('base vazia devolve mediana null, nunca zero', async () => {
    const corpo = await relatorio();

    /*
     * Zero afirmaria "levou zero dia"; `null` diz "não medimos". O produto
     * alheio do cenário não tem movimentação nenhuma.
     */
    for (const g of corpo.grupos) {
      if (g.tempoTratamentoEtapa.base === 0) {
        expect(g.tempoTratamentoEtapa.medianaDias).toBeNull();
      }
      if (g.tempoEmFila.base === 0) {
        expect(g.tempoEmFila.medianaDias).toBeNull();
      }
    }
  });

  it('lead time só existe no agrupamento por trilha', async () => {
    const porTrilha = await relatorio('trilha');
    const porEtapa = await relatorio('etapa');

    // É medida do PRODUTO: por etapa não faz sentido.
    for (const g of porTrilha.grupos) expect(g.leadTimeTrilha).not.toBeNull();
    for (const g of porEtapa.grupos) expect(g.leadTimeTrilha).toBeNull();
  });

  it('agrupa por categoria + versão, nunca por categoria solta', async () => {
    const corpo = await relatorio('trilha');

    // Misturar v1 e v3 compararia réguas diferentes.
    for (const g of corpo.grupos) expect(g.chave).toMatch(/· v\d+$/);
  });

  it('agrupa pelo NOME da etapa quando pedido', async () => {
    const corpo = await relatorio('etapa');

    expect(corpo.agrupamento).toBe('etapa');
    // Cada versão tem ModeloEtapa com id distinto; o nome é o que as une.
    for (const g of corpo.grupos) expect(g.chave).not.toMatch(/· v\d+$/);
  });

  it('recusa agrupamento fora da allowlist', async () => {
    await http(app)
      .get('/api/relatorios/tempo-ciclo')
      .query({ agrupamento: 'chave; DROP TABLE produtos' })
      .set('Authorization', c.admin)
      .expect(400);
  });

  it('recusa período invertido', async () => {
    await http(app)
      .get('/api/relatorios/tempo-ciclo')
      .query({ de: '2026-12-31', ate: '2026-01-01' })
      .set('Authorization', c.admin)
      .expect(400);
  });

  it.each([
    { ator: 'anônimo', token: () => undefined, esperado: 401 },
    { ator: 'CLIENTE', token: () => c.clienteDono, esperado: 403 },
    { ator: 'FUNCIONARIO', token: () => c.funcionario, esperado: 200 },
    { ator: 'ADMIN', token: () => c.admin, esperado: 200 },
  ])('$ator → $esperado', async ({ token, esperado }) => {
    const requisicao = http(app).get('/api/relatorios/tempo-ciclo');
    const t = token();
    if (t) requisicao.set('Authorization', t);
    await requisicao.expect(esperado);
  });

  describe('exportação', () => {
    it('baixa o XLSX com o agrupamento no nome', async () => {
      const resposta = await http(app)
        .get('/api/relatorios/tempo-ciclo/exportacao')
        .set('Authorization', c.admin)
        .expect(200);

      expect(resposta.headers['content-disposition']).toMatch(
        /tempo-de-ciclo-por-trilha-\d{4}-\d{2}-\d{2}\.xlsx/,
      );
      expect(resposta.headers['content-type']).toContain('spreadsheetml');
    });

    it('baixa o CSV', async () => {
      const resposta = await http(app)
        .get('/api/relatorios/tempo-ciclo/exportacao')
        .query({ formato: 'csv', agrupamento: 'etapa' })
        .set('Authorization', c.admin)
        .expect(200);

      expect(resposta.headers['content-type']).toContain('text/csv');
      expect(resposta.headers['content-disposition']).toContain('por-etapa');
    });
  });
});
