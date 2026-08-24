import { Link } from 'react-router-dom';

import { grafo, migalhas, organizacao } from '@/lib/seo';
import { SOBRE } from './conteudo';
import { SOBRE_PAGINA } from './conteudo-paginas';
import { HeroPagina, LayoutSite } from './LayoutSite';
import { Revelar } from './Revelar';
import { Numeros } from './secoes/Numeros';

const { hero, seo, quemSomos, principios, comoTrabalhamos } = SOBRE_PAGINA;

export function SobrePage() {
  return (
    <LayoutSite
      seo={{
        ...seo,
        caminho: '/sobre',
        dadosEstruturados: grafo(
          organizacao(),
          migalhas([
            { nome: 'Início', caminho: '/' },
            { nome: 'Sobre', caminho: '/sobre' },
          ]),
        ),
      }}
    >
      <HeroPagina {...hero} />

      <section className="home__secao">
        <div className="home__container">
          <div className="home__grade home__grade--2 home__sobre-topo">
            <Revelar className="home__prosa">
              <h2>{quemSomos.titulo}</h2>
              {quemSomos.paragrafos.map((paragrafo) => (
                <p key={paragrafo}>{paragrafo}</p>
              ))}
            </Revelar>

            <Revelar atraso={80}>
              <img
                src={SOBRE.imagem.src}
                alt={SOBRE.imagem.alt}
                className="home__sobre-imagem"
                loading="lazy"
              />
            </Revelar>
          </div>
        </div>
      </section>

      <section className="home__secao home__secao--suave" aria-labelledby="principios">
        <div className="home__container">
          <Revelar>
            <h2 id="principios" className="home__titulo-bloco">
              O que sustenta nossas decisões
            </h2>
          </Revelar>

          <div className="home__principios">
            {principios.map((principio, indice) => (
              <Revelar
                key={principio.titulo}
                como="article"
                className="home__principio"
                atraso={indice * 70}
              >
                <i className={`bi ${principio.icone}`} aria-hidden />
                <h3>{principio.titulo}</h3>
                <p>{principio.texto}</p>
              </Revelar>
            ))}
          </div>
        </div>
      </section>

      <section className="home__secao">
        <Revelar className="home__container">
          <div className="home__prosa">
            <h2>{comoTrabalhamos.titulo}</h2>
            {comoTrabalhamos.paragrafos.map((paragrafo) => (
              <p key={paragrafo}>{paragrafo}</p>
            ))}
          </div>
        </Revelar>
      </section>

      {/* Reaproveita a seção da home: os números são os mesmos e mantê-los em
          dois lugares faria um divergir do outro na primeira atualização. */}
      <Numeros />

      <section className="home__secao home__cta-faixa">
        <Revelar className="home__container">
          <h2>Vamos avaliar seu produto?</h2>
          <p>
            Conheça as etapas do processo ou fale direto com a equipe técnica sobre o
            que você precisa certificar.
          </p>
          <div className="home__cta-botoes">
            <Link to="/servicos" className="home__botao-primario">
              Ver os serviços
            </Link>
            <Link to="/contato" className="home__botao-secundario">
              Entrar em contato
            </Link>
          </div>
        </Revelar>
      </section>
    </LayoutSite>
  );
}
