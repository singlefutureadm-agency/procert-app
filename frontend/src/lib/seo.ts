import { useEffect } from 'react';

/**
 * Meta tags por rota.
 *
 * O `index.html` traz um único `<title>` e uma única `<meta description>` para
 * o site inteiro. Enquanto a home era a única página pública isso bastava; com
 * /sobre, /servicos e /contato, três páginas passariam a disputar o mesmo
 * título e a mesma descrição no resultado de busca — que é justamente o que se
 * quer evitar ao criar páginas separadas.
 *
 * Escrito à mão em vez de `react-helmet-async` pelo mesmo critério que manteve
 * os gráficos e os ícones sem biblioteca: são ~90 linhas, e a dependência
 * traria um provider a mais na árvore para resolver um problema que o DOM já
 * resolve.
 *
 * **Pré-render.** Crawlers que não executam JS — as prévias de link do
 * WhatsApp, LinkedIn e X, e a maior parte dos robôs de IA — leem só o HTML
 * servido. Por isso as rotas públicas são renderizadas no build
 * (`src/prerender.tsx` + `scripts/prerender.mjs`): `useSeo` entrega os dados a
 * `seoColetado` durante a renderização no servidor, e `htmlDoSeo` escreve no
 * `<head>` do arquivo as mesmas tags que `aplicarSeo` escreve no DOM — as duas
 * saem de `tagsDoSeo`, para não divergirem.
 */

/**
 * Origem pública do site, usada em canonical e Open Graph — que exigem URL
 * absoluta. É o domínio definitivo, definido pelo cliente em 12/11/2026, e vale
 * também em QA e na Vercel: o canonical apontando para ele é o que impede uma
 * URL de homologação de disputar a busca com o site. `VITE_SITE_URL`
 * sobrescreve, para um ambiente que precise se declarar canônico.
 */
export const URL_SITE = (
  import.meta.env.VITE_SITE_URL || 'https://www.procertocp.com.br'
).replace(/\/$/, '');

export interface DadosSeo {
  titulo: string;
  descricao: string;
  /** Caminho da rota, com barra inicial. Vira canonical e og:url. */
  caminho: string;
  /** Caminho da imagem de compartilhamento, relativo à raiz. */
  imagem?: string;
  /** JSON-LD desta página (schema.org). */
  dadosEstruturados?: Record<string, unknown> | Array<Record<string, unknown>>;
}

/** 1200×630, a proporção que WhatsApp, LinkedIn e X esperam. A logo pura saía
 *  recortada num quadrado, ou miúda no meio de um card largo. */
const IMAGEM_PADRAO = '/img/compartilhamento.png';
const NOME_SITE = 'ProCert';

/** Marca as tags que este módulo gerencia, para poder substituí-las sem tocar
 *  nas que vieram do index.html. */
const MARCA = 'data-seo';
const ID_JSONLD = 'seo-jsonld';

interface TagsSeo {
  titulo: string;
  canonical: string;
  /** Atributos de cada `<meta>`; `name` ou `property` identifica a tag. */
  metas: Array<Record<string, string>>;
  jsonld?: string;
}

/** Fonte única do que vai no `<head>` — usada pelo DOM e pelo pré-render. */
export function tagsDoSeo({
  titulo,
  descricao,
  caminho,
  imagem = IMAGEM_PADRAO,
  dadosEstruturados,
}: DadosSeo): TagsSeo {
  const url = `${URL_SITE}${caminho}`;
  const urlImagem = `${URL_SITE}${imagem}`;

  return {
    titulo,
    canonical: url,
    metas: [
      { name: 'description', content: descricao },
      { property: 'og:title', content: titulo },
      { property: 'og:description', content: descricao },
      { property: 'og:url', content: url },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: urlImagem },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:site_name', content: NOME_SITE },
      { property: 'og:locale', content: 'pt_BR' },
      // summary_large_image e não summary: a imagem é larga, e no card pequeno
      // ela sairia recortada num quadrado.
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: titulo },
      { name: 'twitter:description', content: descricao },
      { name: 'twitter:image', content: urlImagem },
    ],
    jsonld: dadosEstruturados ? JSON.stringify(dadosEstruturados) : undefined,
  };
}

function seletorDaMeta(atributos: Record<string, string>): string {
  return atributos.name
    ? `meta[name="${atributos.name}"]`
    : `meta[property="${atributos.property}"]`;
}

/**
 * Aplica os metadados da página no `<head>`.
 *
 * Não desfaz nada ao trocar de rota: cada página sobrescreve os mesmos nós. Um
 * cleanup que removesse as tags deixaria o documento sem título entre a saída
 * de uma rota e a entrada da outra, e é exatamente esse intervalo que um
 * crawler pode amostrar.
 */
export function aplicarSeo(dados: DadosSeo): void {
  const tags = tagsDoSeo(dados);
  document.title = tags.titulo;

  for (const atributos of tags.metas) {
    let tag = document.head.querySelector<HTMLMetaElement>(seletorDaMeta(atributos));
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute(MARCA, '');
      document.head.appendChild(tag);
    }
    for (const [chave, valor] of Object.entries(atributos)) tag.setAttribute(chave, valor);
  }

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.setAttribute(MARCA, '');
    document.head.appendChild(canonical);
  }
  canonical.href = tags.canonical;

  // Substitui o bloco JSON-LD — inclusive o que veio pré-renderizado no HTML.
  document.getElementById(ID_JSONLD)?.remove();
  if (tags.jsonld) {
    const script = document.createElement('script');
    script.id = ID_JSONLD;
    script.type = 'application/ld+json';
    script.textContent = tags.jsonld;
    document.head.appendChild(script);
  }
}

function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * As mesmas tags de `aplicarSeo`, como HTML — para o pré-render escrever no
 * arquivo. `aplicarSeo` as encontra pelos mesmos seletores e as reaproveita no
 * cliente em vez de duplicá-las.
 */
export function htmlDoSeo(dados: DadosSeo): string {
  const tags = tagsDoSeo(dados);
  const linhas = [
    `<title>${escaparHtml(tags.titulo)}</title>`,
    `<link rel="canonical" href="${escaparHtml(tags.canonical)}" ${MARCA} />`,
    ...tags.metas.map(
      (atributos) =>
        `<meta ${Object.entries(atributos)
          .map(([chave, valor]) => `${chave}="${escaparHtml(valor)}"`)
          .join(' ')} ${MARCA} />`,
    ),
  ];
  if (tags.jsonld) {
    // `<` escapado: um "</script>" dentro de um texto do JSON fecharia o bloco.
    const json = tags.jsonld.replace(/</g, '\\u003c');
    linhas.push(`<script id="${ID_JSONLD}" type="application/ld+json">${json}</script>`);
  }
  return linhas.join('\n    ');
}

/**
 * Onde `useSeo` deixa os dados da página durante o pré-render — no servidor o
 * `useEffect` não roda. Só é escrito quando `import.meta.env.SSR`, constante
 * que o Vite troca por `false` no pacote do navegador e elimina o ramo.
 */
export const seoColetado: { atual?: DadosSeo } = {};

/**
 * Dados da organização, reaproveitados em todas as páginas.
 *
 * Só declara o que é verificável no próprio site: razão social, CNPJ, endereço
 * e canais de contato. **Não afirma acreditação, escopo de certificação nem
 * número de norma** — para um Organismo de Certificação de Processo essas são
 * declarações com efeito regulatório, e schema.org é lido por agregadores. Se
 * a acreditação junto ao Inmetro/Cgcre for confirmada, o campo próprio é
 * `hasCredential`.
 */
export function organizacao(): Record<string, unknown> {
  return {
    '@type': 'Organization',
    '@id': `${URL_SITE}/#organizacao`,
    name: 'ProCert Certificação de Processos LTDA',
    alternateName: 'ProCert',
    url: URL_SITE,
    logo: `${URL_SITE}/img/logo.png`,
    taxID: '61.926.893/0001-95',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Rua John Harrison, 299, Conj. 902',
      addressLocality: 'São Paulo',
      addressRegion: 'SP',
      postalCode: '05074-080',
      addressCountry: 'BR',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      email: 'comercial@procertocp.com.br',
      telephone: '+55-11-94230-7431',
      availableLanguage: 'Portuguese',
    },
  };
}

/** Trilha de navegação — o Google a usa no lugar da URL crua no resultado. */
export function migalhas(
  itens: Array<{ nome: string; caminho: string }>,
): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: itens.map((item, indice) => ({
      '@type': 'ListItem',
      position: indice + 1,
      name: item.nome,
      item: `${URL_SITE}${item.caminho}`,
    })),
  };
}

/** Empacota os nós num único grafo — um `<script>` por página, não vários. */
export function grafo(
  ...nos: Array<Record<string, unknown>>
): Record<string, unknown> {
  return { '@context': 'https://schema.org', '@graph': nos };
}

/**
 * Aplica os metadados enquanto a página estiver montada.
 *
 * Roda em `useEffect` e não durante a renderização: escrever no `<head>` é
 * efeito colateral, e no StrictMode a renderização acontece duas vezes.
 */
export function useSeo(dados: DadosSeo): void {
  const { titulo, descricao, caminho, imagem, dadosEstruturados } = dados;

  // O JSON-LD é montado na renderização (`grafo(...)`), então é um objeto novo
  // a cada passagem e nunca seria igual por identidade. Comparar a forma
  // serializada é o que evita reescrever o <head> a cada render — e é ela que
  // entra na lista de dependências, já resolvida, para que o efeito não passe
  // a depender de um valor que o lint não consegue verificar.
  const estruturaSerializada = JSON.stringify(dadosEstruturados ?? null);

  if (import.meta.env.SSR) seoColetado.atual = dados;

  useEffect(() => {
    aplicarSeo({
      titulo,
      descricao,
      caminho,
      imagem,
      dadosEstruturados: JSON.parse(estruturaSerializada) ?? undefined,
    });
  }, [titulo, descricao, caminho, imagem, estruturaSerializada]);
}
