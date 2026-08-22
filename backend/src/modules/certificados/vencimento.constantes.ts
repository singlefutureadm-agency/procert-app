import { StatusCertificado } from '@prisma/client';

/**
 * Faixas de vencimento, em dias, da mais urgente para a mais distante.
 *
 * Fonte única: o gráfico "Vencimentos à frente" e a tela de certificados em
 * risco precisam contar exatamente as mesmas coisas. Duas listas de faixas
 * divergiriam sem ninguém notar — o gráfico diria "3 vencem em 30 dias" e a
 * lista mostraria 4, e nada acusaria o erro.
 */
export const FAIXAS_VENCIMENTO = [
  { chave: 'vencido', rotulo: 'Vencido', ate: -1 },
  { chave: '30', rotulo: 'Até 30 dias', ate: 30 },
  { chave: '60', rotulo: '31 a 60 dias', ate: 60 },
  { chave: '90', rotulo: '61 a 90 dias', ate: 90 },
  { chave: '180', rotulo: '91 a 180 dias', ate: 180 },
  { chave: 'depois', rotulo: 'Mais de 180 dias', ate: Number.POSITIVE_INFINITY },
] as const;

export type ChaveFaixaVencimento = (typeof FAIXAS_VENCIMENTO)[number]['chave'];

/**
 * Um certificado nesses estados ainda ocupa o lugar de "certificado atual" — e
 * é o único que entra na projeção de vencimento.
 *
 * `CANCELADO` é terminal e `VENCIDO` já venceu: incluí-los inflaria a contagem
 * de urgência com casos que ninguém precisa renovar.
 */
export const VIGENTES: StatusCertificado[] = [
  StatusCertificado.EMITIDO,
  StatusCertificado.SUSPENSO,
];

/**
 * Meia-noite de hoje.
 *
 * Comparar contra o instante atual faria um certificado que vence hoje cair em
 * "vencido" ou não conforme a HORA da requisição — a mesma tela daria respostas
 * diferentes de manhã e à tarde.
 */
export function hojeAMeiaNoite(): Date {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return hoje;
}

/** Dias inteiros entre hoje e a validade. Negativo = já venceu. */
export function diasAteVencer(validade: Date, referencia = hojeAMeiaNoite()): number {
  const alvo = new Date(validade);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - referencia.getTime()) / 86_400_000);
}

/** A faixa em que esse número de dias cai. A última é aberta. */
export function faixaDeVencimento(dias: number): ChaveFaixaVencimento {
  const faixa =
    FAIXAS_VENCIMENTO.find((f) => dias <= f.ate) ??
    FAIXAS_VENCIMENTO[FAIXAS_VENCIMENTO.length - 1];
  return faixa.chave;
}
