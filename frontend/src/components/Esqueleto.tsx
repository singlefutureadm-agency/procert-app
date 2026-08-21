/**
 * Esqueleto de carregamento.
 *
 * Serve às telas cuja forma já é conhecida antes de a resposta chegar: listagem
 * sempre vira tabela, dashboard sempre vira cartões. Nessas, o `Carregando`
 * central ocupa cerca de 110px e some dando lugar a 400px de conteúdo — o pulo
 * de layout é certo, e a barra de paginação salta junto.
 *
 * Onde a forma depende do dado (detalhe de produto, formulário de etapa),
 * `Carregando` continua sendo o certo: um esqueleto que erra a forma informa
 * menos que um spinner honesto.
 *
 * As barras são `aria-hidden`: quem usa leitor de tela não ganha nada ouvindo
 * "seis retângulos". O anúncio sai do `role="status"` com o texto fora da tela.
 */

interface PropsTabela {
  /** Quantas linhas fingir. O padrão bate com o `limite` da primeira página. */
  linhas?: number;
  mensagem?: string;
}

export function EsqueletoTabela({
  linhas = 6,
  mensagem = 'Carregando registros...',
}: PropsTabela) {
  return (
    <div className="esqueleto-grupo" role="status" aria-live="polite">
      <span className="apenas-leitor-tela">{mensagem}</span>
      {Array.from({ length: linhas }, (_, indice) => (
        <div
          key={indice}
          className="esqueleto esqueleto__linha-tabela"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

interface PropsCards {
  quantidade?: number;
  mensagem?: string;
}

export function EsqueletoCards({
  quantidade = 4,
  mensagem = 'Carregando indicadores...',
}: PropsCards) {
  return (
    <div className="grade-cards" role="status" aria-live="polite">
      <span className="apenas-leitor-tela">{mensagem}</span>
      {Array.from({ length: quantidade }, (_, indice) => (
        <div
          key={indice}
          className="esqueleto esqueleto__cartao"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
