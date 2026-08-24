import { Link } from 'react-router-dom';

import { grafo, migalhas, organizacao, URL_SITE } from '@/lib/seo';
import { SERVICOS_PAGINA } from './conteudo-paginas';
import { HeroPagina, LayoutSite } from './LayoutSite';
import { Revelar } from './Revelar';
import { PerguntasFrequentes, perguntasEmJsonLd } from './secoes/PerguntasFrequentes';

const { hero, seo, introducao, detalhados, processo, faq } = SERVICOS_PAGINA;

export function ServicosPage() {
  return (
    <LayoutSite
      seo={{
        ...seo,
        caminho: '/servicos',
        dadosEstruturados: grafo(
          organizacao(),
          migalhas([
            { nome: 'Início', caminho: '/' },
            { nome: 'Serviços', caminho: '/servicos' },
          ]),
          perguntasEmJsonLd(faq),
          {
            '@type': 'Service',
            name: 'Certificação de produtos e equipamentos de proteção individual',
            serviceType: 'Avaliação da conformidade de produto',
            provider: { '@id': `${URL_SITE}/#organizacao` },
            areaServed: { '@type': 'Country', name: 'Brasil' },
          },
        ),
      }}
    >
      <HeroPagina {...hero} />

      <section className="home__secao">
        <Revelar className="home__container">
          <div className="home__prosa">
            <h2>{introducao.titulo}</h2>
            {introducao.paragrafos.map((paragrafo) => (
              <p key={paragrafo}>{paragrafo}</p>
            ))}
          </div>
        </Revelar>
      </section>

      {/* Zig-zag alternado em vez de uma grade de cartões iguais: cada serviço
          tem texto longo o bastante para merecer largura, e a grade de três
          colunas obrigaria a cortar o texto até virar slogan. */}
      <section className="home__secao home__secao--suave" aria-labelledby="servicos-detalhe">
        <div className="home__container">
          <h2 id="servicos-detalhe" className="home__titulo-bloco">
            Nossos serviços em detalhe
          </h2>

          <div className="home__servicos-lista">
            {detalhados.map((servico, indice) => (
              <Revelar
                key={servico.titulo}
                className={`home__servico-detalhe ${
                  indice % 2 === 1 ? 'home__servico-detalhe--invertido' : ''
                }`}
              >
                <article>
                  <div className="home__servico-marca" aria-hidden>
                    <i className={`bi ${servico.icone}`} />
                  </div>
                  <div className="home__servico-corpo">
                    <h3>{servico.titulo}</h3>
                    <p>{servico.texto}</p>
                    <ul>
                      {servico.pontos.map((ponto) => (
                        <li key={ponto}>
                          <i className="bi bi-check2" aria-hidden />
                          <span>{ponto}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              </Revelar>
            ))}
          </div>
        </div>
      </section>

      <section className="home__secao" aria-labelledby="processo">
        <div className="home__container">
          <Revelar className="home__prosa">
            <h2 id="processo">{processo.titulo}</h2>
            <p>{processo.texto}</p>
          </Revelar>

          {/* <ol> e não <ul>: a ordem das etapas é a informação. */}
          <ol className="home__etapas">
            {processo.etapas.map((etapa) => (
              <Revelar key={etapa.numero} como="li" className="home__etapa">
                <span className="home__etapa-numero" aria-hidden>
                  {etapa.numero}
                </span>
                <div>
                  <h3>{etapa.titulo}</h3>
                  <p>{etapa.texto}</p>
                </div>
              </Revelar>
            ))}
          </ol>
        </div>
      </section>

      <PerguntasFrequentes
        titulo="Perguntas frequentes sobre certificação"
        itens={faq}
      />

      <section className="home__secao home__cta-faixa">
        <Revelar className="home__container">
          <h2>Precisa certificar um produto?</h2>
          <p>
            Conte o que você precisa avaliar e retornamos com o escopo provável e os
            próximos passos.
          </p>
          <Link to="/contato" className="home__botao-primario">
            Falar com a equipe técnica
          </Link>
        </Revelar>
      </section>
    </LayoutSite>
  );
}
