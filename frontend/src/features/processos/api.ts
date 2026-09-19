import { api } from '@/lib/api';
import type { Processo, RespostaPaginada, StatusRegistro } from '@/types';

export interface FiltrosProcessos {
  pagina?: number;
  limite?: number;
  busca?: string;
  status?: StatusRegistro;
  clienteId?: number;
  categoriaId?: number;
}

export interface DadosProcesso {
  clienteId: number;
  nome: string;
  descricao?: string;
  preco?: number;
  /**
   * Aprovação da etapa ao fechar o checklist. `null` = HERDA a versão da
   * trilha; `true`/`false` sobrepõem só neste processo. Os três estados são
   * distintos: "herda" não é "manual".
   */
  aprovacaoAutomatica?: boolean | null;
}

/** A categoria só entra na criação: é ela que define a trilha aberta. */
export interface DadosNovoProcesso extends DadosProcesso {
  categoriaId: number;
}

export const processosApi = {
  listar: async (filtros: FiltrosProcessos) => {
    const { data } = await api.get<RespostaPaginada<Processo>>('/processos', {
      params: filtros,
    });
    return data;
  },

  buscar: async (id: number) => {
    const { data } = await api.get<Processo>(`/processos/${id}`);
    return data;
  },

  criar: async (dados: DadosNovoProcesso) => {
    const { data } = await api.post<Processo>('/processos', dados);
    return data;
  },

  atualizar: async (id: number, dados: Partial<DadosProcesso>) => {
    const { data } = await api.patch<Processo>(`/processos/${id}`, dados);
    return data;
  },

  alterarStatus: async (id: number, status: StatusRegistro) => {
    const { data } = await api.patch<Processo>(`/processos/${id}/status`, { status });
    return data;
  },

  remover: async (id: number) => {
    const { data } = await api.delete<{ mensagem: string }>(`/processos/${id}`);
    return data;
  },

  enviarFoto: async (id: number, arquivo: File) => {
    const formulario = new FormData();
    formulario.append('foto', arquivo);

    const { data } = await api.post<Processo>(`/processos/${id}/foto`, formulario, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
};
