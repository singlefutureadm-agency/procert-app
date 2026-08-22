import { api } from '@/lib/api';
import type {
  Certificado,
  CertificadoEmRisco,
  RespostaPaginada,
  ResumoVencimentos,
  StatusCertificado,
} from '@/types';

export interface FiltrosCertificados {
  pagina?: number;
  limite?: number;
  busca?: string;
  status?: StatusCertificado;
  produtoId?: number;
  clienteId?: number;
}

export interface EmissaoCertificado {
  escopo: string;
  /** Sobrescreve a validade padrão da categoria. */
  dataValidade?: string;
}

export const certificadosApi = {
  listar: async (filtros: FiltrosCertificados) => {
    const { data } = await api.get<RespostaPaginada<Certificado>>('/certificados', {
      params: filtros,
    });
    return data;
  },

  emRisco: async (filtros: { dias: number; pagina?: number; limite?: number }) => {
    const { data } = await api.get<
      RespostaPaginada<CertificadoEmRisco> & { resumo: ResumoVencimentos }
    >('/certificados/em-risco', { params: filtros });
    return data;
  },

  listarPorProduto: async (produtoId: number) => {
    const { data } = await api.get<Certificado[]>(
      `/produtos/${produtoId}/certificados`,
    );
    return data;
  },

  emitir: async (produtoId: number, dados: EmissaoCertificado) => {
    const { data } = await api.post<Certificado>(
      `/produtos/${produtoId}/certificados`,
      dados,
    );
    return data;
  },

  alterarStatus: async (
    id: number,
    status: Exclude<StatusCertificado, 'VENCIDO'>,
    motivoStatus?: string,
  ) => {
    const { data } = await api.patch<Certificado>(`/certificados/${id}/status`, {
      status,
      motivoStatus,
    });
    return data;
  },

  /**
   * Baixa o PDF autenticado.
   *
   * Um link direto não serve: a rota exige o Bearer, que só o axios injeta.
   * Por isso vem como blob e a URL temporária é revogada depois de abrir.
   */
  abrirPdf: async (id: number, numero: string) => {
    const { data } = await api.get<Blob>(`/certificados/${id}/pdf`, {
      responseType: 'blob',
    });

    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${numero}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  },
};
