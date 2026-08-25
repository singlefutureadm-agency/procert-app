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
