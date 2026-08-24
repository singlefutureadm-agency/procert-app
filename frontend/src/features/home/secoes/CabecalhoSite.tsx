import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { useTema } from '@/features/aparencia/useTema';
import { urlArquivo } from '@/lib/arquivos';
import { logoDoTema } from '@/lib/tema';
import { DOCUMENTOS, EMPRESA, NAVEGACAO } from '../conteudo';
import { useRolagem } from '../hooks';

/**
 * Cabeçalho fixo e transparente que ganha fundo escuro ao rolar — mesmo
 * comportamento do legado, que fazia isso adicionando a classe `.scrolled`
 * no <body> via `main.js`.
 */
export function CabecalhoSite() {
  const rolou = useRolagem(80);
  const { autenticado } = useAuth();
  const { aparencia } = useTema();
  const [menuAberto, setMenuAberto] = useState(false);
  const [linksAbertos, setLinksAbertos] = useState(false);

  // O cabeçalho também serve as páginas legais, onde as seções da home não
  // existem: ali `#sobre` não rola para lugar nenhum. Fora da raiz, a âncora
  // vira caminho absoluto e o navegador volta à home já posicionado.
  const naHome = useLocation().pathname === '/';
  const ancora = (hash: string) => (naHome ? hash : `/${hash}`);

  // Trava a rolagem do fundo enquanto o menu móvel está aberto.
  useEffect(() => {
    document.body.style.overflow = menuAberto ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuAberto]);

  const fechar = () => {
    setMenuAberto(false);
    setLinksAbertos(false);
  };

  return (
    <header className={`home__cabecalho ${rolou ? 'home__cabecalho--rolado' : ''}`}>
      <div className="home__container home__cabecalho-interno">
        <a href={ancora('#hero')} className="home__marca" onClick={fechar}>
          {/* Versão branca: o logo padrão é escuro e some sobre o hero.
              Sem o texto ao lado, a imagem passa a ser o nome acessível
              da marca — por isso `alt` preenchido em vez de decorativa.

              A logo enviada em /dashboard/aparencia substitui esta. Pede-se
              sempre a variante do tema ESCURO, e não a do modo em que o
              usuário está: aqui o cabeçalho é transparente sobre um hero que
              é escuro nos dois modos, então quem manda no contraste é o fundo
              da seção, não o tema do painel. */}
          <img
            src={urlArquivo(logoDoTema(aparencia, 'ESCURO'), '/img/logo-branco.png')}
            alt={EMPRESA.nome}
          />

        </a>

        <nav
          id="home-navegacao"
          className={`home__nav ${menuAberto ? 'home__nav--aberta' : ''}`}
          aria-label="Navegação principal"
        >
          <ul>
            {NAVEGACAO.map((item) => (
              <li key={item.ancora}>
                <a href={ancora(item.ancora)} onClick={fechar}>
                  {item.rotulo}
                </a>
              </li>
            ))}

            <li>
              <button
                type="button"
                aria-expanded={linksAbertos}
                onClick={() => setLinksAbertos((aberto) => !aberto)}
              >
                <span>Links Úteis</span>
                <i className="bi bi-chevron-down" aria-hidden />
              </button>
              <ul
                className={`home__nav-suspenso ${
                  linksAbertos ? 'home__nav-suspenso--aberto' : ''
                }`}
              >
                {DOCUMENTOS.map((documento) => (
                  <li key={documento.arquivo}>
                    <a
                      href={documento.arquivo}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={fechar}
                    >
                      {documento.rotulo}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          </ul>
        </nav>

        {/* Quem já tem sessão vai direto ao painel; os demais, ao login. */}
        <Link
          className="home__botao-entrar"
          to={autenticado ? '/dashboard' : '/login'}
          onClick={fechar}
        >
          {autenticado ? 'Painel' : 'Login'}
        </Link>

        <button
          type="button"
          className={`home__menu-movel ${menuAberto ? 'home__menu-movel--aberto' : ''}`}
          aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuAberto}
          aria-controls="home-navegacao"
          onClick={() => setMenuAberto((aberto) => !aberto)}
        >
          <i className={`bi ${menuAberto ? 'bi-x-lg' : 'bi-list'}`} aria-hidden />
        </button>
      </div>

      {/* Cortina: escurece a página e fecha o menu ao toque fora dele. */}
      {menuAberto && (
        <div className="home__cortina" onClick={fechar} aria-hidden />
      )}
    </header>
  );
}
