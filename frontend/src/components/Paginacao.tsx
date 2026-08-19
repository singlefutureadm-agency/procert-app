import { Icone } from '@/components/Icone';

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
    <nav className="paginacao" aria-label="Paginação da listagem">
      {/*
       * `aria-live` porque a troca de página não recarrega nada: sem isso, quem
       * usa leitor de tela clica em "Próxima" e não recebe confirmação nenhuma
       * de que a listagem mudou.
       */}
      <span className="texto-pequeno texto-fraco" aria-live="polite">
        {total} registros · página {pagina} de {totalPaginas}
      </span>

      <div className="linha-flex">
        <button
          type="button"
          className="btn btn--pequeno"
          onClick={() => aoMudar(pagina - 1)}
          disabled={pagina <= 1}
        >
          <Icone nome="seta-esquerda" tamanho={16} />
          Anterior
        </button>
        <button
          type="button"
          className="btn btn--pequeno"
          onClick={() => aoMudar(pagina + 1)}
          disabled={pagina >= totalPaginas}
        >
          Próxima
          <Icone nome="seta-direita" tamanho={16} />
        </button>
      </div>
    </nav>
  );
}
