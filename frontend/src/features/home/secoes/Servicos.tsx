import { SERVICOS } from '../conteudo';
import { Revelar } from '../Revelar';

export function Servicos() {
  return (
    <section id="servicos" className="home__secao">
      <Revelar className="home__container home__titulo-secao">
        <h2>{SERVICOS.rotulo}</h2>
        <p>{SERVICOS.titulo}</p>
      </Revelar>

      <div className="home__container">
        <div className="home__grade home__grade--3">
          {SERVICOS.itens.map((servico, indice) => (
            <Revelar
              key={servico.titulo}
              className="home__servico"
              atraso={100 * (indice + 1)}
            >
              <div className="home__servico-icone">
                <i className={`bi ${servico.icone}`} aria-hidden />
              </div>
              <h3>{servico.titulo}</h3>
              <p>{servico.texto}</p>
            </Revelar>
          ))}
        </div>
      </div>
    </section>
  );
}
