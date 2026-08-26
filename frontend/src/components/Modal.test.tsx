import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from './Modal';

/**
 * Cada asserção aqui corresponde a um bug de foco que já aconteceu.
 *
 * Nada disso quebra visivelmente: o modal abre, fecha e parece certo. O que
 * quebra é a navegação por teclado — foco no `<body>`, Tab escapando para trás
 * da cortina, Enter caindo no botão destrutivo. Sintomas que só quem navega
 * sem mouse encontra, e que revisão de código não pega.
 */

/** Modal controlado por um botão externo, para exercitar a devolução do foco. */
function Palco({
  comFocoInicial = false,
  aoFechar,
}: {
  comFocoInicial?: boolean;
  aoFechar?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const cancelar = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button type="button" onClick={() => setAberto(true)}>
        Abrir
      </button>

      <Modal
        aberto={aberto}
        titulo="Confirmar exclusão"
        comBotaoFechar
        focoInicial={comFocoInicial ? cancelar : undefined}
        aoFechar={() => {
          setAberto(false);
          aoFechar?.();
        }}
      >
        <button type="button">Excluir</button>
        <button type="button" ref={cancelar}>
          Cancelar
        </button>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('não renderiza nada quando fechado', () => {
    render(<Palco />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('é um diálogo modal com nome acessível', async () => {
    const usuario = userEvent.setup();
    render(<Palco />);

    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));

    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    expect(dialogo).toHaveAccessibleName('Confirmar exclusão');
  });

  it('foca o primeiro focável ao abrir', async () => {
    const usuario = userEvent.setup();
    render(<Palco />);

    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    // Com `comBotaoFechar`, o X é o primeiro do DOM.
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();
  });

  it('respeita focoInicial — num modal destrutivo, Enter não pode destruir', async () => {
    const usuario = userEvent.setup();
    render(<Palco comFocoInicial />);

    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('DEVOLVE o foco a quem abriu ao fechar', async () => {
    /*
     * Sem isto o foco cai no `<body>` e o Tab seguinte recomeça do topo da
     * página — na trilha de etapas, refazer a navegação inteira.
     *
     * É também o caso que o `autoFocus` no JSX quebrava: o React o aplicava
     * antes do efeito, a "origem" gravada virava um botão de dentro do modal, e
     * o `.focus()` da limpeza caía num nó já removido do DOM.
     */
    const usuario = userEvent.setup();
    render(<Palco />);

    const abrir = screen.getByRole('button', { name: 'Abrir' });
    await usuario.click(abrir);
    await usuario.keyboard('{Escape}');

    expect(abrir).toHaveFocus();
  });

  it('fecha no Escape', async () => {
    const aoFechar = vi.fn();
    const usuario = userEvent.setup();
    render(<Palco aoFechar={aoFechar} />);

    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    await usuario.keyboard('{Escape}');

    expect(aoFechar).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('fecha ao clicar na cortina, mas NÃO ao clicar dentro da caixa', async () => {
    const aoFechar = vi.fn();
    const usuario = userEvent.setup();
    render(<Palco aoFechar={aoFechar} />);

    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));

    // Clique dentro não pode fechar: perderia o que foi digitado num formulário.
    await usuario.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(aoFechar).not.toHaveBeenCalled();

    await usuario.click(screen.getByRole('dialog'));
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it('prende o Tab: do último volta para o primeiro', async () => {
    /*
     * Sem a trava o foco sai por trás da cortina e segue navegando a página
     * bloqueada — quem enxerga vê o anel sumir, quem usa leitor de tela passa a
     * ouvir uma tela que não pode operar.
     */
    const usuario = userEvent.setup();
    render(<Palco />);

    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));

    const fechar = screen.getByRole('button', { name: 'Fechar' });
    const cancelar = screen.getByRole('button', { name: 'Cancelar' });

    // Fechar → Excluir → Cancelar (último) → volta para Fechar.
    await usuario.tab();
    await usuario.tab();
    expect(cancelar).toHaveFocus();

    await usuario.tab();
    expect(fechar).toHaveFocus();
  });

  it('prende o Shift+Tab: do primeiro vai para o último', async () => {
    const usuario = userEvent.setup();
    render(<Palco />);

    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();

    await usuario.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('ignora botão desabilitado no ciclo de foco', async () => {
    /*
     * `:not([disabled])` no seletor. Um botão de ação fica desabilitado
     * enquanto a requisição corre; sem o filtro o ciclo pararia num alvo que o
     * navegador pula, e o Tab pareceria travado.
     */
    const usuario = userEvent.setup();

    function ComDesabilitado() {
      const [aberto, setAberto] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setAberto(true)}>
            Abrir
          </button>
          <Modal aberto={aberto} titulo="Salvando" aoFechar={() => setAberto(false)}>
            <button type="button">Primeiro</button>
            <button type="button" disabled>
              Salvando...
            </button>
            <button type="button">Último</button>
          </Modal>
        </>
      );
    }

    render(<ComDesabilitado />);
    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));

    expect(screen.getByRole('button', { name: 'Primeiro' })).toHaveFocus();
    await usuario.tab();
    expect(screen.getByRole('button', { name: 'Último' })).toHaveFocus();
  });

  it('sem focável dentro, foca a própria caixa para o leitor de tela entrar', async () => {
    const usuario = userEvent.setup();

    function SemFocavel() {
      const [aberto, setAberto] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setAberto(true)}>
            Abrir
          </button>
          <Modal aberto={aberto} titulo="Aviso" aoFechar={() => setAberto(false)}>
            <p>Somente leitura.</p>
          </Modal>
        </>
      );
    }

    render(<SemFocavel />);
    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));

    expect(document.activeElement).toHaveClass('modal');
  });

  it('liga o aria-describedby quando o modal descreve a ação', async () => {
    const usuario = userEvent.setup();

    function ComDescricao() {
      const [aberto, setAberto] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setAberto(true)}>
            Abrir
          </button>
          <Modal
            aberto={aberto}
            titulo="Excluir cliente"
            descritoPor="descricao-acao"
            aoFechar={() => setAberto(false)}
          >
            <p id="descricao-acao">Esta ação não pode ser desfeita.</p>
          </Modal>
        </>
      );
    }

    render(<ComDescricao />);
    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));

    // Sem isto o leitor de tela anuncia só o título, e o usuário decide sem
    // nunca ouvir o que a ação faz.
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'Esta ação não pode ser desfeita.',
    );
  });
});
