import { useRef } from 'react';

import { DEPOIMENTOS } from '../conteudo';
import { useCarrossel } from '../hooks';

/**
 * Carrossel de depoimentos. Substitui o Swiper do legado.
 *
 * **Semântica.** Um depoimento é `<figure>` + `<blockquote>` + `<figcaption>`,
 * não uma sequência de headings. Antes o nome da pessoa era `<h3>` e o cargo
 * `<h4>`: além de dizer ao leitor de tela que "Bruna Lopes" inicia uma seção do
 * documento, isso injetava um heading que muda a cada 5 segundos na estrutura
 * da página — e o buscador lê a hierarquia de headings para entender do que a
 * página trata.
 *
 * **A barra de progresso é animação CSS, não estado.** Ela reinicia porque a
 * `key` muda junto com o slide, e congela por `animation-play-state`. Guardar o
 * progresso em estado React custaria um re-render por quadro para desenhar algo
 * que o CSS anima sozinho na thread de composição.
 *
 * O fundo saiu de uma imagem PNG de 2,4 MB para gradiente: ela ficava sob um
 * overlay de 70%, ou seja, 2,4 MB — dois terços do peso de imagens do site —
 * para uma textura que quase não se via.
 */
export function Depoimentos() {
  const { atual, pausado, irPara, anterior, proximo, pausar, retomar, intervaloMs } =
    useCarrossel(DEPOIMENTOS.length);
  const regiao = useRef<HTMLDivElement>(null);

  function aoTeclar(evento: React.KeyboardEvent) {
    if (evento.key === 'ArrowLeft') {
      anterior();
      evento.preventDefault();
    } else if (evento.key === 'ArrowRight') {
      proximo();
      evento.preventDefault();
    }
  }

  return (
    <section
      id="depoimentos"
      className="home__depoimentos"
      aria-labelledby="depoimentos-titulo"
      onMouseEnter={pausar}
      onMouseLeave={retomar}
      onFocus={pausar}
      onBlur={retomar}
    >
      {/* A seção precisa de um título para não ficar órfã na hierarquia; ele é
          visualmente redundante com os próprios depoimentos, então fica só
          para leitor de tela e para o buscador. */}
      <h2 id="depoimentos-titulo" className="apenas-leitor-tela">
        O que dizem nossos clientes
      </h2>

      <div className="home__container">
        <div
          className="home__carrossel"
          role="group"
          aria-roledescription="carrossel"
          aria-label="Depoimentos de clientes"
          tabIndex={0}
          onKeyDown={aoTeclar}
          ref={regiao}
        >
          <i className="bi bi-quote home__carrossel-aspas" aria-hidden />

          {/* `aria-live` na moldura, e não no slide: o conteúdo precisa ser
              substituído dentro de um nó que já existia, senão a troca não é
              anunciada. */}
          <div className="home__carrossel-palco" aria-live="polite" aria-atomic="true">
            {DEPOIMENTOS.map((depoimento, indice) => (
              <figure
                key={depoimento.nome}
                className={`home__depoimento ${
                  indice === atual ? 'home__depoimento--ativo' : ''
                }`}
                aria-roledescription="slide"
                aria-label={`${indice + 1} de ${DEPOIMENTOS.length}`}
                // Slide fora de tela sai da ordem de leitura e de tabulação;
                // sem isto, o leitor de tela recita os cinco depoimentos.
                aria-hidden={indice !== atual}
                inert={indice !== atual}
              >
                <blockquote>
                  <p>{depoimento.texto}</p>
                </blockquote>

                <figcaption>
                  <img
                    src={depoimento.foto}
                    alt=""
                    aria-hidden
                    className="home__depoimento-foto"
                    loading="lazy"
                    width={88}
                    height={88}
                  />
                  <span className="home__depoimento-nome">{depoimento.nome}</span>
                  <span className="home__depoimento-cargo">{depoimento.cargo}</span>
                  <span className="home__depoimento-estrelas" aria-label="5 de 5 estrelas">
                    {Array.from({ length: 5 }, (_, i) => (
                      <i key={i} className="bi bi-star-fill" aria-hidden />
                    ))}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="home__carrossel-controles">
            <button
              type="button"
              className="home__carrossel-seta"
              aria-label="Depoimento anterior"
              onClick={anterior}
            >
              <i className="bi bi-chevron-left" aria-hidden />
            </button>

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

            <button
              type="button"
              className="home__carrossel-seta"
              aria-label="Próximo depoimento"
              onClick={proximo}
            >
              <i className="bi bi-chevron-right" aria-hidden />
            </button>
          </div>

          <div className="home__carrossel-progresso" aria-hidden>
            <span
              key={atual}
              style={{
                animationDuration: `${intervaloMs}ms`,
                animationPlayState: pausado ? 'paused' : 'running',
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
