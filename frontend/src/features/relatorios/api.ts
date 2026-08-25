import { api } from '@/lib/api';
import type { RespostaPaginada, Role } from '@/types';

export interface FiltrosRelatorioEquipe {
  pagina?: number;
  limite?: number;
  de?: string;
  ate?: string;
}

/**
 * Uma linha do relatório de equipe.
 *
 * `carteira` e `atividade` são grupos separados de propósito: a carteira é um
 * retrato de agora e ignora o período; a atividade é recortada por ele. Não
 * existe — e não deve passar a existir — campo que combine os dois.
 */
export interface LinhaEquipe {
  id: number;
  nome: string;
  email: string;
  role: Exclude<Role, 'CLIENTE'>;
  status: 'ATIVO' | 'INATIVO';
  ultimoAcessoEm: string | null;
  carteira: { clientes: number };
  atividade: {
    etapasAvaliadas: number;
    aprovacoes: number;
    reprovacoes: number;
    ncsAbertas: number;
    certificadosEmitidos: number;
    documentosEnviados: number;
    ultimaMovimentacao: string | null;
  };
}

export interface RelatorioEquipe extends RespostaPaginada<LinhaEquipe> {
  periodo: { de: string | null; ate: string | null };
}

export const relatoriosApi = {
  equipe: async (filtros: FiltrosRelatorioEquipe) => {
    const { data } = await api.get<RelatorioEquipe>('/relatorios/equipe', {
      params: filtros,
    });
    return data;
  },

  /**
   * Download por blob, não por `<a href>`: a rota exige o Bearer e um link
   * direto voltaria 401. O nome do arquivo sai do `Content-Disposition` — quem
   * sabe montá-lo é o servidor.
   */
  exportarEquipe: async (
    periodo: { de: string; ate: string },
    formato: 'xlsx' | 'csv',
  ) => {
    const resposta = await api.get<Blob>('/relatorios/equipe/exportacao', {
      params: { ...periodo, formato },
      responseType: 'blob',
    });

    const cabecalho = String(resposta.headers['content-disposition'] ?? '');
    const nome =
      /filename="?([^"]+)"?/.exec(cabecalho)?.[1] ?? `desempenho-equipe.${formato}`;

    const url = URL.createObjectURL(resposta.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    link.click();
    URL.revokeObjectURL(url);
  },
};
