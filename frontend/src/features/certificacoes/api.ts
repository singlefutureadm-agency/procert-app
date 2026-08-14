import { api } from '@/lib/api';
import type {
  AberturaNaoConformidade,
  CertificacaoDetalhe,
  DocumentoCertificacao,
  LinhaPainelCertificacao,
  RespostaPaginada,
  SituacaoVersaoTrilha,
  StatusCertificacao,
} from '@/types';

export interface FiltrosCertificacoes {
  pagina?: number;
  limite?: number;
  busca?: string;
  status?: StatusCertificacao;
  clienteId?: number;
}

export interface EtapaAlteracao {
  id: number;
  status: StatusCertificacao;
  observacao?: string;
  /** Aceita pelo backend apenas quando `status === 'REPROVADO'`. */
  naoConformidade?: AberturaNaoConformidade;
}

export const certificacoesApi = {
  painel: async (filtros: FiltrosCertificacoes) => {
    const { data } = await api.get<RespostaPaginada<LinhaPainelCertificacao>>(
      '/certificacoes',
      { params: filtros },
    );
    return data;
  },

  porProduto: async (produtoId: number) => {
    const { data } = await api.get<CertificacaoDetalhe>(
      `/certificacoes/produto/${produtoId}`,
    );
    return data;
  },

  /** Salva todas as etapas em um único PUT — o backend grava o histórico. */
  salvar: async (produtoId: number, etapas: EtapaAlteracao[]) => {
    const { data } = await api.put<CertificacaoDetalhe>(
      `/certificacoes/produto/${produtoId}`,
      { etapas },
    );
    return data;
  },

  /** Consulta pura: diz se o produto ficou preso a uma versão antiga da trilha. */
  verificarVersao: async (produtoId: number) => {
    const { data } = await api.get<SituacaoVersaoTrilha>(
      `/certificacoes/produto/${produtoId}/versao-trilha`,
    );
    return data;
  },

  /** Anexa uma evidência à etapa (`certificacaoId` é a linha da timeline). */
  anexarDocumento: async (
    produtoId: number,
    certificacaoId: number,
    arquivo: File,
  ) => {
    const formulario = new FormData();
    formulario.append('documento', arquivo);

    const { data } = await api.post<DocumentoCertificacao>(
      `/certificacoes/produto/${produtoId}/etapas/${certificacaoId}/documento`,
      formulario,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
  },

  /** Download autenticado: a rota exige o Bearer, então vem como blob. */
  baixarDocumento: async (id: number, nomeArquivo: string) => {
    const { data } = await api.get<Blob>(
      `/certificacoes/documentos/${id}/arquivo`,
      { responseType: 'blob' },
    );

    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    link.click();
    URL.revokeObjectURL(url);
  },

  /** Aplica a migração — sempre com confirmação explícita do usuário. */
  migrarVersao: async (produtoId: number) => {
    const { data } = await api.post<SituacaoVersaoTrilha>(
      `/certificacoes/produto/${produtoId}/migrar-versao-trilha`,
    );
    return data;
  },

  reiniciar: async (produtoId: number) => {
    const { data } = await api.post<{ mensagem: string }>(
      `/certificacoes/produto/${produtoId}/reiniciar`,
    );
    return data;
  },
};
