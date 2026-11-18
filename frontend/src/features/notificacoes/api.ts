import { api } from '@/lib/api';
import type { Notificacao, RespostaPaginada } from '@/types';

export interface FiltrosNotificacoes {
  pagina?: number;
  limite?: number;
  /** Só as não lidas. É o que o painel do sino mostra. */
  apenasNaoLidas?: boolean;
}

/**
 * Caixa de avisos da equipe.
 *
 * **Não existe parâmetro de destinatário em nenhum método**, e a ausência é a
 * regra: o servidor tira o destinatário do token. Cada um alcança só a própria
 * caixa, e nem o ADMIN vê a de outro.
 */
export const notificacoesApi = {
  listar: async (filtros: FiltrosNotificacoes) => {
    const { data } = await api.get<RespostaPaginada<Notificacao>>(
      '/notificacoes',
      { params: filtros },
    );
    return data;
  },

  /**
   * Só o número, para o badge.
   *
   * Rota própria porque o badge é consultado em intervalo curto e de toda
   * tela: trazer a primeira página de avisos a cada polling seria carregar a
   * lista inteira para desenhar um número.
   */
  contarNaoLidas: async () => {
    const { data } = await api.get<{ naoLidas: number }>(
      '/notificacoes/nao-lidas',
    );
    return data;
  },

  marcarLida: async (id: number) => {
    const { data } = await api.patch<Notificacao>(`/notificacoes/${id}/leitura`);
    return data;
  },

  marcarTodasLidas: async () => {
    const { data } = await api.post<{ marcadas: number }>(
      '/notificacoes/marcar-todas-lidas',
    );
    return data;
  },
};
