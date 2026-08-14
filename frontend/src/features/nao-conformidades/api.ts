import { api } from '@/lib/api';
import type {
  AberturaNaoConformidade,
  CriticidadeNaoConformidade,
  NaoConformidadeDetalhada,
  RespostaPaginada,
  StatusNaoConformidade,
} from '@/types';

export interface FiltrosNaoConformidades {
  pagina?: number;
  limite?: number;
  busca?: string;
  status?: StatusNaoConformidade;
  criticidade?: CriticidadeNaoConformidade;
  produtoId?: number;
  /** Só as que ainda aguardam ação (ABERTA ou EM_TRATATIVA). */
  pendentes?: boolean;
}

export const naoConformidadesApi = {
  listar: async (filtros: FiltrosNaoConformidades) => {
    const { data } = await api.get<RespostaPaginada<NaoConformidadeDetalhada>>(
      '/nao-conformidades',
      { params: filtros },
    );
    return data;
  },

  /** Abre uma NC avulsa em uma etapa já reprovada. */
  abrir: async (certificacaoId: number, dados: AberturaNaoConformidade) => {
    const { data } = await api.post<NaoConformidadeDetalhada>(
      `/certificacoes/${certificacaoId}/nao-conformidades`,
      dados,
    );
    return data;
  },

  responder: async (id: number, respostaCliente: string) => {
    const { data } = await api.patch<NaoConformidadeDetalhada>(
      `/nao-conformidades/${id}/resposta`,
      { respostaCliente },
    );
    return data;
  },

  avaliar: async (
    id: number,
    status: Exclude<StatusNaoConformidade, 'ABERTA'>,
    parecer?: string,
  ) => {
    const { data } = await api.patch<NaoConformidadeDetalhada>(
      `/nao-conformidades/${id}/status`,
      { status, parecer },
    );
    return data;
  },
};
