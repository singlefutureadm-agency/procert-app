import { ConfigService } from '@nestjs/config';
import { mockDeep } from 'jest-mock-extended';

import { MailService } from './mail.service';
import { html, NotificacoesService, seguro } from './notificacoes.service';

describe('NotificacoesService', () => {
  let servico: NotificacoesService;
  let mail: jest.Mocked<MailService>;

  /** Argumentos do último `mail.enviar(para, assunto, html)`. */
  function ultimoEnvio() {
    const [para, assunto, corpo] = mail.enviar.mock.calls.at(-1) as [
      string,
      string,
      string,
    ];
    return { para, assunto, corpo };
  }

  function montar(valores: Record<string, string> = {}) {
    mail = mockDeep<MailService>();
    mail.enviar.mockResolvedValue(undefined);

    const config = {
      get: (chave: string, padrao?: string) => valores[chave] ?? padrao,
    } as unknown as ConfigService;

    servico = new NotificacoesService(mail, config);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    montar({ FRONTEND_URL: 'https://painel.exemplo.com.br' });
  });

  // ------------------------------------------------------------------ seguro

  describe('seguro — o template que escapa sozinho', () => {
    it('escapa toda interpolação vinda de fora', () => {
      expect(seguro`<p>${'<script>alert(1)</script>'}</p>`).toBe(
        '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
      );
    });

    it('escapa aspas, que fechariam um atributo', () => {
      expect(seguro`<a title="${'" onmouseover="x'}">`).toBe(
        '<a title="&quot; onmouseover=&quot;x">',
      );
    });

    /**
     * A escotilha existe para compor um trecho a partir de outro já seguro —
     * a lista de etapas, o botão. É gesto explícito de propósito: o padrão é
     * escapar, e deixar passar exige escrever `html()`.
     */
    it('não escapa o que foi marcado com html()', () => {
      expect(seguro`<ul>${html('<li>ok</li>')}</ul>`).toBe('<ul><li>ok</li></ul>');
    });

    it('converte não-string sem quebrar', () => {
      expect(seguro`n=${42}`).toBe('n=42');
    });
  });

  // -------------------------------------------------- certificação atualizada

  describe('certificacaoAtualizada', () => {
    const mudancas = [{ etapa: 'Ensaios laboratoriais', status: 'Reprovado' }];

    it('monta assunto, destinatário e link do produto', async () => {
      await servico.certificacaoAtualizada(
        'cliente@exemplo.com',
        'Indústria Cliente Ltda',
        'Disjuntor DIN 25A',
        7,
        mudancas,
      );

      const { para, assunto, corpo } = ultimoEnvio();
      expect(para).toBe('cliente@exemplo.com');
      expect(assunto).toBe('Atualização na certificação — Disjuntor DIN 25A');
      expect(corpo).toContain(
        'https://painel.exemplo.com.br/certificacoes/produto/7',
      );
      expect(corpo).toContain('Olá, Indústria Cliente Ltda.');
      expect(corpo).toContain('Ensaios laboratoriais');
    });

    /**
     * Nome de produto e de etapa são texto livre digitado no painel. Antes o
     * escape era um `this.escapar(x)` manual em cada interpolação; o teste
     * continua aqui porque a garantia mudou de dono, não de importância.
     */
    it('escapa nome de produto e de etapa antes de montar o HTML', async () => {
      await servico.certificacaoAtualizada(
        'cliente@exemplo.com',
        'Cliente',
        '<img src=x onerror=alert(1)>',
        1,
        [{ etapa: '<script>', status: 'Aprovado' }],
      );

      const { corpo } = ultimoEnvio();
      expect(corpo).not.toContain('<img src=x');
      expect(corpo).not.toContain('<script>');
      expect(corpo).toContain('&lt;script&gt;');
    });

    it('concorda o texto com a quantidade de etapas', async () => {
      await servico.certificacaoAtualizada('c@e.com', 'C', 'P', 1, mudancas);
      expect(ultimoEnvio().corpo).toContain('uma etapa atualizada');

      await servico.certificacaoAtualizada('c@e.com', 'C', 'P', 1, [
        ...mudancas,
        { etapa: 'Auditoria', status: 'Aprovado' },
      ]);
      expect(ultimoEnvio().corpo).toContain('2 etapas atualizadas');
    });

    /**
     * Fecha o risco aberto que estava registrado em `DOCUMENTACAO.md` §15.
     *
     * O assunto carrega o nome do produto vindo do banco, e cabeçalho de
     * e-mail é delimitado por CRLF: um nome colado de planilha com `\r\n`
     * dentro emendaria um cabeçalho falso. O `nodemailer` 9 recusa a mensagem
     * inteira nesse caso — e como `MailService.enviar` engole a exceção, o
     * efeito era o cliente deixar de receber o aviso em silêncio.
     *
     * O spec do MailService trazia este caso com a asserção invertida
     * (`expect(subject).toContain` do CRLF) e um comentário dizendo que ele
     * passaria a falhar quando o saneamento existisse. É este commit.
     */
    it('saneia o CRLF do assunto — nome de produto não emenda cabeçalho', async () => {
      await servico.certificacaoAtualizada(
        'cliente@exemplo.com',
        'Cliente',
        'Disjuntor DIN 25A\r\nBcc: terceiro@exemplo.com',
        1,
        mudancas,
      );

      const { assunto } = ultimoEnvio();
      expect(assunto).not.toMatch(/[\r\n]/);
      expect(assunto).toBe(
        'Atualização na certificação — Disjuntor DIN 25A Bcc: terceiro@exemplo.com',
      );
    });

    it('nome de produto normal continua intacto no assunto', async () => {
      await servico.certificacaoAtualizada(
        'cliente@exemplo.com',
        'Cliente',
        'Disjuntor DIN 25A',
        1,
        mudancas,
      );

      expect(ultimoEnvio().assunto).toBe(
        'Atualização na certificação — Disjuntor DIN 25A',
      );
    });
  });

  // ---------------------------------------------------- redefinição de senha

  describe('redefinicaoDeSenha', () => {
    it('leva o link recebido e o rodapé próprio, não o de aviso automático', async () => {
      await servico.redefinicaoDeSenha(
        'cliente@exemplo.com',
        'Cliente',
        'https://painel.exemplo.com.br/redefinir-senha?token=abc',
      );

      const { assunto, corpo } = ultimoEnvio();
      expect(assunto).toBe('Redefinição de senha — ProCert');
      expect(corpo).toContain('redefinir-senha?token=abc');
      expect(corpo).toContain('O link expira em 1 hora');
      expect(corpo).not.toContain('Não é necessário responder');
    });
  });

  // -------------------------------------------------------------- invólucro

  describe('invólucro comum', () => {
    it('todos os avisos saem com o mesmo cabeçalho de marca', async () => {
      await servico.certificacaoAtualizada('c@e.com', 'C', 'P', 1, []);
      const primeiro = ultimoEnvio().corpo;

      await servico.redefinicaoDeSenha('c@e.com', 'C', 'link');
      const segundo = ultimoEnvio().corpo;

      for (const corpo of [primeiro, segundo]) {
        expect(corpo).toContain('font-family:Arial,Helvetica,sans-serif');
        expect(corpo).toContain('max-width:520px');
        expect(corpo).toContain('#0d6efd');
        expect(corpo).toContain('— ProCert</h2>');
      }
    });

    /**
     * Sem `FRONTEND_URL`, `urlDoPainel` deriva de `CORS_ORIGINS`. O e-mail é
     * um dos três lugares onde esse endereço aparece, e o único que o
     * destinatário clica.
     */
    it('sem FRONTEND_URL, o link vem de CORS_ORIGINS', async () => {
      montar({ CORS_ORIGINS: 'https://procert-app.vercel.app' });

      await servico.certificacaoAtualizada('c@e.com', 'C', 'P', 9, []);

      expect(ultimoEnvio().corpo).toContain(
        'https://procert-app.vercel.app/certificacoes/produto/9',
      );
    });
  });
});
