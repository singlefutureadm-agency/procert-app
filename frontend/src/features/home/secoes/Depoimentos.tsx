import { DEPOIMENTOS } from '../conteudo';
import { useCarrossel } from '../hooks';

/**
 * Carrossel de depoimentos. Substitui o Swiper do legado: rotação a cada 5s,
 * marcadores clicáveis e pausa ao passar o mouse ou receber foco.
 */
export function Depoimentos() {
  const { atual, irPara, pausar, retomar } = useCarrossel(DEPOIMENTOS.length);
  const depoimento = DEPOIMENTOS[atual];

  return (
    <section
      id="depoimentos"
      className="home__depoimentos"
      onMouseEnter={pausar}
      onMouseLeave={retomar}
      onFocus={pausar}
      onBlur={retomar}
    >
      <img
        src="/img/depoimentos-bg.png"
        alt=""
        aria-hidden
        className="home__depoimentos-fundo"
        loading="lazy"
      />

      <div className="home__container">
        <div
          className="home__depoimento"
          /* Região viva: leitores de tela anunciam a troca de slide. */
          aria-live="polite"
          aria-atomic="true"
        >
          <img
            src={depoimento.foto}
            alt={depoimento.nome}
            className="home__depoimento-foto"
            loading="lazy"
          />
          <h3>{depoimento.nome}</h3>
          <h4>{depoimento.cargo}</h4>

          <div className="home__depoimento-estrelas" aria-label="5 de 5 estrelas">
            {Array.from({ length: 5 }, (_, indice) => (
              <i key={indice} className="bi bi-star-fill" aria-hidden />
            ))}
          </div>

          <p>
            <i className="bi bi-quote" aria-hidden />
            <span> {depoimento.texto} </span>
            <i className="bi bi-quote" aria-hidden />
          </p>
        </div>

        <div className="home__depoimento-marcadores">
          {DEPOIMENTOS.map((item, indice) => (
            <button
              key={item.nome}
              type="button"
              aria-current={indice === atual}
              aria-label={`Depoimento de ${item.nome}`}
              onClick={() => irPara(indice)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
