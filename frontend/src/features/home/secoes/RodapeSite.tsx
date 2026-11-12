import { Link } from 'react-router-dom';

import { EMPRESA, NAVEGACAO, REDES_SOCIAIS } from '../conteudo';
import { PAGINAS_LEGAIS } from '../conteudo-legal';
import { LinkDocumento } from '../LinkDocumento';

const redes = REDES_SOCIAIS.filter((rede) => rede.url);

export function RodapeSite() {
  return (
    <footer className="home__rodape">
      <div className="home__rodape-topo">
        <div className="home__container home__rodape-grade">
          <div>
            <Link to="/" className="home__rodape-marca" aria-label="ProCert — página inicial">
              <img src="/img/logo-branco.webp" alt="" aria-hidden width={488} height={174} />
            </Link>

            <div style={{ paddingTop: 12 }}>
              {EMPRESA.enderecoCurto.map((linha) => (
                <p key={linha}>{linha}</p>
              ))}
              <p style={{ marginTop: 12 }}>
                <strong>Telefone:</strong> <span>{EMPRESA.telefoneRodape}</span>
              </p>
              <p>
                <strong>E-mail:</strong>{' '}
                <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a>
              </p>
            </div>

            {/* Só rede com perfil definido aparece. Um ícone sem destino era um
                <a> sem href — não focável, não clicável, e o leitor de tela o
                anunciava como link mesmo assim. Preencha `url` em conteudo.ts. */}
            {redes.length > 0 && (
              <div className="home__redes">
                {redes.map((rede) => (
                  <a
                    key={rede.icone}
                    href={rede.url}
                    aria-label={rede.rotulo}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <i className={`bi ${rede.icone}`} aria-hidden />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2>Veja mais</h2>
            <ul>
              {/* Seções da home — ver o comentário do menu em CabecalhoSite. */}
              {NAVEGACAO.map((item) => (
                <li key={item.ancora}>
                  <i className="bi bi-chevron-right" aria-hidden />
                  <a href={`/${item.ancora}`}>{item.rotulo}</a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2>Acesso</h2>
            <ul>
              <li>
                <i className="bi bi-chevron-right" aria-hidden />
                <Link to="/login">Área do cliente</Link>
              </li>
              <li>
                <i className="bi bi-chevron-right" aria-hidden />
                <LinkDocumento arquivo="/documentos/manual-da-qualidade.pdf" titulo="Manual da Qualidade">
                  Manual da qualidade
                </LinkDocumento>
              </li>
              <li>
                <i className="bi bi-chevron-right" aria-hidden />
                <LinkDocumento
                  arquivo="/documentos/politica-e-objetivos.pdf"
                  titulo="Política e Objetivos"
                >
                  Política e objetivos
                </LinkDocumento>
              </li>

              {/* Rotas internas: <Link> em vez de <a href>, senão cada clique
                  descarrega e rebaixa o bundle inteiro. */}
              {PAGINAS_LEGAIS.map((pagina) => (
                <li key={pagina.caminho}>
                  <i className="bi bi-chevron-right" aria-hidden />
                  <Link to={pagina.caminho}>{pagina.rotulo}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="home__copyright">
        <div className="home__container">
          <p>
            © <span>Copyright</span> <strong>{EMPRESA.nome}</strong>{' '}
            <span>Todos os Direitos Reservados</span>
          </p>
          <div className="home__creditos">
            Desenvolvido por{' '}
            <a href={EMPRESA.desenvolvedor.url} target="_blank" rel="noopener noreferrer">
              {EMPRESA.desenvolvedor.nome}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
