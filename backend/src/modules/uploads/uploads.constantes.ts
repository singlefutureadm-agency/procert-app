/**
 * Pastas de `UPLOAD_DIR` e a divisão entre o que é servido como estático e o
 * que só sai por rota autenticada.
 *
 * Fonte única: `main.ts` monta o estático a partir daqui e o `UploadsService`
 * deriva daqui o tipo `PastaUpload`. Acrescentar uma pasta nova exige decidir,
 * no momento da criação, de que lado dessa linha ela fica.
 */

/**
 * Conteúdo sem expectativa de sigilo, consumido direto por `<img src>` ou por
 * `url()` de CSS — não há como exigir Bearer nesses casos.
 *
 * `aparencia` é pública por necessidade: o logo aparece no cabeçalho do site
 * institucional e na tela de login, ambos antes de existir sessão, e o papel de
 * parede entra como `background-image`.
 */
export const PASTAS_PUBLICAS = [
  'clientes',
  'funcionarios',
  'produtos',
  'aparencia',
] as const;

/**
 * Documento formal e dado de cliente. Saem apenas por
 * `GET /certificados/:id/pdf` e `GET /certificacoes/documentos/:id/arquivo`,
 * que aplicam o escopo do CLIENTE. Nome em UUID é obscuridade, não controle de
 * acesso — por isso não são montados como estático.
 */
export const PASTAS_PRIVADAS = ['certificados', 'certificacoes'] as const;

export const PASTAS_UPLOAD = [...PASTAS_PUBLICAS, ...PASTAS_PRIVADAS] as const;

export type PastaPublica = (typeof PASTAS_PUBLICAS)[number];
export type PastaUpload = (typeof PASTAS_UPLOAD)[number];

/** Prefixo das URLs guardadas no banco. Igual nos dois drivers, de propósito. */
export const PREFIXO_UPLOADS = '/uploads/';

/** Usado pelo middleware de negação de `/uploads`, que recebe string crua da URL. */
export function ehPastaPublica(valor: string): valor is PastaPublica {
  return (PASTAS_PUBLICAS as readonly string[]).includes(valor);
}

/**
 * Segmentos de um caminho de `/uploads/...` que podem ser confrontados com a
 * allowlist, ou `null` se o caminho não é confiável.
 *
 * Trabalha sobre o caminho **decodificado** de propósito. O `serve-static`
 * decodifica antes de resolver o arquivo, então olhar só o texto cru deixaria
 * `/uploads/produtos/%2e%2e%2fcertificados/x.pdf` atravessar a allowlist como
 * se `%2e%2e%2fcertificados` fosse um nome de pasta comum. Uma decodificação
 * só, igual à do `serve-static`: caminho com dupla codificação (`%252e`) não
 * vira travessia para nenhum dos dois.
 */
function segmentosSeguros(caminho: string): string[] | null {
  let decodificado: string;
  try {
    decodificado = decodeURIComponent(caminho);
  } catch {
    // Codificação inválida (`%ZZ`) — não dá para saber o que foi pedido.
    return null;
  }

  // A barra invertida entra na separação porque no Windows ela também separa
  // diretório: `produtos\..\certificados` seria travessia em disco.
  const segmentos = decodificado.split(/[\\/]/).filter(Boolean);

  if (segmentos.length === 0) return null;
  if (segmentos.some((segmento) => segmento === '..' || segmento === '.')) {
    return null;
  }

  return segmentos;
}

/**
 * Resolve a pasta pública a partir do caminho cru de uma requisição a
 * `/uploads/...`. Devolve `null` — ou seja, negar — para qualquer coisa fora da
 * allowlist.
 *
 * Servindo do disco, o `serve-static` de cada pasta já recusa sair da própria
 * raiz, então a negação aqui é redundante. Ela existe porque é a única que
 * continua valendo se alguém remontar o diretório inteiro de uploads como
 * estático: nesse cenário `produtos/../certificados/x.pdf` cairia dentro da
 * raiz do mount e voltaria a ser servido. Com armazenamento externo não há
 * `serve-static` nenhum, e esta passa a ser a única barreira.
 */
export function pastaPublicaDaRota(caminho: string): PastaPublica | null {
  const segmentos = segmentosSeguros(caminho);
  if (!segmentos) return null;

  const [pasta] = segmentos;
  return ehPastaPublica(pasta) ? pasta : null;
}

/**
 * Como `pastaPublicaDaRota`, mas exigindo que o caminho aponte para um arquivo
 * dentro da pasta — `<pasta>/<arquivo>`, exatamente dois segmentos.
 *
 * Usado quando o armazenamento publica os arquivos por conta própria e o
 * `/uploads/...` vira um redirecionamento: para redirecionar é preciso saber
 * QUAL arquivo, e um caminho mais fundo (`produtos/a/b.jpg`) não corresponde a
 * nada que este sistema grave — o nome é sempre um UUID no primeiro nível.
 */
export function arquivoPublicoDaRota(
  caminho: string,
): { pasta: PastaPublica; arquivo: string } | null {
  const segmentos = segmentosSeguros(caminho);
  if (!segmentos || segmentos.length !== 2) return null;

  const [pasta, arquivo] = segmentos;
  return ehPastaPublica(pasta) ? { pasta, arquivo } : null;
}

/** Aceita qualquer pasta de upload, pública ou privada. */
export function ehPastaUpload(valor: string): valor is PastaUpload {
  return (PASTAS_UPLOAD as readonly string[]).includes(valor);
}

/**
 * Decompõe a URL relativa guardada no banco (`/uploads/<pasta>/<arquivo>`) nas
 * duas partes que o armazenamento entende.
 *
 * Devolve `null` para qualquer coisa que não tenha exatamente essa forma —
 * inclusive travessia e pasta fora da allowlist. É por aqui que passa TODA
 * leitura e remoção do `UploadsService`, então é aqui que a URL vinda do banco
 * deixa de ser texto livre. O banco não é entrada de usuário, mas as colunas de
 * URL foram populadas pelo ETL do legado, e o legado aceitava o que viesse.
 */
export function arquivoDeUpload(
  urlRelativa?: string | null,
): { pasta: PastaUpload; arquivo: string } | null {
  if (!urlRelativa?.startsWith(PREFIXO_UPLOADS)) return null;

  const segmentos = segmentosSeguros(urlRelativa.slice(PREFIXO_UPLOADS.length));
  if (!segmentos || segmentos.length !== 2) return null;

  const [pasta, arquivo] = segmentos;
  return ehPastaUpload(pasta) ? { pasta, arquivo } : null;
}
