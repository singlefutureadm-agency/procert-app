import type {
  FaseProcesso,
  MotivoProcesso,
  PapelFuncional,
  TipoEtapa,
} from '@/types';

/** Rótulos em português dos tipos de etapa (enum TipoEtapa do backend). */
export const ROTULO_TIPO_ETAPA: Record<TipoEtapa, string> = {
  DOCUMENTAL: 'Documental',
  ENSAIO: 'Ensaio',
  AUDITORIA_FABRICA: 'Auditoria de fábrica',
  ANALISE_CRITICA: 'Análise crítica',
  DECISAO: 'Decisão',
  OUTRO: 'Outro',
};

/**
 * Papel FUNCIONAL — quem executa a etapa no fluxo.
 *
 * Não é papel de acesso. "Cliente" aqui significa "a etapa espera uma ação do
 * cliente" (enviar documento, responder NC), não que ele tenha permissão sobre
 * a trilha. Ver `PapelFuncional` em `types/index.ts`.
 */
export const ROTULO_PAPEL_FUNCIONAL: Record<PapelFuncional, string> = {
  CLIENTE: 'Cliente',
  TECNICO: 'Técnico',
  QUALIDADE: 'Qualidade',
  AUDITOR: 'Auditor',
  DIRETORIA: 'Diretoria',
};

/** Fases do pipeline — os títulos das colunas do quadro. */
export const ROTULO_FASE: Record<FaseProcesso, string> = {
  ABERTURA: 'Abertura',
  AMOSTRAGEM_AUDITORIA: 'Amostragem e auditoria',
  ENSAIOS_LABORATORIO: 'Ensaios de laboratório',
  ANALISE_PROCESSO: 'Análise do processo',
  EMISSAO: 'Emissão',
};

/** Por que o processo foi aberto. Vinha no nome do card do quadro. */
export const ROTULO_MOTIVO_PROCESSO: Record<MotivoProcesso, string> = {
  INICIAL: 'Inicial',
  RENOVACAO: 'Renovação',
  RECERTIFICACAO: 'Recertificação',
  MANUTENCAO: 'Manutenção',
  TRANSFERENCIA: 'Transferência',
  EXTENSAO_ESCOPO: 'Extensão de escopo',
};
