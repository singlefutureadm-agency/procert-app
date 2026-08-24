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
 * **Limite conhecido:** isto roda no cliente. O Googlebot renderiza JS e lê o
 * resultado, mas crawlers que não executam JS — e as prévias de link do
 * WhatsApp, LinkedIn e X — leem o HTML servido, onde só existe o
 * `<div id="root">` vazio. Fechar isso exige pré-renderizar as rotas no build
 * (SSG); ver o comentário ao final deste arquivo.
 */

/**
 * Origem pública do site, usada em canonical e Open Graph — que exigem URL
 * absoluta. Configurável porque o domínio definitivo (procertocp.com.br) ainda
 * não aponta para cá.
 */
export const URL_SITE = (
  import.meta.env.VITE_SITE_URL ?? 'https://procert-app.vercel.app'
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

const IMAGEM_PADRAO = '/img/logo.png';
const NOME_SITE = 'ProCert';

/** Marca as tags que este módulo gerencia, para poder substituí-las sem tocar
 *  nas que vieram do index.html. */
const MARCA = 'data-seo';

function definirMeta(seletor: string, atributos: Record<string, string>): void {
  let tag = document.head.querySelector<HTMLMetaElement>(seletor);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(MARCA, '');
    document.head.appendChild(tag);
  }
  for (const [chave, valor] of Object.entries(atributos)) {
    tag.setAttribute(chave, valor);
  }
}

function definirLink(rel: string, href: string): void {
  let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement('link');
    tag.rel = rel;
    tag.setAttribute(MARCA, '');
    document.head.appendChild(tag);
  }
  tag.href = href;
}

/**
 * Aplica os metadados da página no `<head>`.
 *
 * Não desfaz nada ao trocar de rota: cada página sobrescreve os mesmos nós. Um
 * cleanup que removesse as tags deixaria o documento sem título entre a saída
 * de uma rota e a entrada da outra, e é exatamente esse intervalo que um
 * crawler pode amostrar.
 */
export function aplicarSeo({
  titulo,
  descricao,
  caminho,
  imagem = IMAGEM_PADRAO,
  dadosEstruturados,
}: DadosSeo): void {
  const url = `${URL_SITE}${caminho}`;
  const urlImagem = `${URL_SITE}${imagem}`;

  document.title = titulo;

  definirMeta('meta[name="description"]', { name: 'description', content: descricao });
  definirLink('canonical', url);

  definirMeta('meta[property="og:title"]', { property: 'og:title', content: titulo });
  definirMeta('meta[property="og:description"]', {
    property: 'og:description',
    content: descricao,
  });
  definirMeta('meta[property="og:url"]', { property: 'og:url', content: url });
  definirMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
  definirMeta('meta[property="og:image"]', { property: 'og:image', content: urlImagem });
  definirMeta('meta[property="og:site_name"]', {
    property: 'og:site_name',
    content: NOME_SITE,
  });
  definirMeta('meta[property="og:locale"]', {
    property: 'og:locale',
    content: 'pt_BR',
  });

  // summary_large_image e não summary: a imagem é a marca sobre fundo largo, e
  // no card pequeno ela sairia recortada num quadrado.
  definirMeta('meta[name="twitter:card"]', {
    name: 'twitter:card',
    content: 'summary_large_image',
  });
  definirMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: titulo });
  definirMeta('meta[name="twitter:description"]', {
    name: 'twitter:description',
    content: descricao,
  });
  definirMeta('meta[name="twitter:image"]', {
    name: 'twitter:image',
    content: urlImagem,
  });

  aplicarDadosEstruturados(dadosEstruturados);
}

/** Substitui o bloco JSON-LD da página. */
function aplicarDadosEstruturados(
  dados: DadosSeo['dadosEstruturados'],
): void {
  const id = 'seo-jsonld';
  document.getElementById(id)?.remove();
  if (!dados) return;

  const script = document.createElement('script');
  script.id = id;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(dados);
  document.head.appendChild(script);
}

/**
 * Dados da organização, reaproveitados em todas as páginas.
 *
 * Só declara o que é verificável no próprio site: razão social, CNPJ, endereço
 * e canais de contato. **Não afirma acreditação, escopo de certificação nem
 * número de norma** — para um Organismo de Certificação de Produto essas são
 * declarações com efeito regulatório, e schema.org é lido por agregadores. Se
 * a acreditação junto ao Inmetro/Cgcre for confirmada, o campo próprio é
 * `hasCredential`.
 */
export function organizacao(): Record<string, unknown> {
  return {
    '@type': 'Organization',
    '@id': `${URL_SITE}/#organizacao`,
    name: 'ProCert Certificação de Produtos LTDA',
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

// Próximo passo para indexação, deliberadamente fora deste arquivo: pré-render
// das rotas públicas no build (vite-react-ssg ou equivalente), gerando HTML
// real para /, /sobre, /servicos, /contato e as duas páginas legais. É o que
// entrega conteúdo a crawler sem JS e às prévias de link. Não altera nenhum
// componente — é configuração de build.
