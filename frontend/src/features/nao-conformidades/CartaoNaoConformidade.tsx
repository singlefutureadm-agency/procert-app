import type { ReactNode } from 'react';

import {
  diasAteOPrazo,
  formatarData,
  formatarDataHora,
  rotuloCriticidade,
  rotuloStatusNaoConformidade,
} from '@/lib/formatadores';
import type { NaoConformidade, StatusNaoConformidade } from '@/types';

const CLASSE_STATUS: Record<StatusNaoConformidade, string> = {
  ABERTA: 'badge--reprovado',
  EM_TRATATIVA: 'badge--andamento',
  RESOLVIDA: 'badge--aprovado',
  REPROVADA: 'badge--pendente',
};

/** Aviso de prazo: só aparece enquanto a NC ainda aguarda alguma ação. */
export function AvisoPrazo({ nc }: { nc: NaoConformidade }) {
  const emAberto = nc.status === 'ABERTA' || nc.status === 'EM_TRATATIVA';
  const dias = diasAteOPrazo(nc.prazoResposta);

  if (!nc.prazoResposta || !emAberto || dias === null) {
    return <span className="texto-suave">{formatarData(nc.prazoResposta)}</span>;
  }

  if (dias < 0) {
    return (
      <span className="badge badge--reprovado sem-quebra">
        vencida há {Math.abs(dias)} dia(s)
      </span>
    );
  }

  return (
    <span
      className={`badge sem-quebra ${dias <= 3 ? 'badge--pendente' : 'badge--andamento'}`}
    >
      {dias === 0 ? 'vence hoje' : `faltam ${dias} dia(s)`}
    </span>
  );
}

interface Props {
  nc: NaoConformidade;
  /** Contexto extra (produto/etapa) na listagem geral. */
  contexto?: ReactNode;
  acoes?: ReactNode;
}

export function CartaoNaoConformidade({ nc, contexto, acoes }: Props) {
  return (
    <article className="nc">
      <header className="nc__topo">
        <div>
          <strong className="nc__codigo">{nc.codigo}</strong>
          <span className={`badge ${CLASSE_STATUS[nc.status]}`}>
            {rotuloStatusNaoConformidade[nc.status]}
          </span>
          <span
            className={`badge ${nc.criticidade === 'MAIOR' ? 'badge--reprovado' : 'badge--pendente'}`}
          >
            {rotuloCriticidade[nc.criticidade]}
          </span>
        </div>
        <AvisoPrazo nc={nc} />
      </header>

      {contexto && <div className="texto-pequeno texto-suave">{contexto}</div>}

      <p className="nc__descricao">{nc.descricao}</p>

      {nc.respostaCliente && (
        <div className="nc__bloco">
          <span className="texto-pequeno texto-fraco">
            Resposta do cliente · {formatarDataHora(nc.respondidoEm)}
          </span>
          <p>{nc.respostaCliente}</p>
        </div>
      )}

      {nc.parecer && (
        <div className="nc__bloco">
          <span className="texto-pequeno texto-fraco">
            Parecer da equipe · {formatarDataHora(nc.resolvidoEm)}
          </span>
          <p>{nc.parecer}</p>
        </div>
      )}

      <footer className="texto-pequeno texto-fraco">
        Aberta por {nc.abertoPorNome} em {formatarDataHora(nc.criadoEm)}
      </footer>

      {acoes && <div className="nc__acoes">{acoes}</div>}
    </article>
  );
}
