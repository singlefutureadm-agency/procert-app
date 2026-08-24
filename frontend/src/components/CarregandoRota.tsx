/**
 * Tela de espera enquanto o pedaço de código de uma rota é baixado.
 *
 * É o `fallback` do `Suspense` que envolve o roteador. Só aparece na primeira
 * visita a cada área do sistema: depois disso o pedaço fica no cache do
 * navegador e a troca de rota volta a ser instantânea.
 *
 * Ocupa a altura da viewport de propósito. Um spinner de 40px no topo de uma
 * página em branco empurraria o conteúdo para baixo assim que ele chegasse, e
 * o salto conta como layout shift — que é justamente uma das métricas que o
 * carregamento sob demanda existe para melhorar.
 */
export function CarregandoRota() {
  return (
    <div className="carregando-rota" role="status" aria-live="polite">
      <div className="carregando-rota__marca" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <span className="apenas-leitor-tela">Carregando a página…</span>
    </div>
  );
}
