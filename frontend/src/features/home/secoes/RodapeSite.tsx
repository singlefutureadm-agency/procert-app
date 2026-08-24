import { Link } from 'react-router-dom';

import { EMPRESA, REDES_SOCIAIS } from '../conteudo';
import { PAGINAS_LEGAIS } from '../conteudo-legal';
import { PAGINAS } from '../conteudo-paginas';

export function RodapeSite() {
  return (
    <footer className="home__rodape">
      <div className="home__rodape-topo">
        <div className="home__container home__rodape-grade">
          <div>
            <Link to="/" className="home__rodape-marca">
              <img src="/img/logo-branco.png" alt="" aria-hidden />
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

            <div className="home__redes">
              {REDES_SOCIAIS.map((rede) => (
                <a
                  key={rede.icone}
                  /* O legado deixava href vazio, que recarrega a página.
                     Sem perfil definido, o link fica desabilitado. */
                  href={rede.url || undefined}
                  aria-label={rede.rotulo}
                  aria-disabled={!rede.url}
                  target={rede.url ? '_blank' : undefined}
                  rel={rede.url ? 'noopener noreferrer' : undefined}
                >
                  <i className={`bi ${rede.icone}`} aria-hidden />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4>Veja mais</h4>
            <ul>
              {PAGINAS.map((pagina) => (
                <li key={pagina.caminho}>
                  <i className="bi bi-chevron-right" aria-hidden />
                  <Link to={pagina.caminho}>{pagina.rotulo}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Acesso</h4>
            <ul>
              <li>
                <i className="bi bi-chevron-right" aria-hidden />
                <Link to="/login">Área do cliente</Link>
              </li>
              <li>
                <i className="bi bi-chevron-right" aria-hidden />
                <a href="/documentos/manual-da-qualidade.pdf" target="_blank" rel="noopener noreferrer">
                  Manual da qualidade
                </a>
              </li>
              <li>
                <i className="bi bi-chevron-right" aria-hidden />
                <a
                  href="/documentos/politica-e-objetivos.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Política e objetivos
                </a>
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
