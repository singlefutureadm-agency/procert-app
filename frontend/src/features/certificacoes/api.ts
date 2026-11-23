import { api } from '@/lib/api';
import type {
  AberturaNaoConformidade,
  CertificacaoDetalhe,
  DocumentoMicroEtapa,
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
  /** ÁREA da etapa atual (PapelFuncional) — não a pessoa. */
  papelResponsavel?: PapelFuncional;
  /** DONO do processo. `0` traz os sem responsável. */
  responsavelId?: number;
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
   * O `id` é da microetapa DO PROCESSO. Fechar o checklist pode aprovar a
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

  porProcesso: async (processoId: number) => {
    const { data } = await api.get<CertificacaoDetalhe>(
      `/certificacoes/processo/${processoId}`,
    );
    return data;
  },

  /** Salva todas as etapas em um único PUT — o backend grava o histórico. */
  salvar: async (processoId: number, etapas: EtapaAlteracao[]) => {
    const { data } = await api.put<CertificacaoDetalhe>(
      `/certificacoes/processo/${processoId}`,
      { etapas },
    );
    return data;
  },

  /** Consulta pura: diz se o processo ficou preso a uma versão antiga da trilha. */
  verificarVersao: async (processoId: number) => {
    const { data } = await api.get<SituacaoVersaoTrilha>(
      `/certificacoes/processo/${processoId}/versao-trilha`,
    );
    return data;
  },

  /**
   * Envia um documento à etapa (`certificacaoId` é a linha da timeline).
   *
   * Sem `microEtapaId` é evidência da ETAPA, anexada pela equipe. COM ele é a
   * resposta a um item do checklist que pede documento — e aí o arquivo nasce
   * `PENDENTE` e entra na fila de avaliação. O CLIENTE só consegue a segunda
   * forma, e é o backend que impõe isso.
   */
  anexarDocumento: async (
    processoId: number,
    certificacaoId: number,
    arquivo: File,
    microEtapaId?: number,
  ) => {
    const formulario = new FormData();
    formulario.append('documento', arquivo);
    // `FormData` só transporta texto: o DTO declara `@Type(() => Number)`.
    if (microEtapaId !== undefined) {
      formulario.append('microEtapaId', String(microEtapaId));
    }

    const { data } = await api.post<DocumentoMicroEtapa>(
      `/certificacoes/processo/${processoId}/etapas/${certificacaoId}/documento`,
      formulario,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
  },

  /**
   * Aceita ou recusa um documento enviado para um item do checklist.
   *
   * Rota da EQUIPE: o cliente envia e não julga o próprio envio. O `parecer` é
   * obrigatório na recusa — o backend recusa 400 sem ele, e é o texto que o
   * cliente lê para saber o que reenviar.
   */
  avaliarDocumento: async (
    id: number,
    dados: { situacao: 'ACEITO' | 'RECUSADO'; parecer?: string },
  ) => {
    const { data } = await api.patch<DocumentoMicroEtapa>(
      `/certificacoes/documentos/${id}/avaliacao`,
      dados,
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
  moverParaFase: async (processoId: number, fase: FaseProcesso) => {
    const { data } = await api.post<{ mensagem: string; movido: boolean }>(
      `/certificacoes/processo/${processoId}/mover-fase`,
      { fase },
    );
    return data;
  },

  /** Interrompe o processo. O motivo é obrigatório no backend. */
  cancelar: async (processoId: number, motivo: string) => {
    const { data } = await api.post<{ mensagem: string }>(
      `/certificacoes/processo/${processoId}/cancelar`,
      { motivo },
    );
    return data;
  },

  /** Devolve ao fluxo um processo cancelado. */
  reabrir: async (processoId: number) => {
    const { data } = await api.post<{ mensagem: string }>(
      `/certificacoes/processo/${processoId}/reabrir`,
    );
    return data;
  },

  /** Aplica a migração — sempre com confirmação explícita do usuário. */
  migrarVersao: async (processoId: number) => {
    const { data } = await api.post<SituacaoVersaoTrilha>(
      `/certificacoes/processo/${processoId}/migrar-versao-trilha`,
    );
    return data;
  },

  /**
   * Baixa a planilha do acompanhamento.
   *
   * Vem por blob, e não por `<a href>`, porque a rota exige o Bearer — um link
   * direto sairia sem o cabeçalho e voltaria 401. O nome do arquivo é o que o
   * servidor mandou no `Content-Disposition`: quem sabe montar o nome é quem
   * conhece o processo e a data, e duplicar essa regra aqui a faria divergir.
   */
  exportar: async (processoId: number, formato: 'xlsx' | 'csv') => {
    const resposta = await api.get<Blob>(
      `/certificacoes/processo/${processoId}/exportacao`,
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

  reiniciar: async (processoId: number) => {
    const { data } = await api.post<{ mensagem: string }>(
      `/certificacoes/processo/${processoId}/reiniciar`,
    );
    return data;
  },
};
