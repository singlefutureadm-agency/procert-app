import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AjudaDaTela } from './AjudaDaTela';

/**
 * `AuthProvider` revalida a sessão em `GET /auth/me` ao montar. Montá-lo aqui
 * traria axios e um mock de rede para um teste que só precisa saber qual papel
 * o usuário tem — o papel é a única coisa que este componente pergunta.
 */
const temPapel = vi.fn(() => false);
vi.mock('@/auth/useAuth', () => ({
  useAuth: () => ({ temPapel }),
}));

function montar(caminho: string) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <AjudaDaTela />
    </MemoryRouter>,
  );
}

/**
 * O que se testa aqui é o que quebra em silêncio.
 *
 * O modal abrir e o texto aparecer é visível a olho nu e a revisão de código
 * pega. O que ninguém vê é o botão de ícone ficar sem nome acessível (para o
 * leitor de tela ele vira "botão", sem mais nada), a descrição do diálogo não
 * estar ligada por `aria-describedby`, ou o foco não voltar para o botão ao
 * fechar — quem navega por teclado recomeça do topo da página.
 */
describe('AjudaDaTela', () => {
  it('dá nome acessível ao botão, e não ao ícone', async () => {
    temPapel.mockReturnValue(false);
    montar('/dashboard');

    // `getByRole` com `name` só encontra se o nome acessível existir de fato —
    // um `title` no <svg> não produziria este resultado.
    const botao = screen.getByRole('button', {
      name: /ajuda sobre a tela painel inicial/i,
    });
    expect(botao).toBeInTheDocument();
    // Ícone dentro de botão que já tem nome é decorativo: anunciá-lo de novo
    // faria o leitor de tela repetir a mesma coisa duas vezes.
    expect(botao.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('abre o modal com o resumo ligado como descrição acessível', async () => {
    temPapel.mockReturnValue(false);
    const usuario = userEvent.setup();
    montar('/dashboard');

    await usuario.click(screen.getByRole('button', { name: /ajuda sobre a tela/i }));

    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveAccessibleName('Painel inicial');
    // Prova o elo do `aria-describedby`. Um `toHaveTextContent` passaria mesmo
    // com o atributo apontando para o nada.
    expect(dialogo).toHaveAccessibleDescription(/panorama de tudo que está em andamento/i);
  });

  it('devolve o foco ao botão ao fechar pelo Escape', async () => {
    temPapel.mockReturnValue(false);
    const usuario = userEvent.setup();
    montar('/dashboard');

    const botao = screen.getByRole('button', { name: /ajuda sobre a tela/i });
    await usuario.click(botao);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await usuario.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Sem isto o foco cai no <body> e o próximo Tab recomeça do topo da tela.
    expect(botao).toHaveFocus();
  });

  it('troca o conteúdo inteiro, e não só um adendo, para o cliente', async () => {
    const usuario = userEvent.setup();

    temPapel.mockReturnValue(false);
    const { unmount } = montar('/nao-conformidades');
    await usuario.click(screen.getByRole('button', { name: /ajuda sobre a tela/i }));
    // Equipe: o texto fala em avaliar a resposta de quem respondeu.
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Não conformidades');
    expect(screen.getByText(/a equipe registrou o problema/i)).toBeInTheDocument();
    expect(screen.queryByText(/a bola está com você/i)).not.toBeInTheDocument();
    unmount();

    temPapel.mockReturnValue(true);
    montar('/nao-conformidades');
    await usuario.click(screen.getByRole('button', { name: /ajuda sobre a tela/i }));
    // Cliente: título, resumo e tópicos são outros — ele responde, não avalia.
    expect(screen.getByRole('dialog')).toHaveAccessibleName('O que precisa da sua resposta');
    expect(screen.getByText(/a bola está com você/i)).toBeInTheDocument();
    expect(screen.queryByText(/a equipe registrou o problema/i)).not.toBeInTheDocument();
  });

  it('não oferece ao cliente um próximo passo para tela restrita', async () => {
    const usuario = userEvent.setup();

    // Para a equipe, o passo seguinte de /produtos é /categorias — restrita.
    temPapel.mockReturnValue(false);
    const { unmount } = montar('/produtos');
    await usuario.click(screen.getByRole('button', { name: /ajuda sobre a tela/i }));
    expect(screen.getByRole('link', { name: /categorias definem a trilha/i })).toHaveAttribute(
      'href',
      '/categorias',
    );
    unmount();

    // Para o cliente, o mesmo botão precisa levar a uma tela que ele abre —
    // herdar o da equipe o mandaria para "sem permissão".
    temPapel.mockReturnValue(true);
    montar('/produtos');
    await usuario.click(screen.getByRole('button', { name: /ajuda sobre a tela/i }));
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/certificacoes');
  });

  it('nomeia o botão com o título que o papel vai ler', async () => {
    // O nome acessível sai do verbete resolvido: se ele viesse do texto da
    // equipe, o cliente ouviria o nome de uma tela cujo conteúdo ele não vê.
    temPapel.mockReturnValue(true);
    montar('/nao-conformidades');

    expect(
      screen.getByRole('button', { name: /ajuda sobre a tela o que precisa da sua resposta/i }),
    ).toBeInTheDocument();
  });

  it('não renderiza botão em tela sem verbete', () => {
    temPapel.mockReturnValue(false);
    // Melhor nenhum botão do que um botão que abre um modal vazio. A garantia
    // de que nenhuma tela do painel cai neste caso está em conteudo-ajuda.test.
    montar('/login');

    expect(screen.queryByRole('button', { name: /ajuda sobre a tela/i })).not.toBeInTheDocument();
  });
});
