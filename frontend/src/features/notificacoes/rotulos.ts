import type { TipoNotificacao } from '@/types';

/**
 * O que aconteceu, em texto curto.
 *
 * `Record` completo e não `Partial`: um tipo novo no enum sem rótulo aqui
 * reprovaria o type-check em vez de renderizar `undefined` no badge.
 */
export const ROTULO_TIPO: Record<TipoNotificacao, string> = {
  DOCUMENTO_ENVIADO: 'Documento recebido',
  DOCUMENTO_ACEITO: 'Documento aceito',
  DOCUMENTO_RECUSADO: 'Documento recusado',
};

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/**
 * "agora", "há 5 min", "há 3 h", "há 2 d" — e a data a partir de uma semana.
 *
 * Escrito à mão, como o resto dos formatadores do projeto: `Intl.RelativeTimeFormat`
 * resolveria, mas a escolha da UNIDADE continuaria sendo nossa (ele formata, não
 * decide), e a pt-BR dele produz "há 90 minutos" onde a tela quer "há 2 h".
 *
 * A partir de uma semana vira data absoluta: "há 23 d" obriga o leitor a fazer
 * a conta que a data já responde.
 */
export function tempoRelativo(iso: string, agora: Date = new Date()): string {
  const quando = new Date(iso);
  const decorrido = agora.getTime() - quando.getTime();

  // Relógio do cliente adiantado em relação ao servidor produz negativo. "em
  // 3 min" para um aviso que já chegou é pior que "agora".
  if (decorrido < MINUTO) return 'agora';
  if (decorrido < HORA) return `há ${Math.floor(decorrido / MINUTO)} min`;
  if (decorrido < DIA) return `há ${Math.floor(decorrido / HORA)} h`;
  if (decorrido < 7 * DIA) return `há ${Math.floor(decorrido / DIA)} d`;

  return quando.toLocaleDateString('pt-BR');
}
