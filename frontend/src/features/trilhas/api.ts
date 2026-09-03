import { api } from '@/lib/api';
import type {
  EtapaModeloEntrada,
  ModeloTrilha,
  RespostaPaginada,
  StatusRegistro,
  Trilha,
  TrilhaResumo,
} from '@/types';

export interface FiltrosTrilhas {
  pagina?: number;
  limite?: number;
  busca?: string;
  status?: StatusRegistro;
}

export interface TrilhaEntrada {
  nome: string;
  descricao?: string;
  /** Só no cadastro: com etapas, a versão 1 nasce no mesmo commit. */
  etapas?: EtapaModeloEntrada[];
}

export const trilhasApi = {
  listar: async (filtros: FiltrosTrilhas) => {
    const { data } = await api.get<RespostaPaginada<Trilha>>('/trilhas', {
      params: filtros,
    });
    return data;
  },

  /** Lista enxuta para o select de vínculo na categoria. */
  resumo: async () => {
    const { data } = await api.get<TrilhaResumo[]>('/trilhas/resumo');
    return data;
  },

  buscarPorId: async (id: number) => {
    const { data } = await api.get<Trilha>(`/trilhas/${id}`);
    return data;
  },

  criar: async (dados: TrilhaEntrada) => {
    const { data } = await api.post<Trilha>('/trilhas', dados);
    return data;
  },

  atualizar: async (id: number, dados: Omit<TrilhaEntrada, 'etapas'>) => {
    const { data } = await api.patch<Trilha>(`/trilhas/${id}`, dados);
    return data;
  },

  alterarStatus: async (id: number, status: StatusRegistro) => {
    const { data } = await api.patch<Trilha>(`/trilhas/${id}/status`, { status });
    return data;
  },

  duplicar: async (
    id: number,
    dados: { nome: string; descricao?: string; modeloTrilhaId?: number },
  ) => {
    const { data } = await api.post<Trilha>(`/trilhas/${id}/duplicar`, dados);
    return data;
  },

  vincularCategorias: async (id: number, categoriaIds: number[]) => {
    const { data } = await api.patch<Trilha>(`/trilhas/${id}/categorias`, {
      categoriaIds,
    });
    return data;
  },

  remover: async (id: number) => {
    const { data } = await api.delete<{ mensagem: string }>(`/trilhas/${id}`);
    return data;
  },
};

/** Versões de uma trilha e as etapas de cada uma. */
export const modelosTrilhaApi = {
  listarPorTrilha: async (trilhaId: number) => {
    const { data } = await api.get<ModeloTrilha[]>(
      `/trilhas/${trilhaId}/modelos-trilha`,
    );
    return data;
  },

  /** Sem etapas no corpo, o backend copia as da versão vigente. */
  criarVersao: async (trilhaId: number, etapas?: EtapaModeloEntrada[]) => {
    const { data } = await api.post<ModeloTrilha>(
      `/trilhas/${trilhaId}/modelos-trilha`,
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

  /** Volta a vigência para uma versão anterior. */
  definirVigente: async (modeloId: number) => {
    const { data } = await api.patch<ModeloTrilha>(
      `/modelos-trilha/${modeloId}/vigente`,
    );
    return data;
  },

  removerVersao: async (modeloId: number) => {
    const { data } = await api.delete<{ mensagem: string }>(
      `/modelos-trilha/${modeloId}`,
    );
    return data;
  },
};
