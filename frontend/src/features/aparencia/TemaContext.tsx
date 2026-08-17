import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { chaves } from '@/lib/queryClient';
import type { PapelParede } from '@/lib/tema';
import {
  aplicarAparencia,
  aplicarTema,
  guardarAparenciaEmCache,
  guardarModoLocal,
  lerAparenciaEmCache,
  lerModoLocal,
  resolverModo,
} from '@/lib/tema';
import type { Aparencia, ModoTema, TokensTema } from '@/types';
import { aparenciaApi } from './api';

interface TemaContextValue {
  aparencia: Aparencia | null;
  modo: ModoTema;
  /** Só faz sentido oferecer o botão de alternância se o admin permitir. */
  podeAlternar: boolean;
  alternarModo: () => void;
  definirModo: (modo: ModoTema) => void;
  /** Preview ao vivo: pinta o painel sem tocar no servidor nem no cache. */
  previsualizar: (
    tokens: TokensTema,
    fonte: string,
    modo: ModoTema,
    papelParede?: PapelParede,
  ) => void;
  /** Desfaz o preview, voltando ao que está salvo. */
  encerrarPrevisualizacao: () => void;
}

export const TemaContext = createContext<TemaContextValue | null>(null);

export function TemaProvider({ children }: { children: ReactNode }) {
  // O cache local já foi aplicado em `main.tsx` antes do primeiro paint; aqui
  // ele só serve de valor inicial coerente enquanto a API não responde.
  const [modo, setModo] = useState<ModoTema>(() => {
    const cache = lerAparenciaEmCache();
    return cache ? resolverModo(cache) : (lerModoLocal() ?? 'ESCURO');
  });

  const { data: aparencia } = useQuery({
    queryKey: chaves.aparencia,
    queryFn: aparenciaApi.buscar,
    // O endpoint é público: a logo aparece no site institucional e na tela de
    // login, então a busca não pode depender de token.
    // Cores mudam raramente e a resposta é minúscula: não vale refetch agressivo.
    staleTime: 5 * 60_000,
  });

  // Fonte da verdade chegou: guarda para o próximo boot e repinta.
  useEffect(() => {
    if (!aparencia) return;

    guardarAparenciaEmCache(aparencia);

    const efetivo = resolverModo(aparencia);
    setModo(efetivo);
    aplicarAparencia(aparencia, efetivo);
  }, [aparencia]);

  const definirModo = useCallback(
    (novo: ModoTema) => {
      setModo(novo);
      guardarModoLocal(novo);
      if (aparencia) aplicarAparencia(aparencia, novo);
    },
    [aparencia],
  );

  const valor = useMemo<TemaContextValue>(
    () => ({
      aparencia: aparencia ?? null,
      modo,
      podeAlternar: aparencia?.permitirAlternancia ?? true,
      definirModo,
      alternarModo: () => definirModo(modo === 'ESCURO' ? 'CLARO' : 'ESCURO'),
      previsualizar: (tokens, fonte, modoPreview, papelParede) =>
        aplicarTema(tokens, fonte, modoPreview, papelParede),
      encerrarPrevisualizacao: () => {
        if (aparencia) aplicarAparencia(aparencia, resolverModo(aparencia));
      },
    }),
    [aparencia, modo, definirModo],
  );

  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>;
}
