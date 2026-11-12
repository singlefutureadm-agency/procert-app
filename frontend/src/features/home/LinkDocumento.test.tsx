import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LinkDocumento } from './LinkDocumento';

const ARQUIVO = '/documentos/manual-da-qualidade.pdf';

function montar() {
  render(
    <LinkDocumento arquivo={ARQUIVO} titulo="Manual da Qualidade">
      Manual
    </LinkDocumento>,
  );
  return screen.getByRole('link', { name: 'Manual' });
}

describe('LinkDocumento', () => {
  it('continua sendo um link real para o PDF', () => {
    const link = montar();
    expect(link).toHaveAttribute('href', ARQUIVO);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('o clique simples abre o visualizador, com baixar e abrir em nova aba', () => {
    fireEvent.click(montar());

    expect(screen.getByRole('dialog', { name: 'Manual da Qualidade' })).toBeInTheDocument();
    expect(screen.getByTitle('Manual da Qualidade').tagName).toBe('IFRAME');
    expect(screen.getByRole('link', { name: 'Baixar PDF' })).toHaveAttribute('download');
    expect(screen.getByRole('link', { name: 'Abrir em nova aba' })).toHaveAttribute(
      'href',
      ARQUIVO,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Ctrl+clique segue o link nativo, sem modal', () => {
    fireEvent.click(montar(), { ctrlKey: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('em tela estreita deixa o leitor do aparelho abrir o PDF', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    fireEvent.click(montar());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
