import { HERO } from '../conteudo';
import { Revelar } from '../Revelar';

export function Hero() {
  return (
    <section id="hero" className="home__hero">
      <img
        src="/img/hero-bg.jpg"
        alt=""
        aria-hidden
        className="home__hero-fundo"
        /* Primeira imagem visível: carrega com prioridade em vez de lazy. */
        fetchPriority="high"
      />

      <div className="home__container">
        <Revelar>
          <h1>
            {HERO.titulo}
            <span>.</span>
          </h1>
          <p className="home__hero-subtitulo">{HERO.subtitulo}</p>
        </Revelar>

        <Revelar className="home__grade home__grade--5 home__hero-destaques" atraso={150}>
          {HERO.destaques.map((destaque) => (
            <div key={destaque.titulo} className="home__hero-caixa">
              <i className={`bi ${destaque.icone}`} aria-hidden />
              <h3>{destaque.titulo}</h3>
            </div>
          ))}
        </Revelar>
      </div>
    </section>
  );
}
