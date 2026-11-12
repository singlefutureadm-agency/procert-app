import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Icone } from '@/components/Icone';
import { Modal } from '@/components/Modal';

interface Props {
  /** URL do PDF, servida pela mesma origem (`/documentos/...`). */
  arquivo: string;
  /** Nome do documento: título do modal e nome acessível do visualizador. */
  titulo: string;
  /** Chamado em todo clique — o menu usa para se fechar. */
  onClick?: () => void;
  children: ReactNode;
}

/**
 * O visualizador embutido só vale onde o navegador desenha PDF num iframe.
 * Chrome no Android e o Safari do iPhone não desenham (ou mostram só a primeira
 * página), e numa tela estreita o modal sobraria em volta de um documento
 * ilegível — ali o link segue o comportamento nativo e abre o PDF no leitor
 * do aparelho, que é melhor que qualquer moldura nossa.
 */
function cabeVisualizador(): boolean {
  return (
    navigator.pdfViewerEnabled !== false &&
    !window.matchMedia('(max-width: 719px)').matches
  );
}

/**
 * Link para um PDF dos Links Úteis que abre o documento num modal, com
 * "Baixar" e "Abrir em nova aba" à mão.
 *
 * Continua sendo um `<a href target="_blank">` de verdade: Ctrl/⌘+clique,
 * botão do meio e "copiar endereço" funcionam como antes, o crawler segue o
 * link, e sem JavaScript o PDF abre em outra aba. O modal só intercepta o
 * clique simples.
 */
export function LinkDocumento({ arquivo, titulo, onClick, children }: Props) {
  const [aberto, setAberto] = useState(false);

  // Trava a página atrás: a roda do mouse fora do iframe rolaria a home.
  useEffect(() => {
    if (!aberto) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [aberto]);

  const aoClicar = (evento: MouseEvent<HTMLAnchorElement>) => {
    onClick?.();
    const modificado =
      evento.button !== 0 || evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey;
    if (modificado || !cabeVisualizador()) return;
    evento.preventDefault();
    setAberto(true);
  };

  return (
    <>
      <a href={arquivo} target="_blank" rel="noopener noreferrer" onClick={aoClicar}>
        {children}
      </a>

      {/* Portal: o menu do cabeçalho tem `backdrop-filter`, que vira bloco de
          contenção para `position: fixed` — dentro dele a cortina do modal
          ficaria do tamanho do menu, não da janela. */}
      {aberto &&
        createPortal(
          <Modal
            aberto
            titulo={titulo}
            largura="documento"
            comBotaoFechar
            aoFechar={() => setAberto(false)}
          >
            <div className="visualizador-pdf">
              {/* Fica atrás do iframe: some sozinho quando o leitor do
                  navegador pinta a primeira página, sem depender de `onLoad`
                  (que nem todo leitor de PDF dispara). */}
              <p className="visualizador-pdf__carregando" aria-hidden>
                Carregando documento…
              </p>
              {/* `navpanes=0` fecha as miniaturas do Chrome: num modal elas
                  tomam um quarto da largura que é da página. */}
              <iframe src={`${arquivo}#navpanes=0&view=FitH`} title={titulo} />
            </div>

            <div className="visualizador-pdf__acoes">
              <a className="btn" href={arquivo} target="_blank" rel="noopener noreferrer">
                <Icone nome="link-externo" tamanho={16} />
                Abrir em nova aba
              </a>
              <a className="btn btn--primario" href={arquivo} download>
                <Icone nome="download" tamanho={16} />
                Baixar PDF
              </a>
            </div>
          </Modal>,
          document.body,
        )}
    </>
  );
}
