import type {
  CriticidadeNaoConformidade,
  StatusCertificacao,
  StatusNaoConformidade,
} from '@/types';

export const moeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dataHoraBR = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const dataBR = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

export function formatarDataHora(valor?: string | null): string {
  return valor ? dataHoraBR.format(new Date(valor)) : '—';
}

export function formatarData(valor?: string | null): string {
  return valor ? dataBR.format(new Date(valor)) : '—';
}

/**
 * Último acesso da conta, com texto próprio para o caso nulo.
 *
 * Não usa o travessão de `formatarDataHora`: aqui o vazio não é "sem dado", é
 * "nunca entrou" — que é justamente a informação que se foi buscar na coluna.
 */
export function formatarUltimoAcesso(valor?: string | null): string {
  return valor ? dataHoraBR.format(new Date(valor)) : 'Nunca acessou';
}

/** 'YYYY-MM-DD' para preencher <input type="date"> */
export function paraInputDate(valor?: string | null): string {
  return valor ? new Date(valor).toISOString().slice(0, 10) : '';
}

export const rotuloStatusCertificacao: Record<StatusCertificacao, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  APROVADO: 'Aprovado',
  REPROVADO: 'Reprovado',
};

export const STATUS_CERTIFICACAO: StatusCertificacao[] = [
  'PENDENTE',
  'EM_ANDAMENTO',
  'APROVADO',
  'REPROVADO',
];

export const rotuloStatusNaoConformidade: Record<StatusNaoConformidade, string> = {
  ABERTA: 'Aberta',
  EM_TRATATIVA: 'Em tratativa',
  RESOLVIDA: 'Resolvida',
  REPROVADA: 'Reprovada',
};

export const rotuloCriticidade: Record<CriticidadeNaoConformidade, string> = {
  MENOR: 'Menor',
  MAIOR: 'Maior',
};

/**
 * Dias restantes até o prazo (negativo quando vencido).
 * Compara por dia, não por instante: um prazo hoje às 00h não conta como
 * vencido no meio da tarde.
 */
export function diasAteOPrazo(prazo?: string | null): number | null {
  if (!prazo) return null;

  const hoje = new Date();
  const limite = new Date(prazo);
  const emDias = (data: Date) =>
    Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()) / 86_400_000;

  return Math.round(emDias(limite) - emDias(hoje));
}

/**
 * Prazo de SLA, guardado em horas, escrito como gente lê.
 *
 * O campo virou horas em 05/09/2026 porque a operação fala em 8h, 12h, 24h,
 * 72h — mas o valor cru não serve para todo caso: "720h" é verdadeiro e
 * ilegível, e ninguém converte para 30 dias de cabeça no meio de uma tabela.
 * Daí a régua: até 48h a hora é a unidade natural ("36h"); acima disso a hora
 * continua na frente, porque é a unidade em que o prazo foi acordado, com os
 * dias entre parênteses para dar a escala ("720h (30 dias)").
 *
 * Função única, usada nas três telas que exibem prazo de etapa (detalhe da
 * trilha, modal de etapa e prévia da trilha no cadastro de produto). Eram três
 * interpolações copiadas, e foi assim que as três continuaram escrevendo
 * "dia(s)" depois que o campo passou a guardar horas — cada uma mentindo por
 * um fator de 24, sem erro em lugar nenhum.
 */
export function formatarPrazoSla(horas?: number | null): string {
  if (horas == null) return '—';
  if (horas <= 48) return `${horas}h`;

  // Sempre plural: este ramo só roda acima de 48h, então o menor valor
  // possível já passa de dois dias. Não há caso de "1 dia" para singularizar.
  const dias = horas / 24;
  // Sem casa decimal quando fecha em dia cheio: "30 dias" e não "30,0 dias".
  const escala = Number.isInteger(dias)
    ? `${dias} dias`
    : `${dias.toFixed(1).replace('.', ',')} dias`;

  return `${horas}h (${escala})`;
}

/** Tamanho de arquivo em unidade legível (KB a partir de 1024 bytes). */
export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function mascararDocumento(
  cpf?: string | null,
  cnpj?: string | null,
): string {
  return cnpj || cpf || '—';
}
