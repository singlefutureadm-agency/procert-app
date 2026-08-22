import type { ReactNode } from 'react';

import { diasAteOPrazo, formatarData } from '@/lib/formatadores';
import type { Certificado, StatusCertificado } from '@/types';

const CLASSE_STATUS: Record<StatusCertificado, string> = {
  EMITIDO: 'badge--aprovado',
  SUSPENSO: 'badge--pendente',
  CANCELADO: 'badge--reprovado',
  VENCIDO: 'badge--reprovado',
};

const ROTULO_STATUS: Record<StatusCertificado, string> = {
  EMITIDO: 'Emitido',
  SUSPENSO: 'Suspenso',
  CANCELADO: 'Cancelado',
  VENCIDO: 'Vencido',
};

/** Alerta de validade — só relevante enquanto o certificado ainda vale. */
function AvisoValidade({ certificado }: { certificado: Certificado }) {
  if (certificado.status !== 'EMITIDO') return null;

  const dias = diasAteOPrazo(certificado.dataValidade);
  if (dias === null || dias > 60) return null;

  return (
    <span
      className={`badge sem-quebra ${dias < 0 ? 'badge--reprovado' : 'badge--pendente'}`}
    >
      {dias < 0 ? `vencido há ${Math.abs(dias)} dia(s)` : `vence em ${dias} dia(s)`}
    </span>
  );
}

interface Props {
  certificado: Certificado;
  contexto?: ReactNode;
  acoes?: ReactNode;
  /**
   * Substitui o aviso de validade padrão.
   *
   * O padrão só fala quando o certificado está `EMITIDO` e vence em até 60
   * dias — suficiente na listagem geral, onde a validade é um detalhe. Na tela
   * de vencimentos ela é o assunto, e o selo precisa aparecer para qualquer
   * prazo e também para o suspenso. Sem esta porta, as duas informações
   * apareciam lado a lado dizendo a mesma coisa.
   */
  aviso?: ReactNode;
}

export function CartaoCertificado({ certificado, contexto, acoes, aviso }: Props) {
  return (
    <article className="nc">
      <header className="nc__topo">
        <div>
          <strong className="nc__codigo">{certificado.numero}</strong>
          <span className={`badge ${CLASSE_STATUS[certificado.status]}`}>
            {ROTULO_STATUS[certificado.status]}
          </span>
          {aviso ?? <AvisoValidade certificado={certificado} />}
        </div>
        <span className="texto-pequeno texto-suave sem-quebra">
          {formatarData(certificado.dataEmissao)} →{' '}
          {formatarData(certificado.dataValidade)}
        </span>
      </header>

      {contexto && <div className="texto-pequeno texto-suave">{contexto}</div>}

      <p className="nc__descricao">{certificado.escopo}</p>

      {certificado.motivoStatus && (
        <div className="nc__bloco">
          <span className="texto-pequeno texto-fraco">
            Motivo da {ROTULO_STATUS[certificado.status].toLowerCase()}
          </span>
          <p>{certificado.motivoStatus}</p>
        </div>
      )}

      <footer className="texto-pequeno texto-fraco">
        Emitido por {certificado.emitidoPorNome} · categoria{' '}
        {certificado.produto.categoria.nome}
        {certificado.produto.categoria.normaReferencia &&
          ` · ${certificado.produto.categoria.normaReferencia}`}
      </footer>

      {acoes && <div className="nc__acoes">{acoes}</div>}
    </article>
  );
}
