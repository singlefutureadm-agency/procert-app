import type { ReactNode } from 'react';

interface Props {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
}

export function CabecalhoPagina({ titulo, descricao, acoes }: Props) {
  return (
    <div className="cabecalho-pagina">
      <div>
        <h1 style={{ fontSize: '1.6rem' }}>{titulo}</h1>
        {descricao && <p>{descricao}</p>}
      </div>
      {acoes && <div className="linha-flex">{acoes}</div>}
    </div>
  );
}
