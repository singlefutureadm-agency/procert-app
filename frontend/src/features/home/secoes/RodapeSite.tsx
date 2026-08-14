import { EMPRESA, NAVEGACAO, REDES_SOCIAIS } from '../conteudo';

export function RodapeSite() {
  return (
    <footer className="home__rodape">
      <div className="home__rodape-topo">
        <div className="home__container home__rodape-grade">
          <div>
            <a href="#hero" className="home__rodape-marca">
              <img src="/img/logo-branco.png" alt="" aria-hidden />
         
            </a>

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
              {NAVEGACAO.map((item) => (
                <li key={item.ancora}>
                  <i className="bi bi-chevron-right" aria-hidden />
                  <a href={item.ancora}>{item.rotulo}</a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Acesso</h4>
            <ul>
              <li>
                <i className="bi bi-chevron-right" aria-hidden />
                <a href="/login">Área do cliente</a>
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
