import { useId, useRef } from 'react';

import { Modal } from './Modal';

interface Props {
  aberto: boolean;
  titulo: string;
  mensagem: string;
  rotuloConfirmar?: string;
  perigo?: boolean;
  carregando?: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}

/**
 * Substitui os modais Bootstrap duplicados em 8 views do legado, cada uma com
 * sua própria cópia do mesmo JavaScript.
 *
 * A mecânica (cortina, Escape, Tab preso, devolução do foco) mora no `Modal`;
 * aqui sobrou o que é específico de uma confirmação: a mensagem, os dois botões
 * e a escolha de qual deles recebe o foco.
 */
export function ModalConfirmacao({
  aberto,
  titulo,
  mensagem,
  rotuloConfirmar = 'Confirmar',
  perigo = false,
  carregando = false,
  aoConfirmar,
  aoCancelar,
}: Props) {
  const confirmar = useRef<HTMLButtonElement>(null);
  const cancelar = useRef<HTMLButtonElement>(null);
  const idMensagem = useId();

  /*
   * Ação destrutiva abre com o foco em "Cancelar", não no botão que destrói.
   *
   * O modal abre por um clique e fecha no Escape, então o dedo costuma estar
   * sobre Enter/Espaço quando ele aparece: com o foco no confirmar, uma tecla a
   * mais desativava o produto sem que ninguém tivesse lido a mensagem. Focar a
   * saída torna o gesto reflexo inofensivo e obriga um Tab deliberado para
   * destruir.
   *
   * Nos modais não destrutivos o padrão continua sendo o confirmar: ali o
   * caminho rápido é o desejado e o erro não custa nada.
   */
  const focoInicial = perigo ? cancelar : confirmar;

  return (
    <Modal
      aberto={aberto}
      titulo={titulo}
      focoInicial={focoInicial}
      descritoPor={idMensagem}
      aoFechar={aoCancelar}
    >
      <p className="texto-suave" id={idMensagem}>
        {mensagem}
      </p>

      <div className="form-acoes">
        <button
          type="button"
          className="btn"
          onClick={aoCancelar}
          disabled={carregando}
          ref={cancelar}
        >
          Cancelar
        </button>
        <button
          type="button"
          className={`btn ${perigo ? 'btn--perigo' : 'btn--primario'}`}
          onClick={aoConfirmar}
          disabled={carregando}
          ref={confirmar}
        >
          {carregando ? 'Aguarde...' : rotuloConfirmar}
        </button>
      </div>
    </Modal>
  );
}
