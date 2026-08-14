import { rotuloStatusCertificacao } from '@/lib/formatadores';
import type { StatusCertificacao, StatusRegistro } from '@/types';

const CLASSES: Record<StatusCertificacao, string> = {
  PENDENTE: 'badge--pendente',
  EM_ANDAMENTO: 'badge--andamento',
  APROVADO: 'badge--aprovado',
  REPROVADO: 'badge--reprovado',
};

export function BadgeCertificacao({ status }: { status: StatusCertificacao }) {
  return (
    <span className={`badge ${CLASSES[status]}`}>
      {rotuloStatusCertificacao[status]}
    </span>
  );
}

export function BadgeStatus({ status }: { status: StatusRegistro }) {
  return (
    <span
      className={`badge ${status === 'ATIVO' ? 'badge--aprovado' : 'badge--pendente'}`}
    >
      {status === 'ATIVO' ? 'Ativo' : 'Inativo'}
    </span>
  );
}
