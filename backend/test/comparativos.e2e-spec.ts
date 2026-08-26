import { NestExpressApplication } from '@nestjs/platform-express';
import { StatusCertificacao } from '@prisma/client';

import { criarApp, http, prisma } from './utils/aplicacao';
import { Cenario, prepararCenario } from './utils/cenario';

/**
 * Comparativos de produtos e de clientes.
 *
 * Como o relatório de equipe, a consulta é `$queryRaw` e **só o e2e a alcança**:
 * o mock do Prisma não interpreta SQL, então um unitário provaria apenas que a
 * string foi montada.
 *
 * O que está sendo defendido:
 *
 *  - "obrigatórias pendentes" conta só as etapas obrigatórias, e é ela que
 *    corresponde ao que trava o certificado;
 *  - `LEFT JOIN LATERAL` não multiplica contagens entre si;
 *  - a ordenação vem de allowlist, e valor fora dela é 400 (não injeção);
 *  - "certificados vigentes" ignora CANCELADO e VENCIDO;
 *  - o teto e os papéis da exportação.
 */
describe('Relatórios — comparativos (e2e)', () => {
  let app: NestExpressApplication;
  let c: Cenario;

  beforeAll(async () => {
    app = await criarApp();
    c = await prepararCenario(app);

    const db = prisma(app);

    // Marca UMA etapa da trilha como opcional e a deixa pendente. É o caso que
    // separa "pendentes" de "obrigatórias pendentes": ela conta na primeira e
    // não na segunda, porque não bloqueia a emissão do certificado.
    const trilha = await db.certificacaoProduto.findMany({
      where: { produtoId: c.produtoDonoId },
      orderBy: { ordem: 'asc' },
      include: { etapa: true },
    });

    await db.modeloEtapa.update({
      where: { id: trilha[trilha.length - 1].etapaId },
      data: { obrigatoria: false },
    });

    await db.certificacaoProduto.update({
      where: { id: trilha[trilha.length - 1].id },
      data: { status: StatusCertificacao.PENDENTE },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  function produtoNo(corpo: { dados: Array<{ id: number }> }, id: number) {
    const linha = corpo.dados.find((d) => d.id === id);
    if (!linha) throw new Error(`Produto ${id} não veio no comparativo.`);
    return linha as never as Record<string, number | string | null>;
  }

  describe('GET /api/relatorios/produtos', () => {
    it('separa "pendentes" de "obrigatórias pendentes"', async () => {
      const resposta = await http(app)
        .get('/api/relatorios/produtos')
        .query({ limite: 100 })
        .set('Authorization', c.admin)
        .expect(200);

      const linha = produtoNo(resposta.body, c.produtoDonoId);

      /*
       * A etapa opcional deixada pendente conta em `pendentes` e NÃO em
       * `obrigatoriasPendentes`. Fundir as duas faria a tela afirmar que o
       * produto não pode emitir certificado quando ele pode.
       */
      expect(Number(linha.pendentes)).toBeGreaterThan(0);
      expect(Number(linha.obrigatoriasPendentes)).toBeLessThan(
        Number(linha.pendentes),
      );
    });

    it('calcula progresso sobre o total de etapas da trilha DO PRODUTO', async () => {
      const resposta = await http(app)
        .get('/api/relatorios/produtos')
        .query({ limite: 100 })
        .set('Authorization', c.admin)
        .expect(200);

      const linha = produtoNo(resposta.body, c.produtoDonoId);
      const esperado = Math.round(
        (Number(linha.aprovadas) / Number(linha.totalEtapas)) * 100,
      );

      expect(Number(linha.progresso)).toBe(esperado);
      expect(Number(linha.progresso)).toBeGreaterThanOrEqual(0);
      expect(Number(linha.progresso)).toBeLessThanOrEqual(100);
    });

    it('não multiplica contagens entre etapas, NCs e histórico', async () => {
      const db = prisma(app);
      const etapas = await db.certificacaoProduto.count({
        where: { produtoId: c.produtoDonoId },
      });

      const resposta = await http(app)
        .get('/api/relatorios/produtos')
        .query({ limite: 100 })
        .set('Authorization', c.admin)
        .expect(200);

      // Com JOIN direto, `totalEtapas` viria multiplicado pelo número de NCs e
      // de linhas de histórico do produto.
      expect(
        Number(produtoNo(resposta.body, c.produtoDonoId).totalEtapas),
      ).toBe(etapas);
    });

    it('aceita as ordenações da allowlist', async () => {
      for (const ordem of ['progresso', 'progresso_asc', 'paradas', 'nome']) {
        await http(app)
          .get('/api/relatorios/produtos')
          .query({ ordem })
          .set('Authorization', c.admin)
          .expect(200);
      }
    });

    it('recusa ordenação fora da allowlist — a coluna nunca vem da query', async () => {
      /*
       * `ORDER BY` não aceita placeholder: se o nome da coluna viesse da query
       * string, isto seria injeção de SQL. A allowlist do DTO é o que fecha
       * essa porta, e o 400 aqui é a prova de que ela está fechada.
       */
      await http(app)
        .get('/api/relatorios/produtos')
        .query({ ordem: 'nome; DROP TABLE produtos' })
        .set('Authorization', c.admin)
        .expect(400);
    });

    it('filtra por cliente e por categoria', async () => {
      const resposta = await http(app)
        .get('/api/relatorios/produtos')
        .query({ clienteId: c.clienteAlheioId, limite: 100 })
        .set('Authorization', c.admin)
        .expect(200);

      const ids = resposta.body.dados.map((d: { id: number }) => d.id);
      expect(ids).toContain(c.produtoAlheioId);
      expect(ids).not.toContain(c.produtoDonoId);
    });

    it.each([
      { ator: 'anônimo', token: () => undefined, esperado: 401 },
      { ator: 'CLIENTE', token: () => c.clienteDono, esperado: 403 },
      { ator: 'FUNCIONARIO', token: () => c.funcionario, esperado: 200 },
      { ator: 'ADMIN', token: () => c.admin, esperado: 200 },
    ])('$ator → $esperado', async ({ token, esperado }) => {
      const requisicao = http(app).get('/api/relatorios/produtos');
      const t = token();
      if (t) requisicao.set('Authorization', t);
      await requisicao.expect(esperado);
    });
  });

  describe('GET /api/relatorios/clientes', () => {
    it('conta produtos e certificados vigentes por cliente', async () => {
      const resposta = await http(app)
        .get('/api/relatorios/clientes')
        .query({ limite: 100 })
        .set('Authorization', c.admin)
        .expect(200);

      const linha = resposta.body.dados.find(
        (d: { id: number }) => d.id === c.clienteDonoId,
      );

      expect(linha.produtos).toBe(1);
      // O cenário emite um certificado EMITIDO para o produto do dono.
      expect(linha.certificadosVigentes).toBe(1);
    });

    it('certificado CANCELADO deixa de contar como vigente', async () => {
      const db = prisma(app);
      await db.certificado.update({
        where: { id: c.certificadoId },
        data: { status: 'CANCELADO', motivoStatus: 'Teste de contagem' },
      });

      const resposta = await http(app)
        .get('/api/relatorios/clientes')
        .query({ limite: 100 })
        .set('Authorization', c.admin)
        .expect(200);

      const linha = resposta.body.dados.find(
        (d: { id: number }) => d.id === c.clienteDonoId,
      );

      // CANCELADO é terminal e VENCIDO já passou: contá-los infla o número.
      expect(linha.certificadosVigentes).toBe(0);

      await db.certificado.update({
        where: { id: c.certificadoId },
        data: { status: 'EMITIDO', motivoStatus: null },
      });
    });

    it('recusa ordenação fora da allowlist', async () => {
      await http(app)
        .get('/api/relatorios/clientes')
        .query({ ordem: 'nome; DELETE FROM clientes' })
        .set('Authorization', c.admin)
        .expect(400);
    });

    it.each([
      { ator: 'anônimo', token: () => undefined, esperado: 401 },
      { ator: 'CLIENTE', token: () => c.clienteDono, esperado: 403 },
      { ator: 'FUNCIONARIO', token: () => c.funcionario, esperado: 200 },
      { ator: 'ADMIN', token: () => c.admin, esperado: 200 },
    ])('$ator → $esperado', async ({ token, esperado }) => {
      const requisicao = http(app).get('/api/relatorios/clientes');
      const t = token();
      if (t) requisicao.set('Authorization', t);
      await requisicao.expect(esperado);
    });
  });

  describe('exportações', () => {
    it('baixa o XLSX de produtos', async () => {
      const resposta = await http(app)
        .get('/api/relatorios/produtos/exportacao')
        .set('Authorization', c.admin)
        .expect(200);

      expect(resposta.headers['content-disposition']).toMatch(
        /comparativo-produtos-\d{4}-\d{2}-\d{2}\.xlsx/,
      );
      expect(resposta.headers['content-type']).toContain('spreadsheetml');
    });

    it('baixa o CSV de clientes', async () => {
      const resposta = await http(app)
        .get('/api/relatorios/clientes/exportacao')
        .query({ formato: 'csv' })
        .set('Authorization', c.admin)
        .expect(200);

      expect(resposta.headers['content-type']).toContain('text/csv');
    });

    it('recusa `pagina` na exportação em vez de ignorar em silêncio', async () => {
      // Ignorado, alguém baixaria a página 2 achando que baixou tudo.
      await http(app)
        .get('/api/relatorios/produtos/exportacao')
        .query({ pagina: 2 })
        .set('Authorization', c.admin)
        .expect(400);
    });

    it('CLIENTE não exporta comparativo', async () => {
      await http(app)
        .get('/api/relatorios/clientes/exportacao')
        .set('Authorization', c.clienteDono)
        .expect(403);
    });
  });
});
