interface Props {
  pagina: number;
  totalPaginas: number;
  total: number;
  aoMudar: (pagina: number) => void;
}

export function Paginacao({ pagina, totalPaginas, total, aoMudar }: Props) {
  if (totalPaginas <= 1) {
    return (
      <div className="paginacao">
        <span className="texto-pequeno texto-fraco">
          {total} registro{total === 1 ? '' : 's'}
        </span>
      </div>
    );
  }

  return (
    <div className="paginacao">
      <span className="texto-pequeno texto-fraco">
        {total} registros · página {pagina} de {totalPaginas}
      </span>

      <div className="linha-flex">
        <button
          type="button"
          className="btn btn--pequeno"
          onClick={() => aoMudar(pagina - 1)}
          disabled={pagina <= 1}
        >
          ← Anterior
        </button>
        <button
          type="button"
          className="btn btn--pequeno"
          onClick={() => aoMudar(pagina + 1)}
          disabled={pagina >= totalPaginas}
        >
          Próxima →
        </button>
      </div>
    </div>
  );
}
