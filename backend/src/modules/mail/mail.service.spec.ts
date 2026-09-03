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
  MAIL_HOST: 'smtp.resend.com',
  MAIL_PORT: '465',
  MAIL_SECURE: 'true',
  MAIL_USER: 'resend',
  MAIL_PASS: 'segredo',
  MAIL_FROM: 'ProCert <nao-responda@procertocp.com.br>',
};

/**
 * O `MailService` é só transporte.
 *
 * A composição do texto saiu daqui para o `NotificacoesService` — o que este
 * arquivo cobre é o que acontece com um HTML já pronto: sai pelo SMTP, ou é
 * registrado no log quando não há SMTP, e em nenhum dos casos a exceção
 * escapa para o fluxo de domínio que pediu o envio.
 */
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

      await servico.enviar('cliente@exemplo.com', 'Assunto', '<p>corpo</p>');

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

      await servico.enviar(
        'cliente@exemplo.com',
        'Redefinição de senha — ProCert',
        '<p>corpo</p>',
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
    it('entrega ao SMTP com o remetente configurado', async () => {
      montar(CONFIG_COM_SMTP);

      await servico.enviar(
        'cliente@exemplo.com',
        'Redefinição de senha — ProCert',
        '<p>corpo</p>',
      );

      expect(enviarSmtp).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'ProCert <nao-responda@procertocp.com.br>',
          to: 'cliente@exemplo.com',
          subject: 'Redefinição de senha — ProCert',
          html: '<p>corpo</p>',
        }),
      );
    });

    /**
     * O envio roda depois do commit da operação de domínio. Uma exceção aqui
     * não pode subir: a avaliação de etapa, a NC ou o certificado já estão
     * gravados, e desfazê-los porque o servidor de e-mail caiu seria trocar um
     * problema pequeno por um grande. O preço é o silêncio — por isso o log.
     */
    it('falha de SMTP não propaga: fica no log e o fluxo de domínio segue', async () => {
      montar(CONFIG_COM_SMTP);
      const erro = jest
        .spyOn(servico['logger'], 'error')
        .mockImplementation(() => undefined);
      enviarSmtp.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        servico.enviar('cliente@exemplo.com', 'Assunto', '<p>corpo</p>'),
      ).resolves.toBeUndefined();

      expect(erro).toHaveBeenCalledWith(
        expect.stringContaining('Falha ao enviar e-mail para cliente@exemplo.com'),
      );
    });
  });
});
