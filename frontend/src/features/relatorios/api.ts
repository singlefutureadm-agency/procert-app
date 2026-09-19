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

// ------------------------------------------------------------ comparativos

export type OrdemProcessos = 'progresso' | 'progresso_asc' | 'paradas' | 'nome';
export type OrdemClientes = 'processos' | 'processos_asc' | 'certificados' | 'nome';

export interface FiltrosComparativoProcessos {
  pagina?: number;
  limite?: number;
  busca?: string;
  ordem?: OrdemProcessos;
  clienteId?: number;
  categoriaId?: number;
}

export interface FiltrosComparativoClientes {
  pagina?: number;
  limite?: number;
  busca?: string;
  ordem?: OrdemClientes;
  responsavelId?: number;
}

export interface LinhaComparativoProcesso {
  id: number;
  nome: string;
  clienteId: number;
  cliente: string;
  categoria: string;
  trilhaVersao: number;
  totalEtapas: number;
  aprovadas: number;
  reprovadas: number;
  pendentes: number;
  /** O que realmente trava a emissão do certificado. */
  obrigatoriasPendentes: number;
  ncsAbertas: number;
  progresso: number;
  ultimaMovimentacao: string | null;
  /** Dias desde a última movimentação; `null` quando nunca houve nenhuma. */
  diasParado: number | null;
  criadoEm: string;
}

export interface LinhaComparativoCliente {
  id: number;
  nome: string;
  email: string;
  responsavel: string | null;
  ultimoAcessoEm: string | null;
  processos: number;
  processosConcluidos: number;
  certificadosVigentes: number;
  ncsAbertas: number;
  ultimaMovimentacao: string | null;
}

/** Dispara o download de um blob autenticado, lendo o nome do cabeçalho. */
async function baixar(
  rota: string,
  params: Record<string, unknown>,
  padrao: string,
) {
  const resposta = await api.get<Blob>(rota, { params, responseType: 'blob' });

  const cabecalho = String(resposta.headers['content-disposition'] ?? '');
  const nome = /filename="?([^"]+)"?/.exec(cabecalho)?.[1] ?? padrao;

  const url = URL.createObjectURL(resposta.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}

export const comparativosApi = {
  processos: async (filtros: FiltrosComparativoProcessos) => {
    const { data } = await api.get<RespostaPaginada<LinhaComparativoProcesso>>(
      '/relatorios/processos',
      { params: filtros },
    );
    return data;
  },

  exportarProcessos: (
    filtros: Omit<FiltrosComparativoProcessos, 'pagina' | 'limite'>,
    formato: 'xlsx' | 'csv',
  ) =>
    baixar(
      '/relatorios/processos/exportacao',
      { ...filtros, formato },
      `comparativo-processos.${formato}`,
    ),

  clientes: async (filtros: FiltrosComparativoClientes) => {
    const { data } = await api.get<RespostaPaginada<LinhaComparativoCliente>>(
      '/relatorios/clientes',
      { params: filtros },
    );
    return data;
  },

  exportarClientes: (
    filtros: Omit<FiltrosComparativoClientes, 'pagina' | 'limite'>,
    formato: 'xlsx' | 'csv',
  ) =>
    baixar(
      '/relatorios/clientes/exportacao',
      { ...filtros, formato },
      `comparativo-clientes.${formato}`,
    ),
};

// ----------------------------------------------------------- tempo de ciclo

export type AgrupamentoCiclo = 'trilha' | 'etapa';

/** Duração sempre acompanhada da base — mediana sem base não diz nada. */
export interface Medida {
  medianaDias: number | null;
  base: number;
}

/**
 * Um grupo do relatório de tempo de ciclo.
 *
 * As três medidas de duração são relógios diferentes e **não são comparáveis
 * entre si**: nunca as coloque na mesma série de gráfico nem some nada aqui.
 */
export interface GrupoCiclo {
  chave: string;
  /** Medida do PROCESSO. `null` no agrupamento por etapa, onde não se aplica. */
  leadTimeTrilha: Medida | null;
  tempoTratamentoEtapa: Medida;
  tempoEmFila: Medida;
  /** Etapas aprovadas sem tratamento registrado. Ficam fora da mediana acima. */
  aprovacaoDireta: { etapas: number };
  etapasEmAberto: { etapas: number; medianaDias: number | null };
}

export interface RelatorioCiclo {
  agrupamento: AgrupamentoCiclo;
  periodo: { de: string | null; ate: string | null };
  grupos: GrupoCiclo[];
}

export interface FiltrosTempoCiclo {
  agrupamento?: AgrupamentoCiclo;
  de?: string;
  ate?: string;
}

export const cicloApi = {
  relatorio: async (filtros: FiltrosTempoCiclo) => {
    const { data } = await api.get<RelatorioCiclo>('/relatorios/tempo-ciclo', {
      params: filtros,
    });
    return data;
  },

  exportar: (filtros: FiltrosTempoCiclo, formato: 'xlsx' | 'csv') =>
    baixar(
      '/relatorios/tempo-ciclo/exportacao',
      { ...filtros, formato },
      `tempo-de-ciclo.${formato}`,
    ),
};
