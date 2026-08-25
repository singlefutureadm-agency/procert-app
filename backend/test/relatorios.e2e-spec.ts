import { NestExpressApplication } from '@nestjs/platform-express';
import { StatusCertificacao } from '@prisma/client';

import { criarApp, http, prisma } from './utils/aplicacao';
import { Cenario, prepararCenario } from './utils/cenario';

/**
 * Relatório de desempenho da equipe.
 *
 * **Só o e2e alcança este código.** A consulta é `$queryRaw`, e o mock do
 * Prisma não interpreta SQL: um teste unitário aqui provaria apenas que a
 * string foi montada, não que o Postgres devolve o número certo. Estes casos
 * rodam contra o banco de verdade.
 *
 * O que está sendo defendido, em uma frase cada:
 *
 *  - linha de anexo de documento **não** é avaliação de etapa;
 *  - `LEFT JOIN LATERAL` não multiplica contagens entre si;
 *  - quem não fez nada aparece com zero, em vez de sumir;
 *  - carteira ignora o período, atividade não;
 *  - exportação sem recorte, ou com recorte largo demais, é 400.
 */
describe('Relatórios — desempenho da equipe (e2e)', () => {
  let app: NestExpressApplication;
  let c: Cenario;
  let funcionarioId: number;

  beforeAll(async () => {
    app = await criarApp();
    c = await prepararCenario(app);

    const db = prisma(app);
    const funcionario = await db.funcionario.findFirstOrThrow({
      where: { role: 'FUNCIONARIO' },
    });
    funcionarioId = funcionario.id;

    // Duas transições de verdade: uma aprovação e uma reprovação.
    await db.certificacaoHistorico.createMany({
      data: [
        {
          certificacaoId: c.certificacaoId,
          statusAnterior: StatusCertificacao.PENDENTE,
          statusNovo: StatusCertificacao.EM_ANDAMENTO,
          alteradoPorId: funcionarioId,
          alteradoPorNome: 'Bruno Analista',
        },
        {
          certificacaoId: c.certificacaoId,
          statusAnterior: StatusCertificacao.EM_ANDAMENTO,
          statusNovo: StatusCertificacao.REPROVADO,
          alteradoPorId: funcionarioId,
          alteradoPorNome: 'Bruno Analista',
        },
        /*
         * E uma linha de ANEXO: `statusAnterior === statusNovo`. É como o
         * `DocumentosCertificacaoService` registra cada upload. Ela não é
         * avaliação de etapa e não pode entrar na contagem — senão quem só
         * subiu arquivo aparece como quem avaliou a trilha.
         */
        {
          certificacaoId: c.certificacaoId,
          statusAnterior: StatusCertificacao.REPROVADO,
          statusNovo: StatusCertificacao.REPROVADO,
          observacao: 'Documento anexado: laudo.pdf',
          alteradoPorId: funcionarioId,
          alteradoPorNome: 'Bruno Analista',
        },
      ],
    });

    // Carteira: dois clientes sob o mesmo funcionário.
    await db.cliente.updateMany({
      where: { id: { in: [c.clienteDonoId, c.clienteAlheioId] } },
      data: { responsavelId: funcionarioId },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  function linhaDo(corpo: { dados: Array<{ id: number }> }, id: number) {
    const linha = corpo.dados.find((d) => d.id === id);
    if (!linha) throw new Error(`Colaborador ${id} não veio no relatório.`);
    return linha as never as {
      carteira: { clientes: number };
      atividade: Record<string, number | string | null>;
    };
  }

  describe('GET /api/relatorios/equipe', () => {
    it('conta as transições reais e IGNORA a linha de anexo de documento', async () => {
      const resposta = await http(app)
        .get('/api/relatorios/equipe')
        .set('Authorization', c.admin)
        .expect(200);

      const linha = linhaDo(resposta.body, funcionarioId);

      // Três linhas de histórico foram criadas; só duas são avaliação.
      expect(linha.atividade.etapasAvaliadas).toBe(2);
      expect(linha.atividade.reprovacoes).toBe(1);
    });

    it('não multiplica contagens entre as fontes (o LATERAL agrega isolado)', async () => {
      const resposta = await http(app)
        .get('/api/relatorios/equipe')
        .set('Authorization', c.admin)
        .expect(200);

      const linha = linhaDo(resposta.body, funcionarioId);

      /*
       * Com JOIN direto as linhas se cruzam: 2 avaliações × 2 clientes na
       * carteira daria 4 em ambos. Cada número tem de manter o seu próprio
       * denominador.
       */
      expect(linha.atividade.etapasAvaliadas).toBe(2);
      expect(linha.carteira.clientes).toBe(2);
    });

    it('quem não registrou nada aparece com zero, e não some do relatório', async () => {
      const db = prisma(app);
      const admin = await db.funcionario.findFirstOrThrow({
        where: { role: 'ADMIN' },
      });

      const resposta = await http(app)
        .get('/api/relatorios/equipe')
        .set('Authorization', c.admin)
        .expect(200);

      // É justamente o caso que a gestão quer enxergar; sumir seria o pior erro.
      const linha = linhaDo(resposta.body, admin.id);
      expect(linha.atividade.etapasAvaliadas).toBe(0);
      expect(linha.atividade.ultimaMovimentacao).toBeNull();
    });

    it('a CARTEIRA ignora o período; a ATIVIDADE não', async () => {
      // Janela antiga: nenhuma atividade cai nela, mas a carteira continua.
      const resposta = await http(app)
        .get('/api/relatorios/equipe')
        .query({ de: '2020-01-01', ate: '2020-12-31' })
        .set('Authorization', c.admin)
        .expect(200);

      const linha = linhaDo(resposta.body, funcionarioId);

      expect(linha.atividade.etapasAvaliadas).toBe(0);
      expect(linha.carteira.clientes).toBe(2);
    });

    it('ecoa o período aplicado, para a tela não ter de adivinhar', async () => {
      const resposta = await http(app)
        .get('/api/relatorios/equipe')
        .query({ de: '2026-01-01', ate: '2026-12-31' })
        .set('Authorization', c.admin)
        .expect(200);

      expect(resposta.body.periodo).toEqual({
        de: '2026-01-01',
        ate: '2026-12-31',
      });
    });

    it('recusa período invertido', async () => {
      await http(app)
        .get('/api/relatorios/equipe')
        .query({ de: '2026-12-31', ate: '2026-01-01' })
        .set('Authorization', c.admin)
        .expect(400);
    });

    it('respeita o teto de `limite` do PaginacaoDto', async () => {
      await http(app)
        .get('/api/relatorios/equipe')
        .query({ limite: 5000 })
        .set('Authorization', c.admin)
        .expect(400);
    });

    it.each([
      { ator: 'anônimo', token: () => undefined, esperado: 401 },
      { ator: 'CLIENTE', token: () => c.clienteDono, esperado: 403 },
      { ator: 'FUNCIONARIO', token: () => c.funcionario, esperado: 403 },
      { ator: 'ADMIN', token: () => c.admin, esperado: 200 },
    ])('$ator → $esperado', async ({ token, esperado }) => {
      const requisicao = http(app).get('/api/relatorios/equipe');
      const t = token();
      if (t) requisicao.set('Authorization', t);
      await requisicao.expect(esperado);
    });
  });

  describe('GET /api/relatorios/equipe/exportacao', () => {
    it('baixa o XLSX com o Content-Disposition montado pelo servidor', async () => {
      const resposta = await http(app)
        .get('/api/relatorios/equipe/exportacao')
        .query({ de: '2026-01-01', ate: '2026-06-30' })
        .set('Authorization', c.admin)
        .expect(200);

      expect(resposta.headers['content-disposition']).toContain(
        'desempenho-equipe-2026-01-01-a-2026-06-30.xlsx',
      );
      expect(resposta.headers['content-type']).toContain('spreadsheetml');
    });

    it('baixa o CSV quando pedido', async () => {
      const resposta = await http(app)
        .get('/api/relatorios/equipe/exportacao')
        .query({ de: '2026-01-01', ate: '2026-06-30', formato: 'csv' })
        .set('Authorization', c.admin)
        .expect(200);

      expect(resposta.headers['content-type']).toContain('text/csv');
    });

    it('exige o período — exportar tudo estoura o tempo em serverless', async () => {
      await http(app)
        .get('/api/relatorios/equipe/exportacao')
        .set('Authorization', c.admin)
        .expect(400);
    });

    it('recusa janela maior que 12 meses', async () => {
      await http(app)
        .get('/api/relatorios/equipe/exportacao')
        .query({ de: '2020-01-01', ate: '2026-12-31' })
        .set('Authorization', c.admin)
        .expect(400);
    });

    it('recusa `pagina` em vez de ignorar em silêncio', async () => {
      /*
       * `forbidNonWhitelisted` é o que evita alguém baixar a página 2 achando
       * que baixou o relatório inteiro — o parâmetro seria ignorado e o
       * arquivo sairia normal.
       */
      await http(app)
        .get('/api/relatorios/equipe/exportacao')
        .query({ de: '2026-01-01', ate: '2026-06-30', pagina: 2 })
        .set('Authorization', c.admin)
        .expect(400);
    });
  });
});
