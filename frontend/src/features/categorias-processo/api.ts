import { api } from '@/lib/api';
import type {
  CategoriaProcesso,
  CategoriaResumo,
  RespostaPaginada,
  StatusRegistro,
} from '@/types';

export interface FiltrosCategorias {
  pagina?: number;
  limite?: number;
  busca?: string;
  status?: StatusRegistro;
}

export interface CategoriaEntrada {
  nome: string;
  descricao?: string;
  normaReferencia?: string;
  /** Validade do certificado emitido para processos desta categoria, em meses. */
  validadeMeses?: number;
}

export const categoriasApi = {
  listar: async (filtros: FiltrosCategorias) => {
    const { data } = await api.get<RespostaPaginada<CategoriaProcesso>>(
      '/categorias-processo',
      { params: filtros },
    );
    return data;
  },

  /** Lista enxuta para selects, já com o modelo de trilha vigente. */
  resumo: async () => {
    const { data } = await api.get<CategoriaResumo[]>('/categorias-processo/resumo');
    return data;
  },

  buscarPorId: async (id: number) => {
    const { data } = await api.get<CategoriaProcesso>(`/categorias-processo/${id}`);
    return data;
  },

  criar: async (dados: CategoriaEntrada) => {
    const { data } = await api.post<CategoriaProcesso>('/categorias-processo', dados);
    return data;
  },

  atualizar: async (id: number, dados: CategoriaEntrada) => {
    const { data } = await api.patch<CategoriaProcesso>(
      `/categorias-processo/${id}`,
      dados,
    );
    return data;
  },

  alterarStatus: async (id: number, status: StatusRegistro) => {
    const { data } = await api.patch<CategoriaProcesso>(
      `/categorias-processo/${id}/status`,
      { status },
    );
    return data;
  },

  /**
   * Vincula a trilha do catálogo que esta categoria segue.
   * `null` desvincula — e categoria sem trilha não aceita processo novo.
   */
  vincularTrilha: async (id: number, trilhaId: number | null) => {
    const { data } = await api.patch<CategoriaProcesso>(
      `/categorias-processo/${id}/trilha`,
      { trilhaId },
    );
    return data;
  },

  remover: async (id: number) => {
    const { data } = await api.delete<{ mensagem: string }>(
      `/categorias-processo/${id}`,
    );
    return data;
  },
};
