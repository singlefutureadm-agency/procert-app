import { grafo, migalhas, organizacao } from '@/lib/seo';
import { CONTATO_PAGINA } from './conteudo-paginas';
import { EMPRESA } from './conteudo';
import { HeroPagina, LayoutSite } from './LayoutSite';
import { Revelar } from './Revelar';
import { Contato } from './secoes/Contato';
import { PerguntasFrequentes, perguntasEmJsonLd } from './secoes/PerguntasFrequentes';

const { hero, seo, introducao, faq } = CONTATO_PAGINA;

/** Canais diretos. Separados do formulário porque parte de quem chega já sabe
 *  o que quer e só precisa do número — obrigar essa pessoa a preencher cinco
 *  campos é perder o contato. */
const CANAIS = [
  {
    icone: 'bi-telephone',
    titulo: 'Telefone',
    valor: EMPRESA.telefoneContato,
    href: `tel:+55${EMPRESA.telefoneContato.replace(/\D/g, '')}`,
  },
  {
    icone: 'bi-whatsapp',
    titulo: 'WhatsApp',
    valor: EMPRESA.telefoneRodape,
    href: `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(
      EMPRESA.whatsappMensagem,
    )}`,
  },
  {
    icone: 'bi-envelope',
    titulo: 'E-mail',
    valor: EMPRESA.email,
    href: `mailto:${EMPRESA.email}`,
  },
];

export function ContatoPage() {
  return (
    <LayoutSite
      seo={{
        ...seo,
        caminho: '/contato',
        dadosEstruturados: grafo(
          organizacao(),
          migalhas([
            { nome: 'Início', caminho: '/' },
            { nome: 'Contato', caminho: '/contato' },
          ]),
          perguntasEmJsonLd(faq),
        ),
      }}
    >
      <HeroPagina {...hero} />

      <section className="home__secao">
        <div className="home__container">
          <div className="home__canais">
            {CANAIS.map((canal, indice) => (
              <Revelar key={canal.titulo} className="home__canal" atraso={indice * 70}>
                <a
                  href={canal.href}
                  target={canal.icone === 'bi-whatsapp' ? '_blank' : undefined}
                  rel={canal.icone === 'bi-whatsapp' ? 'noopener noreferrer' : undefined}
                >
                  <i className={`bi ${canal.icone}`} aria-hidden />
                  <span className="home__canal-titulo">{canal.titulo}</span>
                  <span className="home__canal-valor">{canal.valor}</span>
                </a>
              </Revelar>
            ))}
          </div>

          <Revelar className="home__prosa home__contato-nota">
            <h2>{introducao.titulo}</h2>
            {introducao.paragrafos.map((paragrafo) => (
              <p key={paragrafo}>{paragrafo}</p>
            ))}
          </Revelar>
        </div>
      </section>

      {/* Reaproveita o formulário da home: é o mesmo POST /api/contato, com a
          mesma validação espelhando o DTO do servidor. Uma segunda cópia
          divergiria do backend na primeira mudança de campo. */}
      <Contato />

      <PerguntasFrequentes titulo="Dúvidas comuns" itens={faq} />
    </LayoutSite>
  );
}
