import type { ReactNode } from 'react';

import { AjudaDaTela } from '@/features/ajuda/AjudaDaTela';

interface Props {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
}

export function CabecalhoPagina({ titulo, descricao, acoes }: Props) {
  return (
    <div className="cabecalho-pagina">
      <div>
        <div className="cabecalho-pagina__titulo">
          {/* `titulo-pagina` em vez de `style={{ fontSize }}`: o degrau sai da
              escala tipográfica do global.css e passa a valer para toda tela. */}
          <h1 className="titulo-pagina">{titulo}</h1>

          {/*
           * O botão de ajuda mora aqui, e não em `acoes`, por dois motivos.
           *
           * Semântico: ele não é uma ação sobre os dados da tela ("Novo
           * produto", "Exportar") — é uma explicação sobre a própria tela, e
           * pertence ao título. Misturado às ações, ele competiria com o botão
           * primário justamente na hora em que o usuário decide o que fazer.
           *
           * Prático: `CabecalhoPagina` é o caminho comum das telas do painel,
           * então ligar a ajuda aqui a leva a todas de uma vez. Nenhuma página
           * precisa se lembrar de fazê-lo, e tela nova já nasce coberta — desde
           * que tenha verbete em `conteudo-ajuda.ts`, o que o teste cobra.
           */}
          <AjudaDaTela />
        </div>
        {descricao && <p>{descricao}</p>}
      </div>
      {acoes && <div className="linha-flex">{acoes}</div>}
    </div>
  );
}
