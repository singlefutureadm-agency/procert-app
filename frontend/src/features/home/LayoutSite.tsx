import { useEffect, type ReactNode } from 'react';

import 'bootstrap-icons/font/bootstrap-icons.css';
import './home.css';

import { useSeo, type DadosSeo } from '@/lib/seo';
import { useTemaInstitucional } from './hooks';
import { BotoesFlutuantes } from './secoes/BotoesFlutuantes';
import { CabecalhoSite } from './secoes/CabecalhoSite';
import { RodapeSite } from './secoes/RodapeSite';

/**
 * Moldura comum das páginas do site institucional: cabeçalho, rodapé, paleta
 * clara e metadados da rota.
 *
 * Existe desde que a home deixou de ser a única página pública. Sem ela, cada
 * página nova repetiria a mesma composição de cinco elementos, e o dia em que
 * um deles mudasse o conserto teria de ser lembrado em cada arquivo.
 */
export function LayoutSite({ seo, children }: { seo: DadosSeo; children: ReactNode }) {
  useTemaInstitucional();
  useSeo(seo);

  // Rota nova começa onde a anterior parava. Quem clica num link do rodapé —
  // que fica no fim da página — abriria a página seguinte já rolada até o fim.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [seo.caminho]);

  return (
    <div className="home">
      <CabecalhoSite />
      <main id="conteudo">{children}</main>
      <RodapeSite />
      <BotoesFlutuantes />
    </div>
  );
}

/**
 * Faixa escura no topo da página interna.
 *
 * Não é decoração: `.home__cabecalho` é fixo e transparente até a rolagem,
 * contando com o hero escuro da home atrás dele. Numa página de fundo claro, o
 * menu branco sumiria até o usuário rolar.
 *
 * O `rotulo` é um `<p>`, e não um segundo heading: o H1 da página é o título, e
 * uma sobrelinha marcada como heading criaria um nível acima dele.
 */
export function HeroPagina({
  rotulo,
  titulo,
  subtitulo,
}: {
  rotulo: string;
  titulo: string;
  subtitulo?: string;
}) {
  return (
    <section className="home__hero-pagina">
      <div className="home__container">
        <p className="home__hero-pagina-rotulo">{rotulo}</p>
        <h1>{titulo}</h1>
        {subtitulo && <p className="home__hero-pagina-subtitulo">{subtitulo}</p>}
      </div>
    </section>
  );
}
