import { describe, expect, it } from 'vitest';

import {
  formatarBytes,
  formatoDeSaida,
  LIMITE_ENVIO_BYTES,
  PAPEL_PAREDE,
  PERFIL,
} from '@/lib/imagem';

/**
 * O que se protege aqui é o que quebra em SILÊNCIO.
 *
 * Uma logo PNG transparente convertida para JPEG não gera erro nenhum: o
 * upload conclui, o servidor aceita, e o admin descobre depois que a marca
 * ganhou um retângulo preto atrás. Nada nisso produz stack trace, e o
 * `prepararImagem` completo não é testável em jsdom (não há `canvas.toBlob`
 * sem trazer uma dependência nativa) — mas a decisão de formato é uma função
 * pura, e é ela que carrega a regra.
 */
describe('formatoDeSaida', () => {
  it('preserva transparência: PNG sai como WebP, nunca JPEG', () => {
    expect(formatoDeSaida('image/png')).toBe('image/webp');
  });

  it('preserva transparência: GIF sai como WebP, nunca JPEG', () => {
    expect(formatoDeSaida('image/gif')).toBe('image/webp');
  });

  it('WebP continua WebP', () => {
    expect(formatoDeSaida('image/webp')).toBe('image/webp');
  });

  it('JPEG, que não tem alfa, sai como JPEG', () => {
    expect(formatoDeSaida('image/jpeg')).toBe('image/jpeg');
  });
});

describe('limites de envio', () => {
  /**
   * O corte da plataforma é 4,5 MB e é feito ANTES da função rodar: o 413 sai
   * sem passar pelo middleware de CORS e o navegador acusa "blocked by CORS
   * policy". Passar deste valor devolve aquele erro enganoso.
   */
  it('fica abaixo do corte de 4,5 MB da Vercel', () => {
    expect(LIMITE_ENVIO_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });

  it('o papel de parede cobre mais que o perfil: ele preenche a janela', () => {
    expect(PAPEL_PAREDE.ladoMaximo).toBeGreaterThan(PERFIL.ladoMaximo);
  });
});

describe('formatarBytes', () => {
  it('usa vírgula decimal, como o resto do painel', () => {
    expect(formatarBytes(2.4 * 1024 * 1024)).toBe('2,4 MB');
  });

  it('escolhe a unidade pelo tamanho', () => {
    expect(formatarBytes(512)).toBe('512 B');
    expect(formatarBytes(2048)).toBe('2 KB');
  });
});
