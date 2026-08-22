import { type ReactNode } from 'react';

import { RegiaoRolavel } from './RegiaoRolavel';

interface Props {
  /** Do que é a tabela. Vira o nome da região no leitor de tela. */
  rotulo: string;
  children: ReactNode;
}

/**
 * Invólucro das tabelas do painel.
 *
 * Continua sendo o que se usa em volta de toda `table.tabela` — a mecânica de
 * "só é focável enquanto rola" mudou de casa para `RegiaoRolavel`, que a
 * timeline da certificação também usa. Aqui sobrou o que é específico de
 * tabela: a classe `.tabela-wrapper`.
 *
 * Abaixo de 720px o CSS transforma as linhas em cartões e o estouro deixa de
 * existir; a medição de `RegiaoRolavel` percebe isso sozinha e o Tab volta a
 * pular a região.
 */
export function TabelaRolavel({ rotulo, children }: Props) {
  return (
    <RegiaoRolavel rotulo={rotulo} className="tabela-wrapper">
      {children}
    </RegiaoRolavel>
  );
}
