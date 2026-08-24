import { Fragment, type ReactNode } from 'react';

import { grafo, migalhas, organizacao } from '@/lib/seo';
import type { DocumentoLegal } from './conteudo-legal';
import { LayoutSite } from './LayoutSite';

/**
 * Molde dos documentos legais (termos de uso, política de privacidade).
 *
 * A moldura — cabeçalho, rodapé, paleta e metadados — vem de `LayoutSite`, a
 * mesma das páginas institucionais. Só o corpo do documento é próprio daqui.
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

export function PaginaLegal({
  documento,
  caminho,
}: {
  documento: DocumentoLegal;
  caminho: string;
}) {
  return (
    <LayoutSite
      seo={{
        titulo: `${documento.titulo} · ProCert`,
        descricao: `${documento.titulo} da ProCert Certificação de Produtos — ${documento.subtitulo}. Atualizado em ${documento.atualizadoEm}.`,
        caminho,
        dadosEstruturados: grafo(
          organizacao(),
          migalhas([
            { nome: 'Início', caminho: '/' },
            { nome: documento.titulo, caminho },
          ]),
        ),
      }}
    >
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
    </LayoutSite>
  );
}
