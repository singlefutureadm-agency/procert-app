import { NestExpressApplication } from '@nestjs/platform-express';

import { criarApp, http, prisma } from './utils/aplicacao';
import { Cenario, prepararCenario } from './utils/cenario';

/**
 * Trilha como catálogo: o vínculo com a categoria, e as guardas que impedem
 * uma categoria de ficar sem processo sem que ninguém perceba.
 *
 * O que só é alcançável aqui, e não no unitário, é a integridade real do banco:
 * o `Restrict` de `categorias_produto.trilha_id`, o `Cascade` das versões e o
 * fato de `produtos.modelo_trilha_id` NÃO se mover quando a categoria troca de
 * trilha — a propriedade que a migração inteira existe para preservar.
 */
describe('Trilhas do catálogo (e2e)', () => {
  let app: NestExpressApplication;
  let c: Cenario;

  beforeAll(async () => {
    app = await criarApp();
    c = await prepararCenario(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const pedir = (
    metodo: 'get' | 'post' | 'patch' | 'delete',
    rota: string,
    token?: string,
  ) => {
    const requisicao = http(app)[metodo](rota);
    return token ? requisicao.set('Authorization', token) : requisicao;
  };

  describe('escrita é só de ADMIN', () => {
    it.each([
      ['POST /api/trilhas', 'post' as const, '/api/trilhas'],
      ['PATCH /api/trilhas/:id', 'patch' as const, '/api/trilhas/1'],
      ['DELETE /api/trilhas/:id', 'delete' as const, '/api/trilhas/1'],
      [
        'PATCH /api/categorias-produto/:id/trilha',
        'patch' as const,
        '/api/categorias-produto/1/trilha',
      ],
    ])('%s — FUNCIONARIO recebe 403', async (_, metodo, rota) => {
      // Alterar uma trilha muda o processo de avaliação de TODA categoria
      // vinculada a ela. É decisão de gestão, não de operação.
      const resposta = await pedir(metodo, rota, c.funcionario).send({});
      expect(resposta.status).toBe(403);
    });
  });

  describe('POST /api/trilhas', () => {
    it('cria a trilha e a versão 1 no mesmo commit, numerada 1..N', async () => {
      const resposta = await pedir('post', '/api/trilhas', c.admin).send({
        nome: 'Trilha simplificada',
        etapas: [
          { nome: 'Análise documental', tipo: 'DOCUMENTAL' },
          { nome: 'Decisão', tipo: 'DECISAO' },
        ],
      });

      expect(resposta.status).toBe(201);
      expect(resposta.body.modeloVigente).toMatchObject({
        versao: 1,
        totalEtapas: 2,
      });

      const etapas = await prisma(app).modeloEtapa.findMany({
        where: { modeloTrilha: { trilhaId: resposta.body.id } },
        orderBy: { ordem: 'asc' },
      });
      expect(etapas.map((e) => [e.nome, e.ordem])).toEqual([
        ['Análise documental', 1],
        ['Decisão', 2],
      ]);
    });

    it('recusa nome duplicado com 409', async () => {
      const resposta = await pedir('post', '/api/trilhas', c.admin).send({
        nome: 'Trilha de material elétrico',
        etapas: [{ nome: 'Etapa', tipo: 'OUTRO' }],
      });
      expect(resposta.status).toBe(409);
    });

    it('recusa campo fora do DTO (mass-assignment)', async () => {
      const resposta = await pedir('post', '/api/trilhas', c.admin).send({
        nome: 'Com campo a mais',
        status: 'INATIVO',
      });
      expect(resposta.status).toBe(400);
    });
  });

  describe('PATCH /api/categorias-produto/:id/trilha — o vínculo', () => {
    it('trocar a trilha da categoria NÃO move produto em andamento', async () => {
      const nova = await pedir('post', '/api/trilhas', c.admin).send({
        nome: 'Trilha de destino',
        etapas: [{ nome: 'Etapa única', tipo: 'OUTRO' }],
      });

      const antes = await prisma(app).produto.findUniqueOrThrow({
        where: { id: c.produtoDonoId },
        select: { modeloTrilhaId: true },
      });

      const resposta = await pedir(
        'patch',
        `/api/categorias-produto/${c.categoriaId}/trilha`,
        c.admin,
      ).send({ trilhaId: nova.body.id });

      expect(resposta.status).toBe(200);
      expect(resposta.body.trilha).toMatchObject({ nome: 'Trilha de destino' });

      /*
       * O ponto da mudança inteira. `Produto.modeloTrilhaId` é o retrato da
       * versão pela qual o produto entrou; se ele acompanhasse a categoria, uma
       * troca de trilha reescreveria a régua de todo mundo que já está em
       * avaliação — em silêncio, e sem caminho de volta.
       */
      const depois = await prisma(app).produto.findUniqueOrThrow({
        where: { id: c.produtoDonoId },
        select: { modeloTrilhaId: true },
      });
      expect(depois.modeloTrilhaId).toBe(antes.modeloTrilhaId);
      expect(depois.modeloTrilhaId).toBe(c.modeloTrilhaId);

      // devolve o cenário ao estado original para os testes seguintes
      await pedir(
        'patch',
        `/api/categorias-produto/${c.categoriaId}/trilha`,
        c.admin,
      ).send({ trilhaId: c.trilhaId });
    });

    it('recusa vincular trilha sem versão vigente', async () => {
      const vazia = await pedir('post', '/api/trilhas', c.admin).send({
        nome: 'Trilha sem versão',
      });
      expect(vazia.body.modeloVigente).toBeNull();

      const resposta = await pedir(
        'patch',
        `/api/categorias-produto/${c.categoriaId}/trilha`,
        c.admin,
      ).send({ trilhaId: vazia.body.id });

      // Vincular aqui deixaria a categoria aparentemente configurada e
      // recusando todo produto novo, sem nada na tela explicando por quê.
      expect(resposta.status).toBe(409);
    });

    it('recusa trilha inexistente com 404', async () => {
      const resposta = await pedir(
        'patch',
        `/api/categorias-produto/${c.categoriaId}/trilha`,
        c.admin,
      ).send({ trilhaId: 999999 });
      expect(resposta.status).toBe(404);
    });
  });

  describe('DELETE /api/trilhas/:id — as guardas de integridade', () => {
    it('recusa excluir trilha vinculada a categoria', async () => {
      const resposta = await pedir(
        'delete',
        `/api/trilhas/${c.trilhaId}`,
        c.admin,
      );

      expect(resposta.status).toBe(409);
      // A trilha do cenário está vinculada E tem produtos: a mensagem precisa
      // apontar o vínculo, que é o que o usuário resolve primeiro.
      expect(resposta.body.message).toMatch(/Material elétrico/);
    });

    it('exclui trilha livre, levando versões e etapas por cascade', async () => {
      const criada = await pedir('post', '/api/trilhas', c.admin).send({
        nome: 'Trilha descartável',
        etapas: [{ nome: 'Etapa', tipo: 'OUTRO' }],
      });

      const resposta = await pedir(
        'delete',
        `/api/trilhas/${criada.body.id}`,
        c.admin,
      );
      expect(resposta.status).toBe(200);

      const versoes = await prisma(app).modeloTrilha.count({
        where: { trilhaId: criada.body.id },
      });
      expect(versoes).toBe(0);
    });
  });

  describe('PATCH /api/modelos-trilha/:id/vigente — voltar atrás', () => {
    it('promove a versão anterior e encerra a atual, zerando vigenteAte', async () => {
      const trilha = await pedir('post', '/api/trilhas', c.admin).send({
        nome: 'Trilha versionada',
        etapas: [{ nome: 'Etapa v1', tipo: 'OUTRO' }],
      });
      const v1 = trilha.body.modeloVigente.id;

      const v2 = await pedir(
        'post',
        `/api/trilhas/${trilha.body.id}/modelos-trilha`,
        c.admin,
      ).send({ etapas: [{ nome: 'Etapa v2', tipo: 'OUTRO' }] });
      expect(v2.body.versao).toBe(2);

      const volta = await pedir(
        'patch',
        `/api/modelos-trilha/${v1}/vigente`,
        c.admin,
      );
      expect(volta.status).toBe(200);

      const versoes = await prisma(app).modeloTrilha.findMany({
        where: { trilhaId: trilha.body.id },
        orderBy: { versao: 'asc' },
        select: { versao: true, ativo: true, vigenteAte: true },
      });

      expect(versoes).toEqual([
        { versao: 1, ativo: true, vigenteAte: null },
        { versao: 2, ativo: false, vigenteAte: expect.any(Date) },
      ]);
    });
  });
});
