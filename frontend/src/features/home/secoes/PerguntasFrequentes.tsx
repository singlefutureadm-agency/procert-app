import type { PerguntaFrequente } from '../conteudo-paginas';
import { Revelar } from '../Revelar';

/**
 * Bloco de perguntas frequentes.
 *
 * **As respostas ficam abertas, sem acordeão.** Dois motivos, e nenhum é
 * estético: conteúdo escondido atrás de interação é o principal candidato a ser
 * descontado por buscador, e o acordeão acrescenta estado, foco e `aria-expanded`
 * para resolver um problema — comprimento — que a tipografia já resolve. Se a
 * lista crescer a ponto de a página ficar difícil de varrer, a saída é dividir
 * por tema, não esconder.
 *
 * `<dl>` é a marcação certa aqui: cada pergunta é um termo e cada resposta, sua
 * definição. Um par de `<h3>` + `<p>` diria a mesma coisa visualmente sem dizer
 * ao leitor de tela que os dois estão ligados.
 */
export function PerguntasFrequentes({
  titulo,
  itens,
}: {
  titulo: string;
  itens: PerguntaFrequente[];
}) {
  const id = 'perguntas-frequentes';

  return (
    <section className="home__secao home__secao--suave" aria-labelledby={id}>
      <div className="home__container">
        <Revelar>
          <h2 id={id} className="home__titulo-bloco">
            {titulo}
          </h2>
        </Revelar>

        <dl className="home__faq">
          {itens.map((item, indice) => (
            <Revelar key={item.pergunta} className="home__faq-item" atraso={indice * 60}>
              <dt>{item.pergunta}</dt>
              <dd>{item.resposta}</dd>
            </Revelar>
          ))}
        </dl>
      </div>
    </section>
  );
}

/**
 * Mesmas perguntas em JSON-LD.
 *
 * O `FAQPage` do schema.org é o que permite ao buscador exibir as perguntas
 * direto no resultado. A regra do Google é que a resposta marcada esteja
 * visível na página — motivo a mais para não esconder nada em acordeão.
 */
export function perguntasEmJsonLd(
  itens: PerguntaFrequente[],
): Record<string, unknown> {
  return {
    '@type': 'FAQPage',
    mainEntity: itens.map((item) => ({
      '@type': 'Question',
      name: item.pergunta,
      acceptedAnswer: { '@type': 'Answer', text: item.resposta },
    })),
  };
}
