import { ConfigService } from '@nestjs/config';

/**
 * O endereço público do painel, do ponto de vista de quem recebe um link nosso.
 *
 * Existe porque `FRONTEND_URL` era lido em três lugares independentes — o link
 * de redefinição de senha, o rodapé do PDF do certificado e o botão do e-mail
 * de atualização — cada um com a sua própria cópia do fallback
 * `http://localhost:5173`. Três cópias é o número a partir do qual a quarta
 * aparece sozinha, e o estrago de errar aqui não é uniforme: um e-mail com link
 * quebrado se reenvia, mas o PDF do certificado é um documento formal, guardado
 * pelo cliente, com o endereço impresso dentro.
 *
 * Faltando `FRONTEND_URL`, deriva de `CORS_ORIGINS` em vez de cair em
 * `localhost`. As duas descrevem a mesma coisa — o domínio do site, não o da
 * API — e o `DEPLOY.md` sempre as documentou na mesma linha da tabela. A
 * diferença é que sem `CORS_ORIGINS` correta o painel não carrega **nenhuma**
 * tela, então ela é a variável que ninguém consegue esquecer: um erro nela
 * aparece no primeiro minuto, enquanto um erro na outra só aparece dentro de um
 * PDF que alguém vai abrir semanas depois.
 *
 * O `localhost` continua como último recurso, que é o valor certo em
 * desenvolvimento — e é também o default de `CORS_ORIGINS` no `bootstrap`.
 */
export function urlDoPainel(config: ConfigService): string {
  const explicita = config.get<string>('FRONTEND_URL', '').trim();
  if (explicita) return semBarraFinal(explicita);

  // `CORS_ORIGINS` é uma lista separada por vírgula; a primeira é a origem
  // canônica. As demais costumam ser variações (`www.`) que não servem de base
  // para um link que vai dentro de um documento.
  const primeiraOrigem = config
    .get<string>('CORS_ORIGINS', '')
    .split(',')[0]
    .trim();

  return semBarraFinal(primeiraOrigem || 'http://localhost:5173');
}

/**
 * Confere o que só falha em produção, e devolve os problemas em texto.
 *
 * Não lança: a ausência de SMTP degrada o sistema, não o quebra — a avaliação
 * técnica, o certificado e o painel seguem funcionando sem e-mail nenhum.
 * Derrubar o boot da API inteira por causa disso seria trocar uma falha parcial
 * e silenciosa por uma falha total e barulhenta, o que é pior. É por isso que
 * este confere é diferente do de `criarArmazenamento`, que recusa subir: lá o
 * silêncio **perde arquivo**, aqui ele só deixa de avisar.
 *
 * O que se corrige aqui é a visibilidade. O aviso que existia saía uma vez, em
 * nível `warn`, no boot de uma instância fria — ou seja, no meio de um log de
 * requisição qualquer, horas depois do deploy, e no plano Hobby ele expira em
 * uma hora. Em nível `error` e no boot, aparece onde se olha quando se pergunta
 * "por que o cliente não recebeu?".
 */
export function conferirAmbiente(config: ConfigService): string[] {
  if (config.get<string>('NODE_ENV') !== 'production') return [];

  const problemas: string[] = [];

  const faltandoSmtp = ['MAIL_HOST', 'MAIL_USER', 'MAIL_PASS'].filter(
    (variavel) => !config.get<string>(variavel, '').trim(),
  );

  if (faltandoSmtp.length > 0) {
    problemas.push(
      `SMTP incompleto em produção (falta ${faltandoSmtp.join(', ')}). ` +
        'Nenhum e-mail sai: nem a redefinição de senha, nem o aviso de ' +
        'atualização da certificação. Eles são apenas registrados no log.',
    );
  }

  if (!config.get<string>('FRONTEND_URL', '').trim()) {
    problemas.push(
      'FRONTEND_URL não definida em produção — os links de e-mail e o rodapé ' +
        `do PDF do certificado vão usar ${urlDoPainel(config)}, derivado de ` +
        'CORS_ORIGINS. Defina-a explicitamente para não depender disso.',
    );
  }

  return problemas;
}

function semBarraFinal(url: string): string {
  return url.replace(/\/+$/, '');
}
