import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { urlDoPainel } from '../../common/utils/ambiente.util';

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

  /**
   * Avisa o cliente que etapas da certificação do seu produto mudaram.
   *
   * Não recebe objetos do Prisma de propósito: o serviço de e-mail não deve
   * conhecer o modelo de dados, só o que vai no texto.
   */
  async enviarAtualizacaoCertificacao(
    para: string,
    nomeCliente: string,
    produto: string,
    produtoId: number,
    mudancas: Array<{ etapa: string; status: string }>,
  ): Promise<void> {
    const link = `${urlDoPainel(this.config)}/certificacoes/produto/${produtoId}`;

    const linhas = mudancas
      .map(
        ({ etapa, status }) =>
          `<li style="margin-bottom:6px"><strong>${this.escapar(etapa)}</strong>: ${this.escapar(status)}</li>`,
      )
      .join('');

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
        <h2 style="color:#0d6efd">Atualização na certificação — ProCert</h2>
        <p>Olá, ${this.escapar(nomeCliente)}.</p>
        <p>A avaliação do produto <strong>${this.escapar(produto)}</strong> teve
           ${mudancas.length === 1 ? 'uma etapa atualizada' : `${mudancas.length} etapas atualizadas`}:</p>
        <ul style="padding-left:18px">${linhas}</ul>
        <p style="margin:28px 0">
          <a href="${link}"
             style="background:#0d6efd;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">
            Acompanhar no painel
          </a>
        </p>
        <p style="font-size:13px;color:#6b7280">
          Este é um aviso automático. Não é necessário responder a esta mensagem.
        </p>
      </div>`;

    await this.enviar(para, `Atualização na certificação — ${produto}`, html);
  }

  private emProducao(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  /** Nome de produto e etapa vêm do banco: escapar antes de montar o HTML. */
  private escapar(texto: string): string {
    return texto
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async enviarRedefinicaoSenha(
    para: string,
    nome: string,
    link: string,
  ): Promise<void> {
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
        <h2 style="color:#0d6efd">Redefinição de senha — ProCert</h2>
        <p>Olá, ${nome}.</p>
        <p>Recebemos um pedido para redefinir a sua senha de acesso à plataforma ProCert.</p>
        <p style="margin:28px 0">
          <a href="${link}"
             style="background:#0d6efd;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">
            Criar nova senha
          </a>
        </p>
        <p style="font-size:13px;color:#6b7280">
          O link expira em 1 hora e só pode ser usado uma vez.<br>
          Se você não solicitou a redefinição, ignore esta mensagem.
        </p>
      </div>`;

    await this.enviar(para, 'Redefinição de senha — ProCert', html);
  }
}
