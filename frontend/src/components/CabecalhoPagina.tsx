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
        {/* `titulo-pagina` em vez de `style={{ fontSize }}`: o degrau sai da
            escala tipográfica do global.css e passa a valer para toda tela. */}
        <h1 className="titulo-pagina">{titulo}</h1>
        {descricao && <p>{descricao}</p>}
      </div>
      {acoes && <div className="linha-flex">{acoes}</div>}
    </div>
  );
}
