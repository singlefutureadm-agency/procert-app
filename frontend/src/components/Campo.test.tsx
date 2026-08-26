import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Campo } from './Campo';

/**
 * `Campo` existe para corrigir um `<label>` órfão que existia em **todo**
 * formulário do painel. As três consequências daquele bug não produzem erro
 * nenhum — a tela continua bonita e funcional para quem enxerga:
 *
 * 1. o leitor de tela anuncia "caixa de texto" sem dizer qual;
 * 2. clicar no rótulo não foca o campo;
 * 3. a mensagem de erro não é lida por quem chega ao campo via Tab.
 *
 * É exatamente o tipo de regressão que passa em revisão de código e em teste
 * manual. Por isso as asserções aqui são sobre a **relação** rótulo↔controle,
 * não sobre o HTML.
 */

describe('Campo', () => {
  it('associa o rótulo ao controle — o teste é conseguir achar pelo rótulo', () => {
    render(
      <Campo label="Nome / Razão social">
        <input type="text" />
      </Campo>,
    );

    // `getByLabelText` só encontra se a associação existir de verdade.
    expect(screen.getByLabelText('Nome / Razão social')).toBeInTheDocument();
  });

  it('clicar no rótulo foca o campo', async () => {
    const usuario = userEvent.setup();
    render(
      <Campo label="E-mail">
        <input type="email" />
      </Campo>,
    );

    await usuario.click(screen.getByText('E-mail'));
    expect(screen.getByLabelText('E-mail')).toHaveFocus();
  });

  it('liga a mensagem de erro ao campo e marca aria-invalid', () => {
    render(
      <Campo label="CNPJ" erro="Documento inválido.">
        <input type="text" />
      </Campo>,
    );

    const controle = screen.getByLabelText('CNPJ');
    expect(controle).toHaveAccessibleDescription('Documento inválido.');
    expect(controle).toHaveAttribute('aria-invalid', 'true');
    // `role="alert"` para o erro ser anunciado assim que aparece.
    expect(screen.getByRole('alert')).toHaveTextContent('Documento inválido.');
  });

  it('liga a dica ao campo quando não há erro', () => {
    render(
      <Campo label="Responsável" dica="Não altera permissões.">
        <input type="text" />
      </Campo>,
    );

    expect(screen.getByLabelText('Responsável')).toHaveAccessibleDescription(
      'Não altera permissões.',
    );
  });

  it('com erro, a dica sai do DOM e do aria-describedby', () => {
    /*
     * Descrever um elemento que não está no DOM deixa o leitor de tela sem
     * nada para ler — pior que não descrever. Como a dica some visualmente
     * quando há erro, ela precisa sair da descrição junto.
     */
    render(
      <Campo label="CEP" dica="Só números." erro="CEP inválido.">
        <input type="text" />
      </Campo>,
    );

    expect(screen.queryByText('Só números.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('CEP')).toHaveAccessibleDescription(
      'CEP inválido.',
    );
  });

  it('preserva um id já definido no ponto de uso', () => {
    // Ele pode estar referenciado em outro lugar; sobrescrever quebraria o elo.
    render(
      <Campo label="Categoria">
        <select id="categoria-do-produto" />
      </Campo>,
    );

    expect(screen.getByLabelText('Categoria')).toHaveAttribute(
      'id',
      'categoria-do-produto',
    );
  });

  it('marca o asterisco de obrigatório como decorativo', () => {
    render(
      <Campo label="Nome" obrigatorio>
        <input type="text" />
      </Campo>,
    );

    // Sem `aria-hidden` o leitor de tela lê "Nome asterisco".
    const asterisco = screen.getByText('*', { exact: false, selector: 'span' });
    expect(asterisco).toHaveAttribute('aria-hidden');
  });

  it('funciona com select e textarea, não só com input', () => {
    render(
      <>
        <Campo label="UF">
          <select>
            <option>SC</option>
          </select>
        </Campo>
        <Campo label="Descrição">
          <textarea />
        </Campo>
      </>,
    );

    expect(screen.getByLabelText('UF')).toBeInTheDocument();
    expect(screen.getByLabelText('Descrição')).toBeInTheDocument();
  });
});
