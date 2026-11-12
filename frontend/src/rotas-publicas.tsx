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
 * que o pré-render existe para evitar. O custo é pequeno: cabeçalho, rodapé e o
 * formulário de contato já estavam no pacote inicial por causa da home.
 *
 * Ao acrescentar rota pública: aqui, em `PAGINAS` (conteudo-paginas.ts), em
 * `public/sitemap.xml` e em `public/llms.txt`.
 */
export const ROTAS_PUBLICAS = [
  { path: '/', element: <HomePage /> },
  // Cada página existe como URL própria — e não como âncora da home — para
  // disputar o próprio conjunto de termos de busca, com título, descrição e
  // dados estruturados próprios.
  { path: '/sobre', element: <SobrePage /> },
  { path: '/servicos', element: <ServicosPage /> },
  { path: '/contato', element: <ContatoPage /> },
  // Documentos legais: caminhos são a fonte única de PAGINAS_LEGAIS.
  { path: '/termos-de-uso', element: <TermosDeUsoPage /> },
  { path: '/politica-de-privacidade', element: <PoliticaPrivacidadePage /> },
] satisfies RouteObject[];

/** Vai para o `404.html`, servido com status 404 a toda URL desconhecida. */
export const ROTA_NAO_ENCONTRADA = {
  path: '*',
  element: <NaoEncontradaPage />,
} satisfies RouteObject;
