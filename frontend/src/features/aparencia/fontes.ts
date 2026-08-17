/**
 * Catálogo de fontes do painel.
 *
 * A configuração guarda só o **id** (`'montserrat'`); a pilha CSS e o
 * carregamento moram aqui. Duas consequências práticas: o servidor valida a
 * fonte comparando com uma lista curta de slugs, e adicionar uma fonte nova
 * não exige migration — só uma entrada neste arquivo e o id espelhado em
 * `FONTES_PERMITIDAS` no backend.
 *
 * As famílias do Google entram sob demanda (ver `garantirFonteCarregada`).
 * Pré-carregar dezesseis famílias no `index.html` custaria centenas de KB para
 * usar uma.
 */

export interface Fonte {
  id: string;
  rotulo: string;
  pilha: string;
  /** Ausente nas fontes do sistema, que não precisam de download. */
  google?: string;
}

const SISTEMA = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export const FONTES: Fonte[] = [
  {
    id: 'segoe-ui',
    rotulo: 'Segoe UI (padrão)',
    pilha: "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
  },
  { id: 'system', rotulo: 'Fonte do sistema', pilha: SISTEMA },

  { id: 'inter', rotulo: 'Inter', pilha: `Inter, ${SISTEMA}`, google: 'Inter' },
  { id: 'roboto', rotulo: 'Roboto', pilha: `Roboto, ${SISTEMA}`, google: 'Roboto' },
  {
    id: 'open-sans',
    rotulo: 'Open Sans',
    pilha: `'Open Sans', ${SISTEMA}`,
    google: 'Open+Sans',
  },
  { id: 'lato', rotulo: 'Lato', pilha: `Lato, ${SISTEMA}`, google: 'Lato' },
  {
    id: 'montserrat',
    rotulo: 'Montserrat',
    pilha: `Montserrat, ${SISTEMA}`,
    google: 'Montserrat',
  },
  {
    id: 'poppins',
    rotulo: 'Poppins',
    pilha: `Poppins, ${SISTEMA}`,
    google: 'Poppins',
  },
  { id: 'nunito', rotulo: 'Nunito', pilha: `Nunito, ${SISTEMA}`, google: 'Nunito' },
  {
    id: 'raleway',
    rotulo: 'Raleway',
    pilha: `Raleway, ${SISTEMA}`,
    google: 'Raleway',
  },
  {
    id: 'work-sans',
    rotulo: 'Work Sans',
    pilha: `'Work Sans', ${SISTEMA}`,
    google: 'Work+Sans',
  },
  {
    id: 'dm-sans',
    rotulo: 'DM Sans',
    pilha: `'DM Sans', ${SISTEMA}`,
    google: 'DM+Sans',
  },
  {
    id: 'source-sans-3',
    rotulo: 'Source Sans 3',
    pilha: `'Source Sans 3', ${SISTEMA}`,
    google: 'Source+Sans+3',
  },
  {
    id: 'plus-jakarta-sans',
    rotulo: 'Plus Jakarta Sans',
    pilha: `'Plus Jakarta Sans', ${SISTEMA}`,
    google: 'Plus+Jakarta+Sans',
  },
  {
    id: 'manrope',
    rotulo: 'Manrope',
    pilha: `Manrope, ${SISTEMA}`,
    google: 'Manrope',
  },
  { id: 'rubik', rotulo: 'Rubik', pilha: `Rubik, ${SISTEMA}`, google: 'Rubik' },
];

const POR_ID = new Map(FONTES.map((f) => [f.id, f]));

export function buscarFonte(id: string): Fonte {
  return POR_ID.get(id) ?? FONTES[0];
}

export function pilhaDaFonte(id: string): string {
  return buscarFonte(id).pilha;
}

/**
 * Injeta o `<link>` do Google Fonts da família, uma vez por id.
 *
 * Chamado tanto na aplicação do tema quanto na pré-visualização, então precisa
 * ser idempotente e barato — daí a checagem pelo id do elemento.
 *
 * `display=swap`: o texto aparece imediatamente na fonte de fallback e troca
 * quando a família chega. O contrário (bloquear o render) piscaria a tela em
 * branco toda vez que o admin trocasse a fonte no select.
 */
export function garantirFonteCarregada(id: string): void {
  const fonte = buscarFonte(id);
  if (!fonte.google) return;

  const idElemento = `fonte-google-${fonte.id}`;
  if (document.getElementById(idElemento)) return;

  const link = document.createElement('link');
  link.id = idElemento;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fonte.google}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}
