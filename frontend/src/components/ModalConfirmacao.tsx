import { useEffect, useRef } from 'react';

/**
 * Tudo que recebe foco por Tab. `:not([disabled])` importa aqui: o botão de
 * confirmar fica desabilitado enquanto `carregando`, e sem o filtro o ciclo
 * pararia num alvo que o navegador pula.
 */
const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
 * Substitui os modais Bootstrap duplicados em 8 views do legado,
 * cada uma com sua própria cópia do mesmo JavaScript.
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
  const caixa = useRef<HTMLDivElement>(null);
  /** Quem tinha o foco antes de abrir — normalmente o botão que abriu o modal. */
  const origemDoFoco = useRef<HTMLElement | null>(null);
  const confirmar = useRef<HTMLButtonElement>(null);
  const cancelar = useRef<HTMLButtonElement>(null);

  /*
   * `aoCancelar` chega como arrow inline das páginas (`() => setAlvo(null)`),
   * ou seja, muda de identidade a cada render do pai. Se ele entrasse nas
   * dependências do efeito abaixo, o efeito se remontaria no meio da vida do
   * modal — e a limpeza devolveria o foco para o botão que estivesse ativo
   * naquele instante (um botão de dentro do próprio modal, prestes a sumir do
   * DOM), fazendo o `.focus()` cair no vazio e o foco terminar no <body>.
   *
   * A ref desacopla as duas coisas: o efeito depende só de `aberto` e sempre
   * enxerga o callback mais recente.
   */
  const cancelarRef = useRef(aoCancelar);
  useEffect(() => {
    cancelarRef.current = aoCancelar;
  });

  useEffect(() => {
    if (!aberto) return;

    /*
     * A ordem aqui é o que faz a restauração funcionar, e é sutil.
     *
     * O botão de confirmar tinha `autoFocus`, que o React aplica ao inserir o
     * nó no DOM — ou seja, ANTES deste efeito rodar. Quando chegávamos aqui,
     * `document.activeElement` já não era o botão que abriu o modal: era o
     * próprio botão de confirmar. Gravávamos ele como "origem", ele saía do DOM
     * ao fechar, e o `.focus()` da limpeza caía num nó órfão — o foco ia parar
     * no <body>.
     *
     * Por isso o `autoFocus` saiu do JSX e o foco inicial é dado aqui: assim a
     * leitura da origem acontece antes de qualquer movimento nosso.
     */
    origemDoFoco.current = document.activeElement as HTMLElement | null;

    /*
     * Ação destrutiva abre com o foco em "Cancelar", não no botão que destrói.
     *
     * O modal já abre por um clique e fecha no Escape, então o dedo costuma
     * estar sobre Enter/Espaço quando ele aparece: com o foco no confirmar, uma
     * tecla a mais desativava o produto sem que ninguém tivesse lido a
     * mensagem. Focar a saída torna o gesto reflexo inofensivo e obriga um Tab
     * deliberado para destruir.
     *
     * Nos modais não destrutivos o padrão continua sendo o confirmar: ali o
     * caminho rápido é o desejado e o erro não custa nada.
     */
    const inicial = perigo ? cancelar.current : confirmar.current;
    /*
     * `focusVisible: true` porque foco dado por código não acende o
     * `:focus-visible` quando o modal foi aberto por clique. Aqui isso importa
     * mais do que no caso comum: o botão em foco é o que Enter vai acionar, e
     * num modal destrutivo o usuário precisa *ver* que a tecla cai em
     * "Cancelar" — um padrão seguro invisível não protege ninguém.
     */
    inicial?.focus({ focusVisible: true } as FocusOptions);

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        cancelarRef.current();
        return;
      }

      if (evento.key !== 'Tab' || !caixa.current) return;

      /*
       * Prende o Tab dentro do modal. Sem isto o foco sai por trás da cortina e
       * segue navegando a página bloqueada: quem enxerga vê o anel sumir, e quem
       * usa leitor de tela passa a ouvir uma tela que não pode operar.
       *
       * A lista é recalculada a cada Tab de propósito — o botão de confirmar
       * habilita e desabilita conforme `carregando`.
       */
      const focaveis = Array.from(
        caixa.current.querySelectorAll<HTMLElement>(FOCAVEIS),
      );
      if (focaveis.length === 0) return;

      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const atual = document.activeElement;

      if (evento.shiftKey && (atual === primeiro || !caixa.current.contains(atual))) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && atual === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener('keydown', aoTeclar);

    return () => {
      document.removeEventListener('keydown', aoTeclar);

      /*
       * Devolve o foco a quem abriu o modal, senão ele cai no <body> e o Tab
       * seguinte recomeça do topo da página — na tabela de produtos isso
       * significa refazer a navegação inteira até a linha em que se estava.
       *
       * `focusVisible: true` porque foco movido por código não acende o
       * `:focus-visible` sozinho: sem isso o foco voltaria correto mas
       * invisível, que para quem navega por teclado é quase o mesmo que perder.
       */
      origemDoFoco.current?.focus({ focusVisible: true } as FocusOptions);
      origemDoFoco.current = null;
    };
    // `perigo` é constante por ponto de uso (nunca muda com o modal aberto), então
    // listá-lo não remonta o efeito — só mantém a leitura do foco inicial honesta.
  }, [aberto, perigo]);

  if (!aberto) return null;

  return (
    <div
      className="modal-fundo"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal"
      // Sem isto o leitor de tela anuncia só o título e o usuário confirma uma
      // exclusão sem nunca ouvir o que ela faz.
      aria-describedby="mensagem-modal"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) aoCancelar();
      }}
    >
      <div className="modal vidro" ref={caixa}>
        <h3 id="titulo-modal">{titulo}</h3>
        <p className="texto-suave" id="mensagem-modal">
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
      </div>
    </div>
  );
}
