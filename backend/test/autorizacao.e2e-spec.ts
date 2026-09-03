import { NestExpressApplication } from '@nestjs/platform-express';
import { StatusCertificado } from '@prisma/client';

import { criarApp, http, prisma } from './utils/aplicacao';
import { Cenario, prepararCenario } from './utils/cenario';

/**
 * Matriz de autorização, com os cinco atores em cada alvo: anônimo, CLIENTE
 * dono, CLIENTE alheio, FUNCIONARIO e ADMIN.
 *
 * É o que garante que um `@Roles` removido por acidente não passe despercebido,
 * e é a rede sob o escopo do CLIENTE dentro dos services — exatamente o IDOR que
 * a migração corrigiu do legado, onde o `clienteId` vinha de query param.
 */
describe('Autorização (e2e)', () => {
  let app: NestExpressApplication;
  let c: Cenario;

  beforeAll(async () => {
    app = await criarApp();
    c = await prepararCenario(app);
  });

  afterAll(async () => {
    await app.close();
  });

  function pedir(metodo: 'get' | 'post' | 'put' | 'patch' | 'delete', rota: string, token?: string) {
    const requisicao = http(app)[metodo](rota);
    return token ? requisicao.set('Authorization', token) : requisicao;
  }

  describe('GET /api/certificados/:id/pdf — download autenticado', () => {
    it.each([
      { ator: 'anônimo', token: () => undefined, esperado: 401 },
      { ator: 'CLIENTE dono', token: () => c.clienteDono, esperado: 200 },
      { ator: 'CLIENTE alheio', token: () => c.clienteAlheio, esperado: 403 },
      { ator: 'FUNCIONARIO', token: () => c.funcionario, esperado: 200 },
      { ator: 'ADMIN', token: () => c.admin, esperado: 200 },
    ])('$ator → $esperado', async ({ token, esperado }) => {
      const resposta = await pedir(
        'get',
        `/api/certificados/${c.certificadoId}/pdf`,
        token(),
      );

      expect(resposta.status).toBe(esperado);
    });

    it('o dono recebe de fato o PDF, não uma página de erro', async () => {
      const resposta = await pedir(
        'get',
        `/api/certificados/${c.certificadoId}/pdf`,
        c.clienteDono,
      );

      expect(resposta.headers['content-type']).toContain('application/pdf');
      expect(resposta.body.length).toBeGreaterThan(0);
    });

    it('o 403 do cliente alheio não vaza o número do certificado', async () => {
      const resposta = await pedir(
        'get',
        `/api/certificados/${c.certificadoId}/pdf`,
        c.clienteAlheio,
      );

      expect(JSON.stringify(resposta.body)).not.toContain('PROCERT-2026-000001');
    });
  });

  describe('GET /api/certificacoes/documentos/:id/arquivo — evidência de etapa', () => {
    it.each([
      { ator: 'anônimo', token: () => undefined, esperado: 401 },
      { ator: 'CLIENTE dono', token: () => c.clienteDono, esperado: 200 },
      { ator: 'CLIENTE alheio', token: () => c.clienteAlheio, esperado: 403 },
      { ator: 'FUNCIONARIO', token: () => c.funcionario, esperado: 200 },
      { ator: 'ADMIN', token: () => c.admin, esperado: 200 },
    ])('$ator → $esperado', async ({ token, esperado }) => {
      const resposta = await pedir(
        'get',
        `/api/certificacoes/documentos/${c.documentoId}/arquivo`,
        token(),
      );

      expect(resposta.status).toBe(esperado);
    });
  });

  describe('PUT /api/certificacoes/produto/:id — cliente acompanha, não altera', () => {
    const corpo = () => ({
      etapas: [{ id: c.certificacaoId, status: 'EM_ANDAMENTO' }],
    });

    it.each([
      { ator: 'anônimo', token: () => undefined, esperado: 401 },
      { ator: 'CLIENTE dono', token: () => c.clienteDono, esperado: 403 },
      { ator: 'CLIENTE alheio', token: () => c.clienteAlheio, esperado: 403 },
    ])('$ator → $esperado', async ({ token, esperado }) => {
      const resposta = await pedir(
        'put',
        `/api/certificacoes/produto/${c.produtoDonoId}`,
        token(),
      ).send(corpo());

      expect(resposta.status).toBe(esperado);
    });

    it('FUNCIONARIO consegue escrever', async () => {
      const resposta = await pedir(
        'put',
        `/api/certificacoes/produto/${c.produtoDonoId}`,
        c.funcionario,
      ).send(corpo());

      expect(resposta.status).toBe(200);
    });

    it('o CLIENTE dono é barrado pelo @Roles, antes de o service ler qualquer coisa', async () => {
      const resposta = await pedir(
        'put',
        `/api/certificacoes/produto/${c.produtoDonoId}`,
        c.clienteDono,
      ).send(corpo());

      expect(resposta.status).toBe(403);
      // Nada foi gravado: a etapa continua como o teste anterior a deixou.
      const etapa = await prisma(app).certificacaoProduto.findUniqueOrThrow({
        where: { id: c.certificacaoId },
      });
      expect(etapa.status).toBe('EM_ANDAMENTO');
    });
  });

  describe('catálogo interno — CLIENTE é barrado inclusive na LEITURA', () => {
    it.each([
      ['GET /api/categorias-produto', '/api/categorias-produto'],
      ['GET /api/trilhas', '/api/trilhas'],
      ['GET /api/trilhas/:id', '/api/trilhas/1'],
      ['GET /api/trilhas/:id/modelos-trilha', '/api/trilhas/1/modelos-trilha'],
      ['GET /api/modelos-trilha/:id', '/api/modelos-trilha/1'],
    ])('%s', async (_, rota) => {
      // Trilha e categoria são configuração interna do OCP: expõem o processo
      // de avaliação e os critérios. Cliente não lê nem por curiosidade.
      await expect(pedir('get', rota).then((r) => r.status)).resolves.toBe(401);
      await expect(
        pedir('get', rota, c.clienteDono).then((r) => r.status),
      ).resolves.toBe(403);
      await expect(
        pedir('get', rota, c.funcionario).then((r) => r.status),
      ).resolves.not.toBe(403);
      await expect(
        pedir('get', rota, c.admin).then((r) => r.status),
      ).resolves.not.toBe(403);
    });
  });

  describe('GET /api/dashboard/metricas — o CLIENTE não enxerga a carteira', () => {
    it('CLIENTE vê totalClientes === 1', async () => {
      const resposta = await pedir('get', '/api/dashboard/metricas', c.clienteDono);

      expect(resposta.status).toBe(200);
      // O cenário tem 2 clientes. Devolver 2 revelaria o tamanho da carteira do
      // OCP para qualquer cliente logado.
      expect(resposta.body.totalClientes).toBe(1);
    });

    it('ADMIN vê os 2 clientes do cenário', async () => {
      const resposta = await pedir('get', '/api/dashboard/metricas', c.admin);

      expect(resposta.body.totalClientes).toBe(2);
    });

    it('anônimo → 401', async () => {
      await expect(
        pedir('get', '/api/dashboard/metricas').then((r) => r.status),
      ).resolves.toBe(401);
    });
  });

  describe('GET /api/health — público por design', () => {
    it('responde 200 sem token: é o que o load balancer consulta', async () => {
      const resposta = await pedir('get', '/api/health');

      expect(resposta.status).toBe(200);
      expect(resposta.body).toMatchObject({ status: 'ok', banco: 'ok' });
      expect(typeof resposta.body.latenciaBancoMs).toBe('number');
    });

    it('não vaza nada da string de conexão', async () => {
      const resposta = await pedir('get', '/api/health');
      const corpo = JSON.stringify(resposta.body);

      // A rota é pública e consulta o banco. Se um dia o erro do driver
      // escapar daqui, ele traz host, porta e às vezes usuário — meia string
      // de conexão entregue a quem perguntar. O service já trata; isto trava.
      for (const vazamento of ['5433', 'postgres', 'procert_test', 'password', 'localhost']) {
        expect(corpo.toLowerCase()).not.toContain(vazamento);
      }
    });
  });

  describe('GET /api/dashboard/graficos — agregados com escopo de CLIENTE', () => {
    it('anônimo → 401', async () => {
      await expect(
        pedir('get', '/api/dashboard/graficos').then((r) => r.status),
      ).resolves.toBe(401);
    });

    it('ADMIN vê os 2 produtos do cenário', async () => {
      const resposta = await pedir('get', '/api/dashboard/graficos', c.admin);

      expect(resposta.status).toBe(200);
      expect(resposta.body.acompanhamento.totalProdutos).toBe(2);
    });

    it('CLIENTE vê só o próprio produto', async () => {
      const resposta = await pedir('get', '/api/dashboard/graficos', c.clienteDono);

      expect(resposta.status).toBe(200);
      expect(resposta.body.acompanhamento.totalProdutos).toBe(1);
    });

    it('o ranking do CLIENTE não cita produto nem nome de outro cliente', async () => {
      // Este é o vetor real: `ranking` carrega nome do produto E nome do
      // cliente. Um gráfico com escopo quebrado não parece errado — só mostra
      // números maiores —, então a asserção precisa ser sobre o conteúdo.
      const resposta = await pedir('get', '/api/dashboard/graficos', c.clienteAlheio);
      const ranking = JSON.stringify(resposta.body.acompanhamento.ranking);

      expect(ranking).toContain('Tomada 20A');
      expect(ranking).not.toContain('Disjuntor DIN 25A');
      expect(ranking).not.toContain('Indústria Dona');
    });

    it('o cliente sem certificado não enxerga o certificado do outro', async () => {
      const alheio = await pedir('get', '/api/dashboard/graficos', c.clienteAlheio);
      const dono = await pedir('get', '/api/dashboard/graficos', c.clienteDono);

      const somar = (corpo: { certificados: { porStatus: Array<{ total: number }> } }) =>
        corpo.certificados.porStatus.reduce((soma, faixa) => soma + faixa.total, 0);

      // O único certificado do cenário é do dono.
      expect(somar(alheio.body)).toBe(0);
      expect(somar(dono.body)).toBe(1);
    });
  });

  describe('GET /api/certificacoes/produto/:id/exportacao — planilha', () => {
    it.each([
      { ator: 'anônimo', token: () => undefined, esperado: 401 },
      { ator: 'CLIENTE dono', token: () => c.clienteDono, esperado: 200 },
      { ator: 'CLIENTE alheio', token: () => c.clienteAlheio, esperado: 403 },
      { ator: 'FUNCIONARIO', token: () => c.funcionario, esperado: 200 },
      { ator: 'ADMIN', token: () => c.admin, esperado: 200 },
    ])('$ator → $esperado', async ({ token, esperado }) => {
      const resposta = await pedir(
        'get',
        `/api/certificacoes/produto/${c.produtoDonoId}/exportacao`,
        token(),
      );

      expect(resposta.status).toBe(esperado);
    });

    it('o XLSX sai como anexo, com nome vindo do servidor', async () => {
      const resposta = await pedir(
        'get',
        `/api/certificacoes/produto/${c.produtoDonoId}/exportacao`,
        c.clienteDono,
      );

      expect(resposta.headers['content-type']).toContain(
        'spreadsheetml.sheet',
      );
      expect(resposta.headers['content-disposition']).toMatch(
        /^attachment; filename=".+\.xlsx"$/,
      );
    });

    it('formato=csv devolve CSV', async () => {
      const resposta = await pedir(
        'get',
        `/api/certificacoes/produto/${c.produtoDonoId}/exportacao?formato=csv`,
        c.admin,
      );

      expect(resposta.status).toBe(200);
      expect(resposta.headers['content-type']).toContain('text/csv');
      expect(resposta.headers['content-disposition']).toMatch(/\.csv"$/);
    });

    it('formato inválido → 400, não um arquivo corrompido', async () => {
      const resposta = await pedir(
        'get',
        `/api/certificacoes/produto/${c.produtoDonoId}/exportacao?formato=pdf`,
        c.admin,
      );

      expect(resposta.status).toBe(400);
    });

    it('parâmetro não declarado no DTO → 400 (forbidNonWhitelisted vale na query)', async () => {
      const resposta = await pedir(
        'get',
        `/api/certificacoes/produto/${c.produtoDonoId}/exportacao?colunas=todas`,
        c.admin,
      );

      expect(resposta.status).toBe(400);
    });
  });

  describe('escopo do CLIENTE vence o query param (o IDOR do legado)', () => {
    it('GET /api/certificados?clienteId=<alheio> devolve só os do próprio token', async () => {
      const resposta = await pedir(
        'get',
        `/api/certificados?clienteId=${c.clienteAlheioId}`,
        c.clienteDono,
      );

      expect(resposta.status).toBe(200);
      // O único certificado do cenário é do dono. Se o filtro da URL vencesse,
      // a lista viria vazia — ou, pior, com o do vizinho.
      expect(resposta.body.total).toBe(1);
      expect(resposta.body.dados[0].produto.clienteId).toBe(c.clienteDonoId);
    });

    it('GET /api/produtos?clienteId=<alheio> idem', async () => {
      const resposta = await pedir(
        'get',
        `/api/produtos?clienteId=${c.clienteAlheioId}`,
        c.clienteDono,
      );

      expect(resposta.status).toBe(200);
      expect(resposta.body.total).toBe(1);
      expect(
        resposta.body.dados.every(
          (p: { clienteId: number }) => p.clienteId === c.clienteDonoId,
        ),
      ).toBe(true);
    });

    it('GET /api/produtos/:id de outro cliente → 403', async () => {
      const resposta = await pedir(
        'get',
        `/api/produtos/${c.produtoAlheioId}`,
        c.clienteDono,
      );

      expect(resposta.status).toBe(403);
    });

    it('GET /api/clientes é ADMIN/FUNCIONARIO: o CLIENTE nem chega ao service', async () => {
      // Mais restritivo do que "escopo por token": a rota inteira é da equipe.
      await expect(
        pedir('get', `/api/clientes?clienteId=${c.clienteAlheioId}`, c.clienteDono).then(
          (r) => r.status,
        ),
      ).resolves.toBe(403);
      await expect(
        pedir('get', '/api/clientes', c.funcionario).then((r) => r.status),
      ).resolves.toBe(200);
    });
  });

  describe('mass-assignment — whitelist + forbidNonWhitelisted', () => {
    it('POST /api/clientes com "role" no payload → 400', async () => {
      const resposta = await pedir('post', '/api/clientes', c.admin).send({
        nome: 'Tentativa de Escalada Ltda',
        email: 'escalada@cliente.com.br',
        senha: 'Procert@2026',
        role: 'ADMIN',
      });

      expect(resposta.status).toBe(400);
      expect(JSON.stringify(resposta.body)).toContain('role');

      // E nada foi criado.
      const criado = await prisma(app).cliente.findUnique({
        where: { email: 'escalada@cliente.com.br' },
      });
      expect(criado).toBeNull();
    });

    it('POST /api/clientes com "status" no payload também é recusado', async () => {
      const resposta = await pedir('post', '/api/clientes', c.admin).send({
        nome: 'Outra Tentativa Ltda',
        email: 'outra@cliente.com.br',
        senha: 'Procert@2026',
        status: 'INATIVO',
      });

      expect(resposta.status).toBe(400);
    });

    it('o mesmo payload SEM o campo extra é aceito — prova que o 400 veio do campo', async () => {
      const resposta = await pedir('post', '/api/clientes', c.admin).send({
        nome: 'Cliente Legítimo Ltda',
        email: 'legitimo@cliente.com.br',
        senha: 'Procert@2026',
      });

      expect(resposta.status).toBe(201);
      expect(resposta.body).not.toHaveProperty('senhaHash');
    });
  });

  describe('DELETE /api/clientes/:id — integridade referencial', () => {
    it('cliente com produto vinculado → 409', async () => {
      const resposta = await pedir(
        'delete',
        `/api/clientes/${c.clienteDonoId}`,
        c.admin,
      );

      expect(resposta.status).toBe(409);
      const aindaExiste = await prisma(app).cliente.findUnique({
        where: { id: c.clienteDonoId },
      });
      expect(aindaExiste).not.toBeNull();
    });

    it('é rota de ADMIN: FUNCIONARIO → 403, CLIENTE → 403, anônimo → 401', async () => {
      await expect(
        pedir('delete', `/api/clientes/${c.clienteDonoId}`).then((r) => r.status),
      ).resolves.toBe(401);
      await expect(
        pedir('delete', `/api/clientes/${c.clienteDonoId}`, c.clienteDono).then(
          (r) => r.status,
        ),
      ).resolves.toBe(403);
      await expect(
        pedir('delete', `/api/clientes/${c.clienteDonoId}`, c.funcionario).then(
          (r) => r.status,
        ),
      ).resolves.toBe(403);
    });
  });

  describe('POST /api/certificados/expirar-vencidos — só ADMIN', () => {
    it.each([
      { ator: 'anônimo', token: () => undefined, esperado: 401 },
      { ator: 'CLIENTE dono', token: () => c.clienteDono, esperado: 403 },
      { ator: 'FUNCIONARIO', token: () => c.funcionario, esperado: 403 },
    ])('$ator → $esperado', async ({ token, esperado }) => {
      const resposta = await pedir(
        'post',
        '/api/certificados/expirar-vencidos',
        token(),
      );

      expect(resposta.status).toBe(esperado);
    });

    it('ADMIN → 200 e a rotina realmente marca o vencido', async () => {
      // Empurra o certificado do cenário para fora da validade.
      await prisma(app).certificado.update({
        where: { id: c.certificadoId },
        data: { dataValidade: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      const resposta = await pedir(
        'post',
        '/api/certificados/expirar-vencidos',
        c.admin,
      );

      expect(resposta.status).toBe(201);
      expect(resposta.body.atualizados).toBe(1);

      const certificado = await prisma(app).certificado.findUniqueOrThrow({
        where: { id: c.certificadoId },
      });
      expect(certificado.status).toBe(StatusCertificado.VENCIDO);
    });

    it('é idempotente: a segunda chamada não encontra mais nada', async () => {
      const resposta = await pedir(
        'post',
        '/api/certificados/expirar-vencidos',
        c.admin,
      );

      expect(resposta.body.atualizados).toBe(0);
    });
  });

  describe('sessão', () => {
    it('token ausente → 401 em rota protegida', async () => {
      await expect(
        pedir('get', '/api/produtos').then((r) => r.status),
      ).resolves.toBe(401);
    });

    it('token malformado → 401', async () => {
      const resposta = await pedir(
        'get',
        '/api/produtos',
        'Bearer nao.e.um.token',
      );

      expect(resposta.status).toBe(401);
    });

    it('GET /api/aparencia é público — o painel precisa do tema antes do login', async () => {
      const resposta = await pedir('get', '/api/aparencia');

      expect(resposta.status).toBe(200);
    });

    it('cadastro desativado perde acesso IMEDIATAMENTE, com o token ainda válido', async () => {
      const token = c.clienteAlheio;
      await expect(
        pedir('get', '/api/produtos', token).then((r) => r.status),
      ).resolves.toBe(200);

      await prisma(app).cliente.update({
        where: { id: c.clienteAlheioId },
        data: { status: 'INATIVO' },
      });

      // A JwtStrategy revalida no banco a cada request: não é preciso esperar o
      // token expirar nem manter lista de revogação.
      await expect(
        pedir('get', '/api/produtos', token).then((r) => r.status),
      ).resolves.toBe(401);

      await prisma(app).cliente.update({
        where: { id: c.clienteAlheioId },
        data: { status: 'ATIVO' },
      });
    });
  });
});
