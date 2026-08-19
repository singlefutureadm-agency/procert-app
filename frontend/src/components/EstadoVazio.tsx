import type { ReactNode } from 'react';

import { Icone, type NomeIcone } from '@/components/Icone';

interface Props {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  icone?: NomeIcone;
}

export function EstadoVazio({ titulo, descricao, acao, icone = 'caixa-vazia' }: Props) {
  return (
    <div className="estado-vazio">
      {/* Decorativo: o <h3> logo abaixo já diz o que a tela está informando. */}
      <Icone nome={icone} tamanho={40} className="icone estado-vazio__icone" />
      <h3>{titulo}</h3>
      {descricao && <p className="texto-pequeno texto-fraco">{descricao}</p>}
      {acao}
    </div>
  );
}
