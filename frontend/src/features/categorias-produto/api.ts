import { api } from '@/lib/api';
import type {
  CategoriaProduto,
  CategoriaResumo,
  EtapaModeloEntrada,
  ModeloTrilha,
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
  /** Validade do certificado emitido para produtos desta categoria, em meses. */
  validadeMeses?: number;
}

export const categoriasApi = {
  listar: async (filtros: FiltrosCategorias) => {
    const { data } = await api.get<RespostaPaginada<CategoriaProduto>>(
      '/categorias-produto',
      { params: filtros },
    );
    return data;
  },

  /** Lista enxuta para selects, já com o modelo de trilha vigente. */
  resumo: async () => {
    const { data } = await api.get<CategoriaResumo[]>('/categorias-produto/resumo');
    return data;
  },

  buscarPorId: async (id: number) => {
    const { data } = await api.get<CategoriaProduto>(`/categorias-produto/${id}`);
    return data;
  },

  criar: async (dados: CategoriaEntrada) => {
    const { data } = await api.post<CategoriaProduto>('/categorias-produto', dados);
    return data;
  },

  atualizar: async (id: number, dados: CategoriaEntrada) => {
    const { data } = await api.patch<CategoriaProduto>(
      `/categorias-produto/${id}`,
      dados,
    );
    return data;
  },

  alterarStatus: async (id: number, status: StatusRegistro) => {
    const { data } = await api.patch<CategoriaProduto>(
      `/categorias-produto/${id}/status`,
      { status },
    );
    return data;
  },

  remover: async (id: number) => {
    const { data } = await api.delete<{ mensagem: string }>(
      `/categorias-produto/${id}`,
    );
    return data;
  },
};

export const modelosTrilhaApi = {
  listarPorCategoria: async (categoriaId: number) => {
    const { data } = await api.get<ModeloTrilha[]>(
      `/categorias-produto/${categoriaId}/modelos-trilha`,
    );
    return data;
  },

  /** Sem etapas no corpo, o backend copia as da versão vigente. */
  criarVersao: async (categoriaId: number, etapas?: EtapaModeloEntrada[]) => {
    const { data } = await api.post<ModeloTrilha>(
      `/categorias-produto/${categoriaId}/modelos-trilha`,
      etapas ? { etapas } : {},
    );
    return data;
  },

  substituirEtapas: async (modeloId: number, etapas: EtapaModeloEntrada[]) => {
    const { data } = await api.patch<ModeloTrilha>(
      `/modelos-trilha/${modeloId}/etapas`,
      { etapas },
    );
    return data;
  },

  reordenarEtapas: async (modeloId: number, ordem: number[]) => {
    const { data } = await api.patch<ModeloTrilha>(
      `/modelos-trilha/${modeloId}/etapas/ordem`,
      { ordem },
    );
    return data;
  },
};
