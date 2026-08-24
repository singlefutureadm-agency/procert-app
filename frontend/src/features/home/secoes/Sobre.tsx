import { SOBRE } from '../conteudo';
import { Revelar } from '../Revelar';

export function Sobre() {
  return (
    <section id="sobre" className="home__secao">
      <Revelar className="home__container">
        <div className="home__grade home__grade--2">
          {/* No legado a imagem vinha depois no HTML e era reposicionada com
              order-lg-2; aqui a ordem visual já é a ordem do documento. */}
          <div className="home__sobre-conteudo">
            <h2>{SOBRE.titulo}</h2>
            <p className="home__sobre-resumo">{SOBRE.resumo}</p>
            <ul>
              {SOBRE.itens.map((item) => (
                <li key={item}>
                  <i className="bi bi-check2-all" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p>{SOBRE.fechamento}</p>
          </div>

          <img
            src={SOBRE.imagem.src}
            alt={SOBRE.imagem.alt}
            className="home__sobre-imagem"
            loading="lazy"
          />
        </div>
      </Revelar>
    </section>
  );
}
