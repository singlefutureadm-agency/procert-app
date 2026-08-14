import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api, tokenStorage } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import type { RespostaLogin, Role, UsuarioSessao } from '@/types';

interface AuthContextValue {
  usuario: UsuarioSessao | null;
  carregando: boolean;
  autenticado: boolean;
  entrar: (email: string, senha: string) => Promise<UsuarioSessao>;
  sair: () => void;
  temPapel: (...papeis: Role[]) => boolean;
  atualizarUsuario: (dados: Partial<UsuarioSessao>) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const CHAVE_USUARIO = 'procert:usuario';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(() => {
    const bruto = localStorage.getItem(CHAVE_USUARIO);
    return bruto ? (JSON.parse(bruto) as UsuarioSessao) : null;
  });
  const [carregando, setCarregando] = useState(true);

  // Revalida a sessão no servidor ao abrir o app: um token de usuário
  // desativado deixa de valer imediatamente.
  useEffect(() => {
    const token = tokenStorage.get();
    if (!token) {
      setCarregando(false);
      return;
    }

    api
      .get<UsuarioSessao & { role: Role }>('/auth/me')
      .then(({ data }) => {
        const sessao: UsuarioSessao = {
          id: data.id,
          nome: data.nome,
          email: data.email,
          role: data.role,
          fotoUrl: data.fotoUrl ?? null,
        };
        setUsuario(sessao);
        localStorage.setItem(CHAVE_USUARIO, JSON.stringify(sessao));
      })
      .catch(() => {
        tokenStorage.limpar();
        localStorage.removeItem(CHAVE_USUARIO);
        setUsuario(null);
      })
      .finally(() => setCarregando(false));
  }, []);

  const entrar = useCallback(async (email: string, senha: string) => {
    const { data } = await api.post<RespostaLogin>('/auth/login', {
      email,
      senha,
    });

    tokenStorage.set(data.accessToken);
    localStorage.setItem(CHAVE_USUARIO, JSON.stringify(data.usuario));
    setUsuario(data.usuario);

    return data.usuario;
  }, []);

  const sair = useCallback(() => {
    tokenStorage.limpar();
    localStorage.removeItem(CHAVE_USUARIO);
    setUsuario(null);
    queryClient.clear();
  }, []);

  const atualizarUsuario = useCallback((dados: Partial<UsuarioSessao>) => {
    setUsuario((atual) => {
      if (!atual) return atual;
      const novo = { ...atual, ...dados };
      localStorage.setItem(CHAVE_USUARIO, JSON.stringify(novo));
      return novo;
    });
  }, []);

  const valor = useMemo<AuthContextValue>(
    () => ({
      usuario,
      carregando,
      autenticado: Boolean(usuario),
      entrar,
      sair,
      atualizarUsuario,
      temPapel: (...papeis: Role[]) =>
        Boolean(usuario && papeis.includes(usuario.role)),
    }),
    [usuario, carregando, entrar, sair, atualizarUsuario],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}
