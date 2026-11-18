import { NestExpressApplication } from '@nestjs/platform-express';

import { criarApp, http, prisma } from './utils/aplicacao';
import { Cenario, prepararCenario } from './utils/cenario';

/**
 * A caixa de avisos, de ponta a ponta.
 *
 * O que esta suíte existe para provar é **uma frase**: só o responsável pelo
 * processo recebe aviso, e nem o ADMIN vê a caixa de outro. É uma regra sem
 * exceção nenhuma, e a única forma de verificá-la é com dois funcionários
 * distintos e um evento real — por isso o cenário põe o ANALISTA como
 * responsável e deixa a ADMIN de fora.
 *
 * Nada aqui gera erro quando quebra: um aviso que vaza para a pessoa errada é
 * uma linha a mais numa lista, e um aviso que não nasce é uma lista vazia.
 */
describe('Notificações (e2e)', () => {
  let app: NestExpressApplication;
  let c: Cenario;

  /** O upload confere a ASSINATURA do arquivo, não só o MIME declarado. */
  const pdf = () => Buffer.from('%PDF-1.4', 'latin1');

  beforeAll(async () => {
    app = await criarApp();
    c = await prepararCenario(app);
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Zera o que cada caso suja, SEM remontar o cenário.
   *
   * `prepararCenario` autentica quatro usuários, e chamá-lo por caso estourava
   * o rate limit do login (429 no `LIMITES.email`, a janela por conta-alvo) —
   * a suíte reprovava inteira por um motivo que não tem nada a ver com o que
   * ela testa. Aqui só o estado que os avisos dependem é restaurado.
   */
  beforeEach(async () => {
    const db = prisma(app);

    await db.notificacao.deleteMany({});
    // Só os envios do checklist: a evidência do cenário (`microEtapaId` nulo)
    // é usada por outras asserções e fica.
    await db.documentoCertificacao.deleteMany({
      where: { microEtapaId: { not: null } },
    });
    // Um dos casos tira o responsável para provar que ninguém é avisado.
    await db.processo.update({
      where: { id: c.processoDonoId },
      data: { responsavelId: c.funcionarioId },
    });
  });

  /** O cliente envia um documento para o item que pede documento. */
  async function clienteEnviaDocumento(): Promise<void> {
    const resposta = await http(app)
      .post(
        `/api/certificacoes/processo/${c.processoDonoId}/etapas/${c.certificacaoId}/documento`,
      )
      .set('Authorization', c.clienteDono)
      .field('microEtapaId', String(c.microEtapaDonoId))
      .attach('documento', pdf(), 'calibracao.pdf');

    expect(resposta.status).toBe(201);
  }

  const caixa = (token: string) =>
    http(app).get('/api/notificacoes').set('Authorization', token);

  const contador = (token: string) =>
    http(app).get('/api/notificacoes/nao-lidas').set('Authorization', token);

  describe('quem recebe', () => {
    it('o envio do cliente avisa o RESPONSÁVEL', async () => {
      await clienteEnviaDocumento();

      const resposta = await caixa(c.funcionario);

      expect(resposta.status).toBe(200);
      expect(resposta.body.total).toBe(1);
      expect(resposta.body.dados[0]).toMatchObject({
        tipo: 'DOCUMENTO_ENVIADO',
        processoId: c.processoDonoId,
        lidaEm: null,
      });
      // O texto é composto na gravação, com nome do arquivo e do item.
      expect(resposta.body.dados[0].detalhe).toContain('calibracao.pdf');
    });

    it('o ADMIN não recebe aviso de processo que não é dele', async () => {
      // A decisão é literal: nem o ADMIN. Ele continua vendo tudo pelo quadro
      // e pelos relatórios.
      await clienteEnviaDocumento();

      const resposta = await caixa(c.admin);

      expect(resposta.status).toBe(200);
      expect(resposta.body.total).toBe(0);
    });

    it('processo SEM responsável não avisa ninguém', async () => {
      await prisma(app).processo.update({
        where: { id: c.processoDonoId },
        data: { responsavelId: null },
      });

      await clienteEnviaDocumento();

      expect((await caixa(c.funcionario)).body.total).toBe(0);
      expect((await caixa(c.admin)).body.total).toBe(0);
    });

    it('evidência da equipe (sem item) não avisa ninguém', async () => {
      const resposta = await http(app)
        .post(
          `/api/certificacoes/processo/${c.processoDonoId}/etapas/${c.certificacaoId}/documento`,
        )
        .set('Authorization', c.admin)
        .attach('documento', pdf(), 'laudo.pdf');

      expect(resposta.status).toBe(201);
      expect((await caixa(c.funcionario)).body.total).toBe(0);
    });

    it('a avaliação avisa o responsável, com o parecer da recusa', async () => {
      await clienteEnviaDocumento();
      const aviso = (await caixa(c.funcionario)).body.dados[0];
      // Limpa a caixa para isolar o aviso da avaliação.
      await http(app)
        .patch(`/api/notificacoes/${aviso.id}/leitura`)
        .set('Authorization', c.funcionario);

      const documento = await prisma(app).documentoCertificacao.findFirstOrThrow({
        where: { microEtapaId: c.microEtapaDonoId },
        orderBy: { id: 'desc' },
      });

      const avaliacao = await http(app)
        .patch(`/api/certificacoes/documentos/${documento.id}/avaliacao`)
        .set('Authorization', c.admin)
        .send({ situacao: 'RECUSADO', parecer: 'Certificado fora da validade.' });
      expect(avaliacao.status).toBe(200);

      const naoLidas = await contador(c.funcionario);
      expect(naoLidas.body.naoLidas).toBe(1);

      const resposta = await caixa(c.funcionario);
      const recusa = resposta.body.dados.find(
        (n: { tipo: string }) => n.tipo === 'DOCUMENTO_RECUSADO',
      );
      expect(recusa.detalhe).toContain('Certificado fora da validade.');
    });

    it('quem decide NÃO é avisado da própria decisão', async () => {
      await clienteEnviaDocumento();
      const documento = await prisma(app).documentoCertificacao.findFirstOrThrow({
        where: { microEtapaId: c.microEtapaDonoId },
        orderBy: { id: 'desc' },
      });

      // O responsável é o analista, e é ele quem aceita.
      const avaliacao = await http(app)
        .patch(`/api/certificacoes/documentos/${documento.id}/avaliacao`)
        .set('Authorization', c.funcionario)
        .send({ situacao: 'ACEITO' });
      expect(avaliacao.status).toBe(200);

      // Só o aviso do ENVIO, nenhum da própria aceitação.
      const resposta = await caixa(c.funcionario);
      expect(resposta.body.total).toBe(1);
      expect(resposta.body.dados[0].tipo).toBe('DOCUMENTO_ENVIADO');
    });
  });

  describe('escopo da rota', () => {
    it.each([
      { rota: '/api/notificacoes', metodo: 'get' as const },
      { rota: '/api/notificacoes/nao-lidas', metodo: 'get' as const },
    ])('anônimo recebe 401 em $rota', async ({ rota, metodo }) => {
      expect((await http(app)[metodo](rota)).status).toBe(401);
    });

    it('CLIENTE recebe 403 — a caixa é da equipe', async () => {
      // E a guarda vem ANTES de o id ser usado: `sub` é o id em Cliente OU em
      // Funcionario, e o cliente 2 não pode ler a caixa do funcionário 2.
      expect((await caixa(c.clienteDono)).status).toBe(403);
      expect((await contador(c.clienteDono)).status).toBe(403);

      const marcar = await http(app)
        .post('/api/notificacoes/marcar-todas-lidas')
        .set('Authorization', c.clienteDono);
      expect(marcar.status).toBe(403);
    });

    it('não há como pedir a caixa de outra pessoa', async () => {
      // `destinatarioId` não existe no DTO, e `forbidNonWhitelisted` recusa.
      // É o mesmo `clienteId` de query param que a migração corrigiu do legado.
      const resposta = await caixa(c.admin).query({
        destinatarioId: c.funcionarioId,
      });

      expect(resposta.status).toBe(400);
    });
  });

  describe('leitura', () => {
    it('marcar como lida zera o contador, e é idempotente', async () => {
      await clienteEnviaDocumento();
      const aviso = (await caixa(c.funcionario)).body.dados[0];

      const primeira = await http(app)
        .patch(`/api/notificacoes/${aviso.id}/leitura`)
        .set('Authorization', c.funcionario);
      expect(primeira.status).toBe(200);
      expect(primeira.body.lidaEm).not.toBeNull();

      expect((await contador(c.funcionario)).body.naoLidas).toBe(0);

      // De novo: não regrava a data, senão reabrir a central moveria o
      // "lida em" de tudo para agora.
      const segunda = await http(app)
        .patch(`/api/notificacoes/${aviso.id}/leitura`)
        .set('Authorization', c.funcionario);
      expect(segunda.status).toBe(200);
      expect(segunda.body.lidaEm).toBe(primeira.body.lidaEm);
    });

    it('aviso de OUTRA pessoa dá 404, não 403', async () => {
      // 403 confirmaria que o aviso existe.
      await clienteEnviaDocumento();
      const aviso = (await caixa(c.funcionario)).body.dados[0];

      const resposta = await http(app)
        .patch(`/api/notificacoes/${aviso.id}/leitura`)
        .set('Authorization', c.admin);

      expect(resposta.status).toBe(404);
    });

    it('`apenasNaoLidas` recorta a caixa', async () => {
      await clienteEnviaDocumento();
      const aviso = (await caixa(c.funcionario)).body.dados[0];
      await http(app)
        .patch(`/api/notificacoes/${aviso.id}/leitura`)
        .set('Authorization', c.funcionario);

      const todas = await caixa(c.funcionario);
      expect(todas.body.total).toBe(1);

      const naoLidas = await caixa(c.funcionario).query({
        apenasNaoLidas: 'true',
      });
      expect(naoLidas.body.total).toBe(0);
    });

    it('`apenasNaoLidas=false` traz tudo, e não o oposto', async () => {
      // Query string entrega texto, e a string "false" é verdadeira em
      // JavaScript: sem a conversão no DTO, este filtro faria o contrário do
      // pedido, sem erro nenhum.
      await clienteEnviaDocumento();
      const aviso = (await caixa(c.funcionario)).body.dados[0];
      await http(app)
        .patch(`/api/notificacoes/${aviso.id}/leitura`)
        .set('Authorization', c.funcionario);

      const resposta = await caixa(c.funcionario).query({
        apenasNaoLidas: 'false',
      });

      expect(resposta.status).toBe(200);
      expect(resposta.body.total).toBe(1);
    });

    it('marcar todas devolve quantas mudaram', async () => {
      await clienteEnviaDocumento();

      const primeira = await http(app)
        .post('/api/notificacoes/marcar-todas-lidas')
        .set('Authorization', c.funcionario);
      expect(primeira.body).toEqual({ marcadas: 1 });

      // Nada mais a marcar.
      const segunda = await http(app)
        .post('/api/notificacoes/marcar-todas-lidas')
        .set('Authorization', c.funcionario);
      expect(segunda.body).toEqual({ marcadas: 0 });
    });
  });
});
