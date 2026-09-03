import type { TipoEtapa } from '@/types';

/** Rótulos em português dos tipos de etapa (enum TipoEtapa do backend). */
export const ROTULO_TIPO_ETAPA: Record<TipoEtapa, string> = {
  DOCUMENTAL: 'Documental',
  ENSAIO: 'Ensaio',
  AUDITORIA_FABRICA: 'Auditoria de fábrica',
  ANALISE_CRITICA: 'Análise crítica',
  DECISAO: 'Decisão',
  OUTRO: 'Outro',
};
