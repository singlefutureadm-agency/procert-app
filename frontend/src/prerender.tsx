import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { StaticRouter, useRoutes } from 'react-router-dom';

import { AuthContext } from '@/auth/AuthContext';
import { TemaContext } from '@/features/aparencia/TemaContext';
import type { DadosSeo } from '@/lib/seo';
import { htmlDoSeo, seoColetado } from '@/lib/seo';
import { ROTA_NAO_ENCONTRADA, ROTAS_PUBLICAS } from '@/rotas-publicas';

/**
 * Entrada do pré-render — só existe no build SSR (`vite build --ssr`), chamada
 * por `scripts/prerender.mjs`. Nunca entra no pacote do navegador.
 *
 * Os providers reais ficam de fora: `AuthProvider` lê o `localStorage` e
 * `TemaProvider` busca a aparência na API, nada disso existe no build. No lugar
 * deles vão os valores de um visitante anônimo sem cache — que é também o que
 * o crawler é. Quem tem sessão vê o HTML de anônimo por um instante, até o
 * `createRoot` do `main.tsx` substituí-lo.
 */

const nada = () => {};

const autenticacaoAnonima = {
  usuario: null,
  carregando: false,
  autenticado: false,
  entrar: () => Promise.reject(new Error('indisponível no pré-render')),
  sair: nada,
  temPapel: () => false,
  atualizarUsuario: nada,
};

const temaPadrao = {
  aparencia: null,
  modo: 'CLARO' as const,
  podeAlternar: false,
  alternarModo: nada,
  definirModo: nada,
  previsualizar: nada,
  encerrarPrevisualizacao: nada,
};

function Rotas() {
  return useRoutes([...ROTAS_PUBLICAS, ROTA_NAO_ENCONTRADA]);
}

export const CAMINHOS: string[] = ROTAS_PUBLICAS.map((rota) => rota.path);

export function renderizar(caminho: string): { html: string; cabecalho: string } {
  seoColetado.atual = undefined;

  const html = renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <TemaContext.Provider value={temaPadrao}>
        <AuthContext.Provider value={autenticacaoAnonima}>
          <StaticRouter location={caminho}>
            <Rotas />
          </StaticRouter>
        </AuthContext.Provider>
      </TemaContext.Provider>
    </QueryClientProvider>,
  );

  const seo: DadosSeo | undefined = seoColetado.atual;
  return { html, cabecalho: seo ? htmlDoSeo(seo) : '' };
}
