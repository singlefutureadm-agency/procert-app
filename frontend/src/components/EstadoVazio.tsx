import type { ReactNode } from 'react';

interface Props {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  icone?: string;
}

export function EstadoVazio({ titulo, descricao, acao, icone = '📭' }: Props) {
  return (
    <div className="estado-vazio">
      <span style={{ fontSize: '2.4rem' }} aria-hidden>
        {icone}
      </span>
      <h3>{titulo}</h3>
      {descricao && <p className="texto-pequeno texto-fraco">{descricao}</p>}
      {acao}
    </div>
  );
}
