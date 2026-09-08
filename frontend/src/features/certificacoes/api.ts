import { api } from '@/lib/api';
import type {
  AberturaNaoConformidade,
  CertificacaoDetalhe,
  DocumentoCertificacao,
  FaseProcesso,
  LinhaPainelCertificacao,
  PapelFuncional,
  QuadroProcessos,
  RespostaPaginada,
  SemaforoAging,
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

/** O que a marcação de uma microetapa produziu. */
export interface ResultadoMicroEtapa {
  etapaAprovada: boolean;
  /** Motivo de o checklist ter fechado SEM aprovar. Mostre-o. */
  aviso: string | null;
  concluidas: number;
  total: number;
}

export interface FiltrosQuadro {
  categoriaId?: number;
  clienteId?: number;
  papelResponsavel?: PapelFuncional;
  semaforo?: SemaforoAging;
  busca?: string;
  /** Cartões por coluna (1–100). Não afeta o `total` de cada uma. */
  limitePorFase?: number;
}

export const certificacoesApi = {
  /**
   * Quadro de processos por fase. Rota da EQUIPE: cliente recebe 403.
   *
   * A fase de cada processo é derivada da etapa atual pelo servidor — não há
   * como mover um cartão de coluna por aqui, e é de propósito.
   */
  quadro: async (filtros: FiltrosQuadro) => {
    const { data } = await api.get<QuadroProcessos>('/certificacoes/quadro', {
      params: filtros,
    });
    return data;
  },

  /**
   * Marca ou desmarca um item do checklist.
   *
   * O `id` é da microetapa DO PRODUTO. Fechar o checklist pode aprovar a
   * etapa — a resposta diz se aprovou e, quando não, por quê.
   */
  alternarMicroEtapa: async (id: number, concluida: boolean) => {
    const { data } = await api.patch<ResultadoMicroEtapa>(
      `/certificacoes/micro-etapas/${id}`,
      { concluida },
    );
    return data;
  },

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

  /**
   * Leva o processo para uma fase — o destino do arrastar-e-soltar.
   *
   * Escreve ETAPA, não posição: marca a primeira etapa não aprovada da fase
   * como "em andamento". A coluna continua sendo derivada disso.
   */
  moverParaFase: async (produtoId: number, fase: FaseProcesso) => {
    const { data } = await api.post<{ mensagem: string; movido: boolean }>(
      `/certificacoes/produto/${produtoId}/mover-fase`,
      { fase },
    );
    return data;
  },

  /** Interrompe o processo. O motivo é obrigatório no backend. */
  cancelar: async (produtoId: number, motivo: string) => {
    const { data } = await api.post<{ mensagem: string }>(
      `/certificacoes/produto/${produtoId}/cancelar`,
      { motivo },
    );
    return data;
  },

  /** Devolve ao fluxo um processo cancelado. */
  reabrir: async (produtoId: number) => {
    const { data } = await api.post<{ mensagem: string }>(
      `/certificacoes/produto/${produtoId}/reabrir`,
    );
    return data;
  },

  /** Aplica a migração — sempre com confirmação explícita do usuário. */
  migrarVersao: async (produtoId: number) => {
    const { data } = await api.post<SituacaoVersaoTrilha>(
      `/certificacoes/produto/${produtoId}/migrar-versao-trilha`,
    );
    return data;
  },

  /**
   * Baixa a planilha do acompanhamento.
   *
   * Vem por blob, e não por `<a href>`, porque a rota exige o Bearer — um link
   * direto sairia sem o cabeçalho e voltaria 401. O nome do arquivo é o que o
   * servidor mandou no `Content-Disposition`: quem sabe montar o nome é quem
   * conhece o produto e a data, e duplicar essa regra aqui a faria divergir.
   */
  exportar: async (produtoId: number, formato: 'xlsx' | 'csv') => {
    const resposta = await api.get<Blob>(
      `/certificacoes/produto/${produtoId}/exportacao`,
      { params: { formato }, responseType: 'blob' },
    );

    const cabecalho = String(
      resposta.headers['content-disposition'] ?? '',
    );
    const nome =
      /filename="?([^"]+)"?/.exec(cabecalho)?.[1] ??
      `acompanhamento.${formato}`;

    const url = URL.createObjectURL(resposta.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    link.click();
    URL.revokeObjectURL(url);
  },

  reiniciar: async (produtoId: number) => {
    const { data } = await api.post<{ mensagem: string }>(
      `/certificacoes/produto/${produtoId}/reiniciar`,
    );
    return data;
  },
};
