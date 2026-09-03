import { ConfigService } from '@nestjs/config';
import { mockDeep } from 'jest-mock-extended';
import * as nodemailer from 'nodemailer';

import { MailService } from './mail.service';

jest.mock('nodemailer');

const criarTransport = nodemailer.createTransport as jest.MockedFunction<
  typeof nodemailer.createTransport
>;

/** `.env` com SMTP configurado — sem isso o serviço só simula. */
const CONFIG_COM_SMTP: Record<string, string> = {
  MAIL_HOST: 'smtp.hostinger.com',
  MAIL_PORT: '465',
  MAIL_SECURE: 'true',
  MAIL_USER: 'nao-responda@procertocp.com.br',
  MAIL_PASS: 'segredo',
  MAIL_FROM: 'ProCert <nao-responda@procertocp.com.br>',
  FRONTEND_URL: 'http://localhost:5173',
};

describe('MailService', () => {
  let servico: MailService;
  let config: jest.Mocked<ConfigService>;
  let enviarSmtp: jest.Mock;

  function montar(valores: Record<string, string>) {
    config = mockDeep<ConfigService>();
    config.get.mockImplementation(
      (chave: string, padrao?: unknown) => (valores[chave] ?? padrao) as never,
    );

    enviarSmtp = jest.fn().mockResolvedValue({ messageId: 'ok' });
    criarTransport.mockReturnValue({
      sendMail: enviarSmtp,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);

    servico = new MailService(config);
    servico.onModuleInit();
    return servico;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('modo simulado (sem SMTP no .env)', () => {
    it('não instancia o transporter e apenas registra em log', async () => {
      montar({});
      const log = jest
        .spyOn(servico['logger'], 'log')
        .mockImplementation(() => undefined);

      await servico.enviarRedefinicaoSenha(
        'cliente@exemplo.com',
        'Cliente',
        'http://localhost:5173/redefinir-senha?token=abc',
      );

      expect(criarTransport).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('[NÃO ENVIADO — sem SMTP] Para: cliente@exemplo.com'),
      );
    });

    /**
     * O mesmo caminho, em produção, é outra coisa: ninguém pediu simulação, e
     * o que houve foi um e-mail que o destinatário não recebeu. Em nível `log`
     * isso se perde entre as linhas de requisição — foi assim que a ausência
     * de SMTP em produção passou despercebida desde a publicação até
     * 01/09/2026, quando o log da função foi lido à procura de outra coisa.
     */
    it('em produção o mesmo caso sai como error, com destinatário e assunto', async () => {
      montar({ NODE_ENV: 'production' });
      const erro = jest
        .spyOn(servico['logger'], 'error')
        .mockImplementation(() => undefined);

      await servico.enviarRedefinicaoSenha(
        'cliente@exemplo.com',
        'Cliente',
        'https://painel.exemplo.com.br/redefinir-senha?token=abc',
      );

      const linha = erro.mock.calls.at(-1)?.[0] as string;
      expect(linha).toContain('[NÃO ENVIADO — sem SMTP]');
      expect(linha).toContain('cliente@exemplo.com');
      expect(linha).toContain('Redefinição de senha — ProCert');
    });

    /** O boot também precisa acusar: é a única linha antes da primeira falha. */
    it('em produção o aviso de boot sobe de warn para error', () => {
      const servicoLocal = new MailService({
        get: (chave: string, padrao?: string) =>
          ({ NODE_ENV: 'production' })[chave] ?? padrao,
      } as never);
      const erro = jest
        .spyOn(servicoLocal['logger'], 'error')
        .mockImplementation(() => undefined);

      servicoLocal.onModuleInit();

      expect(erro).toHaveBeenCalledWith(
        expect.stringContaining('SMTP não configurado'),
      );
    });
  });

  describe('modo real', () => {
    it('envia com o remetente configurado', async () => {
      montar(CONFIG_COM_SMTP);

      await servico.enviarRedefinicaoSenha(
        'cliente@exemplo.com',
        'Cliente',
        'http://localhost:5173/redefinir-senha?token=abc',
      );

      expect(enviarSmtp).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'ProCert <nao-responda@procertocp.com.br>',
          to: 'cliente@exemplo.com',
          subject: 'Redefinição de senha — ProCert',
        }),
      );
    });

    it('escapa nome de produto e de etapa antes de montar o HTML', async () => {
      montar(CONFIG_COM_SMTP);

      await servico.enviarAtualizacaoCertificacao(
        'cliente@exemplo.com',
        'Cliente',
        '<img src=x onerror=alert(1)>',
        1,
        [{ etapa: '<script>', status: 'Aprovado' }],
      );

      const [{ html }] = enviarSmtp.mock.calls[0];
      expect(html).not.toContain('<img src=x');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('falha de SMTP não propaga: fica no log e o fluxo de domínio segue', async () => {
      montar(CONFIG_COM_SMTP);
      const erro = jest
        .spyOn(servico['logger'], 'error')
        .mockImplementation(() => undefined);
      enviarSmtp.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        servico.enviarRedefinicaoSenha('cliente@exemplo.com', 'Cliente', 'link'),
      ).resolves.toBeUndefined();

      expect(erro).toHaveBeenCalledWith(
        expect.stringContaining('Falha ao enviar e-mail para cliente@exemplo.com'),
      );
    });
  });

  /**
   * Risco aberto registrado em `DOCUMENTACAO.md` §15.
   *
   * O upgrade `nodemailer` 6 → 9 (commit ed279ee) fechou a injeção de cabeçalho
   * por CRLF, mas as versões novas **rejeitam** o header malformado lançando
   * exceção, onde as antigas saneavam e seguiam.
   *
   * `enviarAtualizacaoCertificacao` monta o assunto com o nome do produto vindo
   * do banco — um nome com `\r\n` (colado de planilha, por exemplo) passa a
   * derrubar o envio. O `try/catch` de `enviar` engole a exceção, e o efeito
   * prático é o cliente deixar de receber o aviso **em silêncio**, com a
   * avaliação de etapa gravada normalmente.
   *
   * Estes testes travam as duas metades: a operação de domínio não cai, e a
   * falha aparece no log. Quando o saneamento do assunto for implementado, o
   * segundo teste passa a falhar — de propósito, para forçar a revisão.
   */
  describe('CRLF no assunto (risco aberto — nodemailer 9 rejeita em vez de sanear)', () => {
    const PRODUTO_COM_CRLF =
      'Disjuntor DIN 25A\r\nBcc: terceiro@exemplo.com';

    it('o assunto sai do banco SEM saneamento — é daqui que vem o problema', async () => {
      montar(CONFIG_COM_SMTP);

      await servico.enviarAtualizacaoCertificacao(
        'cliente@exemplo.com',
        'Cliente',
        PRODUTO_COM_CRLF,
        1,
        [{ etapa: 'Ensaios', status: 'Aprovado' }],
      );

      const [{ subject }] = enviarSmtp.mock.calls[0];
      expect(subject).toContain('\r\n');
    });

    it('quando o nodemailer rejeita o CRLF, a exceção NÃO escapa e o erro vai para o log', async () => {
      montar(CONFIG_COM_SMTP);
      const erro = jest
        .spyOn(servico['logger'], 'error')
        .mockImplementation(() => undefined);

      // Reproduz a recusa do nodemailer ≥ 7 para header com quebra de linha.
      enviarSmtp.mockImplementation(({ subject }: { subject: string }) => {
        if (/[\r\n]/.test(subject)) {
          return Promise.reject(
            new Error('Invalid header value: line break detected'),
          );
        }
        return Promise.resolve({ messageId: 'ok' });
      });

      // A operação de domínio (a avaliação da etapa) não pode cair por isso.
      await expect(
        servico.enviarAtualizacaoCertificacao(
          'cliente@exemplo.com',
          'Cliente',
          PRODUTO_COM_CRLF,
          1,
          [{ etapa: 'Ensaios', status: 'Aprovado' }],
        ),
      ).resolves.toBeUndefined();

      // ...mas alguém precisa conseguir descobrir que o aviso não saiu.
      expect(erro).toHaveBeenCalledWith(
        expect.stringContaining('Falha ao enviar e-mail para cliente@exemplo.com'),
      );
      expect(erro).toHaveBeenCalledWith(
        expect.stringContaining('line break detected'),
      );
    });

    it('nome de produto normal continua passando', async () => {
      montar(CONFIG_COM_SMTP);
      enviarSmtp.mockImplementation(({ subject }: { subject: string }) =>
        /[\r\n]/.test(subject)
          ? Promise.reject(new Error('Invalid header value'))
          : Promise.resolve({ messageId: 'ok' }),
      );

      await servico.enviarAtualizacaoCertificacao(
        'cliente@exemplo.com',
        'Cliente',
        'Disjuntor DIN 25A',
        1,
        [{ etapa: 'Ensaios', status: 'Aprovado' }],
      );

      const [{ subject }] = enviarSmtp.mock.calls[0];
      expect(subject).toBe('Atualização na certificação — Disjuntor DIN 25A');
    });
  });
});
