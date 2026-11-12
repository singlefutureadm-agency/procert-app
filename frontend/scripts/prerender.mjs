/**
 * Pré-render do site institucional — último passo do `npm run build`.
 *
 * Lê o `dist/index.html` gerado pelo Vite (o shell da SPA, com os <script> e
 * <link> de hash certo) e escreve um HTML por rota pública, com o conteúdo da
 * página dentro do #root e o <head> próprio dela (title, description,
 * canonical, Open Graph, JSON-LD). É o que crawlers sem JS — prévias de link,
 * robôs de IA — passam a ler.
 *
 * Saída, e quem a serve (vercel.json e nginx.conf precisam concordar):
 *   index.html           a home
 *   sobre.html, ...      uma por rota, servidas em /sobre (cleanUrls / try_files $uri.html)
 *   404.html             página de erro, servida com status 404 a URL desconhecida
 *   app.html             o shell vazio, para as rotas do painel — com noindex.
 *                        Sem ele, recarregar /dashboard mostraria a home
 *                        pré-renderizada por um instante.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import console from 'node:console';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const dist = `${raiz}dist`;
const ssr = `${raiz}dist-ssr`;

const { renderizar, CAMINHOS } = await import(pathToFileURL(`${ssr}/prerender.js`).href);

const modelo = readFileSync(`${dist}/index.html`, 'utf8');
const ROOT_VAZIO = '<div id="root"></div>';
const TITULO = /<title>[^<]*<\/title>/;
const DESCRICAO = /<meta\s+name="description"[\s\S]*?\/>/;

for (const trecho of [ROOT_VAZIO, '</head>']) {
  if (!modelo.includes(trecho)) throw new Error(`dist/index.html sem "${trecho}"`);
}
if (!TITULO.test(modelo) || !DESCRICAO.test(modelo)) {
  throw new Error('dist/index.html sem <title> ou <meta name="description"> para substituir');
}

/** Troca o <head> genérico pelo da página e põe o HTML dentro do #root. */
function montar({ html, cabecalho }) {
  return modelo
    .replace(TITULO, '')
    .replace(DESCRICAO, '')
    .replace('</head>', `  ${cabecalho}\n  </head>`)
    .replace(ROOT_VAZIO, `<div id="root">${html}</div>`);
}

const NOINDEX = '<meta name="robots" content="noindex" />';

for (const caminho of CAMINHOS) {
  const pagina = renderizar(caminho);
  if (!pagina.cabecalho) throw new Error(`${caminho}: a página não chamou useSeo`);
  if (!pagina.html.includes('<h1')) throw new Error(`${caminho}: renderizou sem <h1>`);

  const arquivo = caminho === '/' ? 'index.html' : `${caminho.slice(1)}.html`;
  writeFileSync(`${dist}/${arquivo}`, montar(pagina));
  console.log(`pré-render: ${caminho} -> ${arquivo}`);
}

// A 404 não chama useSeo: título próprio, e fora do índice.
const naoEncontrada = renderizar('/__rota-inexistente__');
writeFileSync(
  `${dist}/404.html`,
  montar({
    html: naoEncontrada.html,
    cabecalho: `<title>Página não encontrada · ProCert</title>\n    ${NOINDEX}`,
  }),
);
console.log('pré-render: 404.html');

// Shell do painel: o modelo original, fora do índice.
writeFileSync(`${dist}/app.html`, modelo.replace('</head>', `  ${NOINDEX}\n  </head>`));
console.log('pré-render: app.html');

rmSync(ssr, { recursive: true, force: true });
