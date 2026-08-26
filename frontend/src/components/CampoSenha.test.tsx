import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CampoSenha } from './CampoSenha';

describe('CampoSenha', () => {
  it('NÃO submete o formulário ao revelar a senha', async () => {
    /*
     * Este é o caso que justifica a suíte inteira deste componente. Dentro de
     * um `<form>`, o padrão de `<button>` é `submit` — sem `type="button"`,
     * clicar no olho envia o formulário. No login isso vira uma tentativa de
     * autenticação com a senha pela metade; no cadastro, um POST incompleto.
     */
    const aoEnviar = vi.fn((evento: React.FormEvent) => evento.preventDefault());
    const usuario = userEvent.setup();

    render(
      <form onSubmit={aoEnviar}>
        <CampoSenha aria-label="Senha" />
      </form>,
    );

    await usuario.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(aoEnviar).not.toHaveBeenCalled();
  });

  it('alterna entre password e text', async () => {
    const usuario = userEvent.setup();
    render(<CampoSenha aria-label="Senha" />);

    const entrada = screen.getByLabelText('Senha');
    expect(entrada).toHaveAttribute('type', 'password');

    await usuario.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(entrada).toHaveAttribute('type', 'text');

    await usuario.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(entrada).toHaveAttribute('type', 'password');
  });

  it('o nome acessível do botão anuncia a AÇÃO, e muda com o estado', async () => {
    // `aria-pressed` num ícone mudo não diria o que vai acontecer ao clicar.
    const usuario = userEvent.setup();
    render(<CampoSenha aria-label="Senha" />);

    expect(screen.getByRole('button', { name: 'Mostrar senha' })).toBeInTheDocument();
    await usuario.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toBeInTheDocument();
  });

  it('avisa em região viva quando a senha fica visível', async () => {
    /*
     * Quem não enxerga a tela não tem como saber que a senha está legível para
     * quem está ao lado.
     */
    const usuario = userEvent.setup();
    render(<CampoSenha aria-label="Senha" />);

    expect(screen.getByRole('status')).toHaveTextContent('');

    await usuario.click(screen.getByRole('button'));
    expect(screen.getByRole('status')).toHaveTextContent(
      'A senha está visível na tela.',
    );
  });

  it('não volta a ocultar sozinho ao digitar', async () => {
    // Perder a revelação no meio da digitação seria surpreendente.
    const usuario = userEvent.setup();
    render(<CampoSenha aria-label="Senha" />);

    await usuario.click(screen.getByRole('button'));
    await usuario.type(screen.getByLabelText('Senha'), 'Procert@2026');

    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'text');
  });

  it('repassa a ref, sem a qual o react-hook-form não lê o valor', async () => {
    const usuario = userEvent.setup();
    const capturada: { atual: HTMLInputElement | null } = { atual: null };

    render(
      <CampoSenha
        aria-label="Senha"
        // Corpo em bloco: no React 19 um callback de ref que RETORNA valor é
        // interpretado como função de limpeza, e o type-check reprova.
        ref={(elemento) => {
          capturada.atual = elemento;
        }}
      />,
    );

    await usuario.type(screen.getByLabelText('Senha'), 'abc123');
    expect(capturada.atual).not.toBeNull();
    expect(capturada.atual?.value).toBe('abc123');
  });

  it('preserva o aria-describedby de quem usa o componente', async () => {
    const usuario = userEvent.setup();
    render(
      <>
        <span id="regra">Mínimo de 8 caracteres.</span>
        <CampoSenha aria-label="Senha" aria-describedby="regra" />
      </>,
    );

    const entrada = screen.getByLabelText('Senha');
    expect(entrada).toHaveAccessibleDescription('Mínimo de 8 caracteres.');

    // Com a senha visível, o aviso ENTRA sem derrubar a descrição original.
    await usuario.click(screen.getByRole('button'));
    expect(entrada.getAttribute('aria-describedby')).toContain('regra');
  });
});
