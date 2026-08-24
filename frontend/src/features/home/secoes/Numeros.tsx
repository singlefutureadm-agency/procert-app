import { NUMEROS } from '../conteudo';
import { useContador } from '../hooks';
import { Revelar } from '../Revelar';

function Numero({
  icone,
  valor,
  titulo,
  complemento,
}: {
  icone: string;
  valor: number;
  titulo: string;
  complemento: string;
}) {
  const { referencia, valor: atual } = useContador(valor);

  return (
    <div className="home__numero" ref={referencia}>
      <i className={`bi ${icone}`} aria-hidden />
      <div>
        {/* aria-label garante o número final para leitores de tela,
            sem depender do fim da animação. */}
        <span className="home__numero-valor" aria-label={String(valor)}>
          {atual}
        </span>
        <p>
          <strong>{titulo}</strong>
          <span>{complemento}</span>
        </p>
      </div>
    </div>
  );
}

export function Numeros() {
  return (
    <section id="numeros" className="home__secao home__numeros">
      <Revelar className="home__container">
        <div className="home__grade home__grade--2">
          <img
            src={NUMEROS.imagem.src}
            alt={NUMEROS.imagem.alt}
            className="home__numeros-imagem"
            loading="lazy"
          />

          <div>
            <h2>{NUMEROS.titulo}</h2>
            <p>{NUMEROS.texto}</p>

            <div className="home__grade home__grade--2 home__numeros-lista">
              {NUMEROS.itens.map((item) => (
                <Numero key={item.titulo} {...item} />
              ))}
            </div>
          </div>
        </div>
      </Revelar>
    </section>
  );
}
