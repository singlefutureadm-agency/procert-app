import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { urlDoPainel } from '../../common/utils/ambiente.util';
import { MailService } from './mail.service';

/**
 * Composição dos e-mails que a plataforma envia.
 *
 * O `MailService` voltou a ser só transporte: recebe destinatário, assunto e
 * HTML pronto e entrega ao SMTP. Quem decide o que está escrito é este serviço.
 *
 * A separação não é gosto por camada. Os três e-mails que existiam traziam o
 * mesmo bloco de HTML copiado — a mesma fonte, a mesma largura, o mesmo botão,
 * a mesma cor escrita à mão em cada um. Cada evento novo copiaria o bloco de
 * novo, e a quarta cópia é onde uma delas fica para trás sem ninguém notar:
 * e-mail não quebra, ele só sai feio para o cliente e ninguém no time o vê.
 *
 * A cor é constante e não vem de `ConfiguracaoAparencia`. Ler os tokens do
 * admin daria um e-mail combinando com o painel, ao custo de uma consulta ao
 * banco por envio, num caminho que roda depois do commit e não pode falhar.
 * Não vale a troca enquanto a marca for uma cor só.
 */
const COR_MARCA = '#0d6efd';
const COR_TEXTO = '#1f2937';
const COR_APAGADA = '#6b7280';

/**
 * HTML que já passou por escape e pode ser interpolado como está.
 *
 * Existe para que `seguro` distinga "texto que veio do banco" de "trecho que
 * este arquivo montou". Sem a distinção, a única saída seria confiar em quem
 * escreve o template — que foi exatamente o arranjo anterior, com um
 * `this.escapar()` manual em cada interpolação e nada que acusasse o
 * esquecimento.
 */
class Html {
  constructor(private readonly valor: string) {}
  toString(): string {
    return this.valor;
  }
}

/** Marca um trecho como HTML pronto, dispensando o escape de `seguro`. */
export function html(valor: string): Html {
  return new Html(valor);
}

/**
 * Template que escapa toda interpolação, menos as marcadas com `html()`.
 *
 * Nome de produto, de etapa e de cliente são texto livre digitado no painel.
 * Antes iam para o HTML por `this.escapar(x)` escrito à mão em cada ponto;
 * aqui o padrão se inverte — esquecer passa a ser impossível, e deixar passar
 * exige o gesto explícito de `html()`.
 */
export function seguro(
  partes: TemplateStringsArray,
  ...valores: unknown[]
): string {
  return partes.reduce((acumulado, parte, indice) => {
    if (indice >= valores.length) return acumulado + parte;
    const valor = valores[indice];
    const texto = valor instanceof Html ? valor.toString() : escapar(String(valor));
    return acumulado + parte + texto;
  }, '');
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Remove quebras de linha do assunto.
 *
 * O assunto carrega nome de produto vindo do banco, e cabeçalho de e-mail é
 * delimitado por CRLF: um nome com `\r\n` dentro emenda cabeçalho falso na
 * mensagem. O `nodemailer` 9 recusa por conta própria — mas recusar é o
 * comportamento dele, não uma garantia nossa, e a versão que o recusa é a que
 * está instalada hoje. Era um risco aberto conhecido (`DOCUMENTACAO.md` §15);
 * saneando na composição, ele deixa de depender da biblioteca.
 */
function assuntoLimpo(texto: string): string {
  return texto.replace(/[\r\n]+/g, ' ').trim();
}

interface Aviso {
  /** Título dentro do corpo, em destaque. */
  titulo: string;
  /** Nome de quem recebe, para a saudação. */
  destinatario: string;
  /** Parágrafos do corpo, montados com `seguro`. */
  corpo: string;
  /** Botão. O texto é fixo do código; a URL é montada aqui. */
  acao?: { texto: string; url: string };
  /** Substitui o rodapé padrão de aviso automático. */
  rodape?: string;
}

@Injectable()
export class NotificacoesService {
  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /** Aviso de que etapas da trilha mudaram de status. */
  async certificacaoAtualizada(
    para: string,
    nomeCliente: string,
    produto: string,
    produtoId: number,
    mudancas: Array<{ etapa: string; status: string }>,
  ): Promise<void> {
    const itens = mudancas
      .map(
        ({ etapa, status }) =>
          seguro`<li style="margin-bottom:6px"><strong>${etapa}</strong>: ${status}</li>`,
      )
      .join('');

    const quantas =
      mudancas.length === 1
        ? 'uma etapa atualizada'
        : `${mudancas.length} etapas atualizadas`;

    await this.enviar(para, `Atualização na certificação — ${produto}`, {
      titulo: 'Atualização na certificação',
      destinatario: nomeCliente,
      corpo: seguro`
        <p>A avaliação do produto <strong>${produto}</strong> teve ${quantas}:</p>
        <ul style="padding-left:18px">${html(itens)}</ul>`,
      acao: {
        texto: 'Acompanhar no painel',
        url: `${urlDoPainel(this.config)}/certificacoes/produto/${produtoId}`,
      },
    });
  }

  /** Link de redefinição de senha. */
  async redefinicaoDeSenha(
    para: string,
    nome: string,
    link: string,
  ): Promise<void> {
    await this.enviar(para, 'Redefinição de senha — ProCert', {
      titulo: 'Redefinição de senha',
      destinatario: nome,
      corpo: seguro`<p>Recebemos um pedido para redefinir a sua senha de acesso à plataforma ProCert.</p>`,
      acao: { texto: 'Criar nova senha', url: link },
      rodape:
        'O link expira em 1 hora e só pode ser usado uma vez.<br>' +
        'Se você não solicitou a redefinição, ignore esta mensagem.',
    });
  }

  // ---------------------------------------------------------------- privados

  private async enviar(
    para: string,
    assunto: string,
    aviso: Aviso,
  ): Promise<void> {
    await this.mail.enviar(para, assuntoLimpo(assunto), this.montar(aviso));
  }

  /** O invólucro comum: cabeçalho, saudação, corpo, botão e rodapé. */
  private montar({ titulo, destinatario, corpo, acao, rodape }: Aviso): string {
    const botao = acao
      ? seguro`
        <p style="margin:28px 0">
          <a href="${acao.url}"
             style="background:${html(COR_MARCA)};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">
            ${acao.texto}
          </a>
        </p>`
      : '';

    const encerramento =
      rodape ?? 'Este é um aviso automático. Não é necessário responder a esta mensagem.';

    return seguro`
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:${html(COR_TEXTO)}">
        <h2 style="color:${html(COR_MARCA)}">${titulo} — ProCert</h2>
        <p>Olá, ${destinatario}.</p>
        ${html(corpo)}
        ${html(botao)}
        <p style="font-size:13px;color:${html(COR_APAGADA)}">
          ${html(encerramento)}
        </p>
      </div>`;
  }
}
