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
