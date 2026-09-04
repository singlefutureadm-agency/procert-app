import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CampoImagem } from './CampoImagem';

/**
 * A amostra de `CampoImagem` quebra **em silêncio**, e por isso está aqui.
 *
 * O caminho vem relativo da API (`/uploads/aparencia/uuid.webp`). Em produção
 * a API mora em outro host (`procert-api` e `procert-app` são projetos
 * separados na Vercel), então um `src` cru é resolvido contra o domínio do
 * SITE — onde o catch-all da SPA devolve `index.html` com **status 200**. Não
 * há 404 no log, não há exceção no React: o `<img>` só falha ao decodificar
 * HTML como imagem, e o admin conclui que o upload não funcionou.
 *
 * A asserção é sobre a **passagem por `urlArquivo`**, não sobre uma URL final:
 * a origem sai de `VITE_API_URL` no build e no ambiente de teste é vazia, de
 * modo que comparar strings prontas daria igual com e sem a correção.
 */

vi.mock('@/lib/arquivos', () => ({
  urlArquivo: (caminho: string | null | undefined, padrao = '/placeholder-usuario.svg') =>
    caminho ? `https://api.teste${caminho}` : padrao,
}));

function montar(url: string | null) {
  return render(
    <CampoImagem
      rotulo="Logo — tema claro"
      descricao="Usada na sidebar."
      url={url}
      enviando={false}
      aoEnviar={() => {}}
      aoRemover={() => {}}
    />,
  );
}

describe('CampoImagem', () => {
  it('resolve o caminho relativo pela origem da API antes de exibir', () => {
    montar('/uploads/aparencia/ddffcfcc.webp');

    expect(screen.getByRole('img', { name: /Logo — tema claro/ })).toHaveAttribute(
      'src',
      'https://api.teste/uploads/aparencia/ddffcfcc.webp',
    );
  });

  it('sem imagem, não desenha um <img> de src vazio', () => {
    montar(null);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Nenhuma imagem')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar imagem' })).toBeInTheDocument();
  });

  it('com imagem, oferece substituir e remover', () => {
    montar('/uploads/aparencia/ddffcfcc.webp');

    expect(screen.getByRole('button', { name: 'Substituir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover' })).toBeInTheDocument();
  });
});
