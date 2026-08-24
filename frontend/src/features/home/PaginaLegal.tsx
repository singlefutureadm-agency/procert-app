import { Fragment, useEffect, type ReactNode } from 'react';

import 'bootstrap-icons/font/bootstrap-icons.css';
import './home.css';

import type { DocumentoLegal } from './conteudo-legal';
import { useTemaInstitucional } from './hooks';
import { BotoesFlutuantes } from './secoes/BotoesFlutuantes';
import { CabecalhoSite } from './secoes/CabecalhoSite';
import { RodapeSite } from './secoes/RodapeSite';

/**
 * Molde dos documentos legais (termos de uso, política de privacidade).
 *
 * Reaproveita o cabeçalho, o rodapé e a paleta da home — é o mesmo site, e uma
 * página legal com identidade própria passaria a impressão de ter vindo de
 * outro lugar, que é exatamente o oposto do que um documento desses precisa
 * transmitir.
 *
 * A faixa escura do topo não é decoração: `.home__cabecalho` é fixo e
 * transparente até a página rolar, contando com o hero escuro atrás dele. Sem
 * uma faixa própria, o menu branco cairia sobre o papel branco do documento e
 * sumiria até a primeira rolagem.
 */

/** Divide o texto em `**negrito**` e devolve os trechos já em JSX. */
function comDestaques(texto: string): ReactNode {
  // O split com grupo de captura mantém os trechos marcados no array; os de
  // índice ímpar são os que estavam entre asteriscos.
  return texto
    .split(/\*\*(.+?)\*\*/g)
    .map((trecho, indice) =>
      indice % 2 === 1 ? (
        <strong key={indice}>{trecho}</strong>
      ) : (
        <Fragment key={indice}>{trecho}</Fragment>
      ),
    );
}

export function PaginaLegal({ documento }: { documento: DocumentoLegal }) {
  useTemaInstitucional();

  // O <title> muda por documento: é o que aparece no histórico e no favorito,
  // e "ProCert" repetido em toda aba não ajuda quem guarda o termo para depois.
  useEffect(() => {
    const anterior = document.title;
    document.title = `${documento.titulo} · ProCert`;
    return () => {
      document.title = anterior;
    };
  }, [documento.titulo]);

  // Rota nova começa onde a anterior parava; sem isto, quem clica no rodapé
  // (que fica no fim da página) abre o documento já rolado até o fim.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [documento.titulo]);

  return (
    <div className="home">
      <CabecalhoSite />

      <main>
        <section className="home__legal-topo">
          <div className="home__container">
            <h1>{documento.titulo}</h1>
            <p className="home__legal-subtitulo">{documento.subtitulo}</p>
            <p className="home__legal-data">
              Última atualização: <strong>{documento.atualizadoEm}</strong>
            </p>
          </div>
        </section>

        <section className="home__secao">
          <div className="home__container">
            <article className="home__legal">
              {documento.abertura.map((paragrafo) => (
                <p key={paragrafo} className="home__legal-abertura">
                  {comDestaques(paragrafo)}
                </p>
              ))}

              {documento.secoes.map((secao) => (
                <section key={secao.titulo} className="home__legal-secao">
                  <h2>{secao.titulo}</h2>

                  {secao.paragrafos?.map((paragrafo) => (
                    <p key={paragrafo}>{comDestaques(paragrafo)}</p>
                  ))}

                  {secao.itens && (
                    <ul>
                      {secao.itens.map((item) => (
                        <li key={item}>
                          <i className="bi bi-check2-all" aria-hidden />
                          <span>{comDestaques(item)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}

              {documento.fecho && (
                <p className="home__legal-fecho">{comDestaques(documento.fecho)}</p>
              )}
            </article>
          </div>
        </section>
      </main>

      <RodapeSite />
      <BotoesFlutuantes />
    </div>
  );
}
