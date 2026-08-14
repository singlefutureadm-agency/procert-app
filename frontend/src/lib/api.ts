import axios, { AxiosError } from 'axios';

const CHAVE_TOKEN = 'procert:token';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

export const tokenStorage = {
  get: () => localStorage.getItem(CHAVE_TOKEN),
  set: (token: string) => localStorage.setItem(CHAVE_TOKEN, token),
  limpar: () => localStorage.removeItem(CHAVE_TOKEN),
};

// Anexa o JWT em toda requisição autenticada.
api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Sessão expirada ou revogada → limpa e volta para o login.
api.interceptors.response.use(
  (resposta) => resposta,
  (erro: AxiosError) => {
    if (erro.response?.status === 401 && tokenStorage.get()) {
      tokenStorage.limpar();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?sessao=expirada';
      }
    }
    return Promise.reject(erro);
  },
);

interface CorpoErroApi {
  message?: string | string[];
  error?: string;
}

/** Converte qualquer erro da API na mensagem que será exibida ao usuário. */
export function mensagemDeErro(erro: unknown, padrao = 'Não foi possível concluir a operação.'): string {
  if (erro instanceof AxiosError) {
    const corpo = erro.response?.data as CorpoErroApi | undefined;
    const mensagem = corpo?.message;

    if (Array.isArray(mensagem)) return mensagem.join(' · ');
    if (typeof mensagem === 'string') return mensagem;
    if (erro.code === 'ERR_NETWORK') {
      return 'Não foi possível conectar à API. Verifique se o backend está no ar.';
    }
  }
  return padrao;
}

/** Monta a URL absoluta de um arquivo enviado (ou a imagem padrão). */
export function urlArquivo(
  caminho: string | null | undefined,
  padrao = '/placeholder-usuario.svg',
): string {
  if (!caminho) return padrao;
  if (caminho.startsWith('http')) return caminho;
  return caminho;
}
