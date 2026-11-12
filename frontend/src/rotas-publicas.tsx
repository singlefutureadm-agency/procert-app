import { Navigate } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';

import { ContatoPage } from '@/features/home/ContatoPage';
import { HomePage } from '@/features/home/HomePage';
import { PoliticaPrivacidadePage } from '@/features/home/PoliticaPrivacidadePage';
import { ServicosPage } from '@/features/home/ServicosPage';
import { SobrePage } from '@/features/home/SobrePage';
import { TermosDeUsoPage } from '@/features/home/TermosDeUsoPage';
import { NaoEncontradaPage } from '@/pages/NaoEncontradaPage';

/**
 * Rotas do site institucional — as que são pré-renderizadas no build
 * (`src/prerender.tsx` + `scripts/prerender.mjs`).
 *
 * Ficam fora de `router.tsx` porque aquele módulo chama `createBrowserRouter`
 * ao ser importado, e isso exige `window`: o build SSR não conseguiria
 * importá-lo.
 *
 * **Import estático, não `lazy`, de propósito.** O HTML pré-renderizado chega
 * pronto, e o `createRoot` do `main.tsx` o substitui pela árvore do cliente.
 * Com `lazy`, essa primeira renderização suspenderia, e o `<Suspense>` trocaria
 * o conteúdo já visível pelo spinner até o pedaço baixar — exatamente o pulo
 * que o pré-render existe para evitar.
 *
 * Ao acrescentar rota pública: aqui, no menu (`NAVEGACAO` em conteudo.ts, ou
 * `PAGINAS` quando as páginas voltarem), em `public/sitemap.xml` e em
 * `public/llms.txt`.
 */
export const ROTAS_PUBLICAS = [
  // O site é uma landing page única: o menu leva às seções da home.
  { path: '/', element: <HomePage /> },
  // Documentos legais: caminhos são a fonte única de PAGINAS_LEGAIS.
  { path: '/termos-de-uso', element: <TermosDeUsoPage /> },
  { path: '/politica-de-privacidade', element: <PoliticaPrivacidadePage /> },
] satisfies RouteObject[];

/**
 * EM ESPERA desde 12/11/2026, por decisão do time: o site fica só com a home em
 * formato landing page. As páginas estão prontas — texto, SEO por rota,
 * JSON-LD, FAQ — e NÃO estão montadas no router nem pré-renderizadas.
 *
 * Para reativar, nesta ordem (ver CLAUDE.md, "Páginas em espera"):
 *   1. mover estas três entradas para `ROTAS_PUBLICAS` e apagar
 *      `REDIRECIONAMENTOS_EM_ESPERA`;
 *   2. tirar os `redirects` de /sobre, /servicos e /contato do `vercel.json` e
 *      os `location =` equivalentes do `nginx.conf`;
 *   3. trocar `NAVEGACAO` por `PAGINAS` no cabeçalho e no rodapé;
 *   4. devolver as três URLs ao `public/sitemap.xml` e ao `public/llms.txt`.
 *
 * Exportada só para manter as páginas compiladas e verificadas pelo tsc: como
 * ninguém a importa, o bundler a descarta do pacote.
 */
export const ROTAS_EM_ESPERA = [
  { path: '/sobre', element: <SobrePage /> },
  { path: '/servicos', element: <ServicosPage /> },
  { path: '/contato', element: <ContatoPage /> },
] satisfies RouteObject[];

/**
 * Enquanto as páginas estão em espera, quem chega por um link antigo para
 * /sobre cai na seção equivalente da home. O servidor já redireciona
 * (`vercel.json`, `nginx.conf`); esta é a rede para um servidor que ainda não
 * tenha a regra — o VPS até alguém atualizar o nginx à mão. Não é
 * pré-renderizada: não há página, só o desvio.
 */
export const REDIRECIONAMENTOS_EM_ESPERA = [
  { path: '/sobre', element: <Navigate to="/#sobre" replace /> },
  { path: '/servicos', element: <Navigate to="/#servicos" replace /> },
  { path: '/contato', element: <Navigate to="/#contato" replace /> },
] satisfies RouteObject[];

/** Vai para o `404.html`, servido com status 404 a toda URL desconhecida. */
export const ROTA_NAO_ENCONTRADA = {
  path: '*',
  element: <NaoEncontradaPage />,
} satisfies RouteObject;
