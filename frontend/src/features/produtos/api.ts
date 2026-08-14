import { api } from '@/lib/api';
import type { Produto, RespostaPaginada, StatusRegistro } from '@/types';

export interface FiltrosProdutos {
  pagina?: number;
  limite?: number;
  busca?: string;
  status?: StatusRegistro;
  clienteId?: number;
  categoriaId?: number;
}

export interface DadosProduto {
  clienteId: number;
  nome: string;
  descricao?: string;
  preco?: number;
}

/** A categoria só entra na criação: é ela que define a trilha aberta. */
export interface DadosNovoProduto extends DadosProduto {
  categoriaId: number;
}

export const produtosApi = {
  listar: async (filtros: FiltrosProdutos) => {
    const { data } = await api.get<RespostaPaginada<Produto>>('/produtos', {
      params: filtros,
    });
    return data;
  },

  buscar: async (id: number) => {
    const { data } = await api.get<Produto>(`/produtos/${id}`);
    return data;
  },

  criar: async (dados: DadosNovoProduto) => {
    const { data } = await api.post<Produto>('/produtos', dados);
    return data;
  },

  atualizar: async (id: number, dados: Partial<DadosProduto>) => {
    const { data } = await api.patch<Produto>(`/produtos/${id}`, dados);
    return data;
  },

  alterarStatus: async (id: number, status: StatusRegistro) => {
    const { data } = await api.patch<Produto>(`/produtos/${id}/status`, { status });
    return data;
  },

  remover: async (id: number) => {
    const { data } = await api.delete<{ mensagem: string }>(`/produtos/${id}`);
    return data;
  },

  enviarFoto: async (id: number, arquivo: File) => {
    const formulario = new FormData();
    formulario.append('foto', arquivo);

    const { data } = await api.post<Produto>(`/produtos/${id}/foto`, formulario, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
};
