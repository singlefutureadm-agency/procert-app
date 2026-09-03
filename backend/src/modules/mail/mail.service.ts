import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';


/**
 * Envio de e-mail via SMTP.
 *
 * No legado as constantes EMAIL_HOST/PORT/USER/PASS existiam mas nunca eram
 * usadas — o sistema chamava mail() nativo, e o link enviado apontava para
 * uma rota inexistente. Aqui o SMTP configurado é de fato utilizado.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const host = this.config.get<string>('MAIL_HOST');
    const user = this.config.get<string>('MAIL_USER');

    if (!host || !user) {
      // Em desenvolvimento é o comportamento desejado; em produção é a
      // funcionalidade inteira ausente, e o nível precisa acusar isso.
      const aviso =
        'SMTP não configurado — os e-mails serão apenas registrados no log.';
      if (this.emProducao()) this.logger.error(aviso);
      else this.logger.warn(aviso);
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: Number(this.config.get<number>('MAIL_PORT', 465)),
      secure: this.config.get<string>('MAIL_SECURE', 'true') === 'true',
      auth: { user, pass: this.config.get<string>('MAIL_PASS') },
    });
  }

  async enviar(para: string, assunto: string, html: string): Promise<void> {
    if (!this.transporter) {
      // "SIMULADO" descrevia bem o caso de desenvolvimento e mal o de
      // produção, onde ninguém pediu simulação nenhuma: é um e-mail que o
      // destinatário nunca vai receber, e o texto agora diz isso.
      const linha = `[NÃO ENVIADO — sem SMTP] Para: ${para} | Assunto: ${assunto}`;
      if (this.emProducao()) this.logger.error(linha);
      else this.logger.log(linha);
      this.logger.debug(html);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.config.get<string>('MAIL_FROM', 'ProCert <nao-responda@procertocp.com.br>'),
        to: para,
        subject: assunto,
        html,
      });
    } catch (error) {
      // Nunca propagamos falha de e-mail para o fluxo de autenticação:
      // isso permitiria enumerar contas pelo tempo/erro de resposta.
      this.logger.error(
        `Falha ao enviar e-mail para ${para}: ${(error as Error).message}`,
      );
    }
  }

  private emProducao(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }
}
