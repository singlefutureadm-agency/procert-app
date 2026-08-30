import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';

import { Icone } from './Icone';

/**
 * Tudo que recebe foco por Tab. `:not([disabled])` importa aqui: um botão de
 * ação fica desabilitado enquanto a requisição corre, e sem o filtro o ciclo
 * pararia num alvo que o navegador pula.
 */
const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  aberto: boolean;
  titulo: string;
  /**
   * Quem recebe o foco ao abrir. Sem isto, o primeiro focável do modal.
   *
   * Existe porque nem sempre o primeiro é o certo: num modal destrutivo o foco
   * inicial precisa ser "Cancelar", nunca o botão que destrói.
   */
  focoInicial?: RefObject<HTMLElement | null>;
  /** Id do elemento que descreve o modal, para o `aria-describedby`. */
  descritoPor?: string;
  /**
   * Modais de leitura precisam de mais largura que uma confirmação.
   *
   * `ampla` é para conteúdo em blocos (uma NC com descrição, resposta e
   * parecer). `leitura` é para texto corrido: mais estreita de propósito,
   * porque a largura que ajuda uma lista atrapalha um parágrafo — acima de
   * ~75 caracteres por linha o olho erra a volta. Ambas rolam por dentro.
   */
  largura?: 'padrao' | 'ampla' | 'leitura';
  /** X no canto. Confirmações não têm — ali as saídas são os próprios botões. */
  comBotaoFechar?: boolean;
  aoFechar: () => void;
  children: ReactNode;
}

/**
 * Mecânica compartilhada dos modais: cortina, Escape, Tab preso e devolução do
 * foco. Era o corpo do `ModalConfirmacao`, que hoje é um caso particular deste.
 *
 * Cada detalhe abaixo custou um bug de foco para ser descoberto — uma segunda
 * cópia disso seria uma segunda chance de reintroduzir todos eles.
 */
export function Modal({
  aberto,
  titulo,
  focoInicial,
  descritoPor,
  largura = 'padrao',
  comBotaoFechar = false,
  aoFechar,
  children,
}: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  /** Quem tinha o foco antes de abrir — normalmente o botão que abriu o modal. */
  const origemDoFoco = useRef<HTMLElement | null>(null);
  const idTitulo = useId();

  /*
   * `aoFechar` chega como arrow inline das páginas (`() => setAlvo(null)`), ou
   * seja, muda de identidade a cada render do pai. Se ele entrasse nas
   * dependências do efeito abaixo, o efeito se remontaria no meio da vida do
   * modal — e a limpeza devolveria o foco para o botão que estivesse ativo
   * naquele instante (um botão de dentro do próprio modal, prestes a sumir do
   * DOM), fazendo o `.focus()` cair no vazio e o foco terminar no <body>.
   *
   * A ref desacopla as duas coisas: o efeito depende só de `aberto` e sempre
   * enxerga o callback mais recente.
   */
  const fecharRef = useRef(aoFechar);
  useEffect(() => {
    fecharRef.current = aoFechar;
  });

  useEffect(() => {
    if (!aberto) return;

    /*
     * A ordem aqui é o que faz a restauração funcionar, e é sutil.
     *
     * Quando o foco inicial vinha de `autoFocus` no JSX, o React o aplicava ao
     * inserir o nó no DOM — ou seja, ANTES deste efeito rodar. Ao chegar aqui,
     * `document.activeElement` já não era o botão que abriu o modal: era o
     * botão de dentro dele. Gravávamos esse como "origem", ele saía do DOM ao
     * fechar, e o `.focus()` da limpeza caía num nó órfão — o foco ia parar no
     * <body>.
     *
     * Por isso nenhum `autoFocus` no JSX: a leitura da origem tem de acontecer
     * antes de qualquer movimento nosso.
     */
    origemDoFoco.current = document.activeElement as HTMLElement | null;

    const primeiro = caixa.current?.querySelector<HTMLElement>(FOCAVEIS);
    /*
     * `focusVisible: true` porque foco dado por código não acende o
     * `:focus-visible` quando o modal foi aberto por clique — o foco ficaria
     * correto mas invisível, que para quem navega por teclado é quase o mesmo
     * que perder. E num modal destrutivo importa ainda mais: o botão em foco é
     * o que Enter vai acionar, e o usuário precisa *ver* que a tecla cai em
     * "Cancelar".
     *
     * O fallback é a própria caixa (`tabIndex={-1}`): sem nenhum focável
     * dentro, o leitor de tela não entraria no diálogo.
     */
    const alvo = focoInicial?.current ?? primeiro ?? caixa.current;
    alvo?.focus({ focusVisible: true } as FocusOptions);

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        fecharRef.current();
        return;
      }

      if (evento.key !== 'Tab' || !caixa.current) return;

      /*
       * Prende o Tab dentro do modal. Sem isto o foco sai por trás da cortina e
       * segue navegando a página bloqueada: quem enxerga vê o anel sumir, e quem
       * usa leitor de tela passa a ouvir uma tela que não pode operar.
       *
       * A lista é recalculada a cada Tab de propósito — os botões habilitam e
       * desabilitam conforme as requisições correm.
       */
      const focaveis = Array.from(
        caixa.current.querySelectorAll<HTMLElement>(FOCAVEIS),
      );
      if (focaveis.length === 0) return;

      const inicio = focaveis[0];
      const fim = focaveis[focaveis.length - 1];
      const atual = document.activeElement;

      if (evento.shiftKey && (atual === inicio || !caixa.current.contains(atual))) {
        evento.preventDefault();
        fim.focus();
      } else if (!evento.shiftKey && atual === fim) {
        evento.preventDefault();
        inicio.focus();
      }
    };

    document.addEventListener('keydown', aoTeclar);

    return () => {
      document.removeEventListener('keydown', aoTeclar);

      /*
       * Devolve o foco a quem abriu o modal, senão ele cai no <body> e o Tab
       * seguinte recomeça do topo da página — na trilha de etapas isso
       * significa refazer a navegação inteira até a etapa em que se estava.
       */
      origemDoFoco.current?.focus({ focusVisible: true } as FocusOptions);
      origemDoFoco.current = null;
    };
    // `focoInicial` é uma ref estável e não deve remontar o efeito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div
      className="modal-fundo"
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      // Sem isto o leitor de tela anuncia só o título e o usuário decide sem
      // nunca ouvir o que a ação faz.
      aria-describedby={descritoPor}
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <div
        className={`modal vidro ${largura === 'padrao' ? '' : `modal--${largura}`}`}
        ref={caixa}
        tabIndex={-1}
      >
        {comBotaoFechar ? (
          <div className="modal__cabecalho">
            <h3 id={idTitulo}>{titulo}</h3>
            <button
              type="button"
              className="btn btn--icone"
              onClick={aoFechar}
              aria-label="Fechar"
            >
              <Icone nome="x" tamanho={18} />
            </button>
          </div>
        ) : (
          <h3 id={idTitulo}>{titulo}</h3>
        )}

        {children}
      </div>
    </div>
  );
}
