import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync, statSync } from 'node:fs';

import { criarApp, http, requisicaoCrua } from './utils/aplicacao';
import { caminhoDoArquivo, Cenario, prepararCenario } from './utils/cenario';

/**
 * `/uploads`: o que é servido como estático e o que não é.
 *
 * A regra que está sendo travada: `PASTAS_PUBLICAS` são montadas, as privadas
 * não, e nenhum caminho de travessia atravessa a fronteira. Cada 404 aqui só
 * vale se o arquivo correspondente ESTIVER em disco — a verificação de presença
 * faz parte do teste, senão ele passa provando apenas que o arquivo não existe.
 */
describe('/uploads (e2e)', () => {
  let app: NestExpressApplication;
  let cenario: Cenario;

  beforeAll(async () => {
    app = await criarApp();
    cenario = await prepararCenario(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('pré-condição: os arquivos existem em disco', () => {
    it.each([
      ['certificados', () => cenario.arquivos.certificados],
      ['certificacoes', () => cenario.arquivos.certificacoes],
      ['produtos', () => cenario.arquivos.produtos],
      ['aparencia', () => cenario.arquivos.aparencia],
    ])('%s', (pasta, nome) => {
      const caminho = caminhoDoArquivo(pasta, nome());
      expect(existsSync(caminho)).toBe(true);
      expect(statSync(caminho).size).toBeGreaterThan(0);
    });
  });

  describe('pastas privadas — 404 mesmo com o arquivo presente', () => {
    it('GET /uploads/certificados/<arquivo>.pdf → 404', async () => {
      const resposta = await http(app).get(
        `/uploads/certificados/${cenario.arquivos.certificados}`,
      );

      expect(resposta.status).toBe(404);
      // A mensagem prova que quem negou foi o middleware da allowlist, e não o
      // roteador do Nest por não achar rota.
      expect(resposta.body.message).toBe('Arquivo não encontrado.');
    });

    it('GET /uploads/certificacoes/<arquivo>.pdf → 404', async () => {
      const resposta = await http(app).get(
        `/uploads/certificacoes/${cenario.arquivos.certificacoes}`,
      );

      expect(resposta.status).toBe(404);
      expect(resposta.body.message).toBe('Arquivo não encontrado.');
    });

    it('token válido NÃO abre o estático: a pasta simplesmente não é servida', async () => {
      const resposta = await http(app)
        .get(`/uploads/certificados/${cenario.arquivos.certificados}`)
        .set('Authorization', cenario.admin);

      expect(resposta.status).toBe(404);
    });

    it('listagem de diretório e a raiz também são negadas', async () => {
      await expect(
        http(app)
          .get('/uploads/certificados/')
          .then((r) => r.status),
      ).resolves.toBe(404);
      await expect(
        http(app)
          .get('/uploads/')
          .then((r) => r.status),
      ).resolves.toBe(404);
    });
  });

  describe('pastas públicas — servidas sem token', () => {
    it('GET /uploads/produtos/<arquivo>.png → 200', async () => {
      const resposta = await http(app).get(
        `/uploads/produtos/${cenario.arquivos.produtos}`,
      );

      expect(resposta.status).toBe(200);
      expect(resposta.headers['content-type']).toContain('image/png');
    });

    it('GET /uploads/aparencia/<arquivo>.png → 200 (logo e papel de parede carregam antes da sessão)', async () => {
      // Este caso existe para impedir que alguém "estreite" a allowlist por
      // zelo e quebre a marca do painel na tela de login e no site público,
      // onde não há como exigir Bearer.
      const resposta = await http(app).get(
        `/uploads/aparencia/${cenario.arquivos.aparencia}`,
      );

      expect(resposta.status).toBe(200);
    });

    it('pasta fora da allowlist → 404', async () => {
      const resposta = await http(app).get('/uploads/inexistente/x.png');

      expect(resposta.status).toBe(404);
      expect(resposta.body.message).toBe('Arquivo não encontrado.');
    });
  });

  describe('travessia a partir de uma pasta pública', () => {
    /**
     * Todas via `requisicaoCrua`, com o caminho enviado literalmente.
     *
     * Usar o supertest aqui daria um falso verde em parte dos casos: ele segue
     * a especificação de URL e resolve os segmentos `..` — inclusive escritos
     * como `%2e%2e` — antes de abrir a conexão. O request de
     * `produtos/%2e%2e/%2e%2e/certificados/x.pdf` sairia como
     * `/certificados/x.pdf`, nem chegaria a `/uploads`, e o 404 seria só "não
     * existe essa rota". Foi exatamente esse erro que invalidou a verificação
     * manual da sessão anterior (ver DOCUMENTACAO.md §15).
     */
    const travessias = [
      ['../ literal', 'produtos/../certificados'],
      ['%2e%2e%2f', 'produtos/%2e%2e%2fcertificados'],
      ['..%2f', 'produtos/..%2fcertificados'],
      ['%2e%2e/%2e%2e/', 'produtos/%2e%2e/%2e%2e/certificados'],
      ['..%5c (barra invertida)', 'produtos/..%5ccertificados'],
      ['%2e%2e%5c', 'produtos/%2e%2e%5ccertificados'],
    ] as const;

    it.each(travessias)('%s → 404, negado pela allowlist', async (_, prefixo) => {
      const resposta = await requisicaoCrua(
        app,
        `/uploads/${prefixo}/${cenario.arquivos.certificados}`,
      );

      expect(resposta.status).toBe(404);
      // Não basta o 404: a decisão precisa ser da allowlist. Se este corpo
      // voltar a ser "Cannot GET …", quem negou foi a confinação de raiz do
      // serve-static — que deixa de existir se alguém remontar o diretório
      // inteiro de uploads como estático.
      expect(JSON.parse(resposta.corpo).message).toBe('Arquivo não encontrado.');
      // E o conteúdo do PDF não vazou em nenhuma hipótese.
      expect(resposta.corpo).not.toContain('%PDF');
    });

    it('o caminho realmente sai do cliente sem normalização', async () => {
      // Guarda do próprio teste: se um dia `requisicaoCrua` passar a normalizar,
      // os casos acima viram tautologia e ninguém perceberia.
      const resposta = await requisicaoCrua(
        app,
        '/uploads/produtos/../certificados/x.pdf',
      );

      expect(resposta.caminhoEnviado).toContain('/..');
    });

    it('codificação inválida (%ZZ) → 404', async () => {
      const resposta = await requisicaoCrua(app, '/uploads/produtos/%ZZ/x.png');

      expect(resposta.status).toBe(404);
      expect(JSON.parse(resposta.corpo).message).toBe('Arquivo não encontrado.');
    });
  });
});
