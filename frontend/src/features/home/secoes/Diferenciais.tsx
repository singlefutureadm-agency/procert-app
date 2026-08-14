import { DIFERENCIAIS } from '../conteudo';
import { Revelar } from '../Revelar';

export function Diferenciais() {
  return (
    <section id="diferenciais" className="home__secao home__secao--suave">
      <div className="home__container">
        <div className="home__grade home__grade--2">
          <Revelar className="home__diferenciais-imagem">
            <img
              src={DIFERENCIAIS.imagem.src}
              alt={DIFERENCIAIS.imagem.alt}
              loading="lazy"
            />
          </Revelar>

          <div>
            {DIFERENCIAIS.itens.map((item, indice) => (
              <Revelar
                key={item.titulo}
                className="home__diferencial"
                atraso={100 * (indice + 1)}
              >
                <i className={`bi ${item.icone}`} aria-hidden />
                <div>
                  <h4>{item.titulo}</h4>
                  <p>{item.texto}</p>
                </div>
              </Revelar>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
