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

/** Usado pelo middleware de negação de `/uploads`, que recebe string crua da URL. */
export function ehPastaPublica(valor: string): valor is PastaPublica {
  return (PASTAS_PUBLICAS as readonly string[]).includes(valor);
}

/**
 * Resolve a pasta pública a partir do caminho cru de uma requisição a
 * `/uploads/...`. Devolve `null` — ou seja, negar — para qualquer coisa fora da
 * allowlist.
 *
 * Trabalha sobre o caminho **decodificado** de propósito. O `serve-static`
 * decodifica antes de resolver o arquivo, então olhar só o texto cru deixaria
 * `/uploads/produtos/%2e%2e%2fcertificados/x.pdf` atravessar a allowlist como
 * se `%2e%2e%2fcertificados` fosse um nome de pasta comum. Uma decodificação só,
 * igual à do `serve-static`: caminho com dupla codificação (`%252e`) não vira
 * travessia para nenhum dos dois.
 *
 * Hoje o `serve-static` de cada pasta já recusa sair da própria raiz, então a
 * negação aqui é redundante. Ela existe porque é a única que continua valendo se
 * alguém remontar o diretório inteiro de uploads como estático: nesse cenário
 * `produtos/../certificados/x.pdf` cairia dentro da raiz do mount e voltaria a
 * ser servido.
 */
export function pastaPublicaDaRota(caminho: string): PastaPublica | null {
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

  const [pasta] = segmentos;
  return ehPastaPublica(pasta) ? pasta : null;
}
