import { useEffect } from 'react';

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
  useEffect(() => {
    if (!aberto) return;

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoCancelar();
    };

    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aberto, aoCancelar]);

  if (!aberto) return null;

  return (
    <div
      className="modal-fundo"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) aoCancelar();
      }}
    >
      <div className="modal vidro">
        <h3 id="titulo-modal">{titulo}</h3>
        <p className="texto-suave">{mensagem}</p>

        <div className="form-acoes">
          <button type="button" className="btn" onClick={aoCancelar} disabled={carregando}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn ${perigo ? 'btn--perigo' : 'btn--primario'}`}
            onClick={aoConfirmar}
            disabled={carregando}
            autoFocus
          >
            {carregando ? 'Aguarde...' : rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
